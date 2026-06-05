use std::path::Path;

use anyhow::{Context, Result, bail};
use image::{DynamicImage, ImageBuffer, Rgb};
use ndarray::Array4;
use ort::session::Session;
use ort::value::{TensorRef, ValueType};

use crate::model::{
    DEFAULT_MODEL_REPO, LabelKind, LabelSet, ModelArtifacts, ModelKind, ModelSpec,
    PostprocessingStyle, PreprocessingStyle, TagNamespace, download_model_artifacts,
};
use crate::sidecar::{Rating, SidecarMetadata};

const CAMIE_IMAGE_NET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const CAMIE_IMAGE_NET_STD: [f32; 3] = [0.229, 0.224, 0.225];
const CAMIE_PAD_COLOR: [u8; 3] = [124, 116, 104];

#[derive(Debug, Clone)]
pub struct Thresholds {
    pub general: f32,
    pub artist: f32,
    pub parody: f32,
    pub character: f32,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            general: 0.35,
            artist: 0.70,
            parody: 0.70,
            character: 0.85,
        }
    }
}

impl Thresholds {
    pub fn validate(&self) -> Result<()> {
        for (name, value) in [
            ("general", self.general),
            ("artist", self.artist),
            ("parody", self.parody),
            ("character", self.character),
        ] {
            if !(0.0..=1.0).contains(&value) {
                bail!("{} threshold must be between 0 and 1", name);
            }
        }

        Ok(())
    }
}

pub trait TagPredictor: Send {
    fn predict_path(&mut self, image_path: &Path) -> Result<SidecarMetadata>;
}

#[derive(Debug, Clone)]
pub struct PredictorConfig {
    pub model_kind: ModelKind,
    pub model_repo: String,
    pub thresholds: Thresholds,
}

impl Default for PredictorConfig {
    fn default() -> Self {
        Self {
            model_kind: ModelKind::Wd,
            model_repo: String::from(DEFAULT_MODEL_REPO),
            thresholds: Thresholds::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PredictorFactory {
    artifacts: ModelArtifacts,
    labels: LabelSet,
    config: PredictorConfig,
    startup_warnings: Vec<String>,
}

impl PredictorFactory {
    pub fn new(config: PredictorConfig) -> Result<Self> {
        config.thresholds.validate()?;
        let artifacts = download_model_artifacts(config.model_kind, &config.model_repo)?;
        let labels = LabelSet::from_path(config.model_kind, &artifacts.metadata_path)?;
        let startup_warnings = labels.startup_warnings(&config.model_repo);

        Ok(Self {
            artifacts,
            labels,
            config,
            startup_warnings,
        })
    }

    pub fn create(&self) -> Result<OnnxTaggerPredictor> {
        OnnxTaggerPredictor::new(
            self.artifacts.clone(),
            self.labels.clone(),
            self.config.thresholds.clone(),
        )
    }

    pub fn startup_warnings(&self) -> &[String] {
        &self.startup_warnings
    }
}

pub struct OnnxTaggerPredictor {
    session: Session,
    labels: LabelSet,
    input_size: usize,
    thresholds: Thresholds,
    spec: ModelSpec,
}

impl OnnxTaggerPredictor {
    pub fn new(
        artifacts: ModelArtifacts,
        labels: LabelSet,
        thresholds: Thresholds,
    ) -> Result<Self> {
        let session = Session::builder()?
            .commit_from_file(&artifacts.model_path)
            .with_context(|| {
                format!(
                    "failed to load ONNX model {}",
                    artifacts.model_path.display()
                )
            })?;

        let input = session
            .inputs()
            .first()
            .context("model does not expose an input tensor")?;

        if !matches!(input.dtype(), ValueType::Tensor { .. }) {
            bail!("model input is not a tensor");
        }

        let shape = input
            .dtype()
            .tensor_shape()
            .context("model input is not a tensor")?;
        let input_size = input_size_from_shape(artifacts.spec, shape)?;

        Ok(Self {
            session,
            labels,
            input_size,
            thresholds,
            spec: artifacts.spec,
        })
    }

    fn prepare_input(&self, image_path: &Path) -> Result<Array4<f32>> {
        match self.spec.preprocessing {
            PreprocessingStyle::Wd => prepare_wd_input(image_path, self.input_size),
            PreprocessingStyle::Camie => prepare_camie_input(image_path, self.input_size),
        }
    }
}

impl TagPredictor for OnnxTaggerPredictor {
    fn predict_path(&mut self, image_path: &Path) -> Result<SidecarMetadata> {
        let input = self.prepare_input(image_path)?;
        let thresholds = self.thresholds.clone();
        let outputs = self
            .session
            .run(ort::inputs![TensorRef::from_array_view(&input)?])?;

        let output_index = select_output_tensor_index(self.spec, outputs.len());
        let output = &outputs[output_index];
        let (_, raw_scores) = output.try_extract_tensor::<f32>()?;
        let scores = activate_scores(raw_scores.iter().copied(), self.spec);

        if scores.len() != self.labels.labels().len() {
            bail!(
                "model output count ({}) does not match label count ({})",
                scores.len(),
                self.labels.labels().len()
            );
        }

        let mut rating = None;
        let mut best_rating_score = f32::MIN;
        let mut selected_tags = Vec::new();

        for (label, score) in self.labels.labels().iter().zip(scores.into_iter()) {
            match label.kind {
                LabelKind::Rating => {
                    if score > best_rating_score {
                        rating = Some(map_rating_label(&label.name)?);
                        best_rating_score = score;
                    }
                }
                LabelKind::Namespace(namespace)
                    if score >= threshold_for_namespace(&thresholds, namespace) =>
                {
                    selected_tags.push((namespace, label.name.clone(), score));
                }
                LabelKind::Namespace(_) | LabelKind::Ignored => {}
            }
        }

        selected_tags.sort_by(|left, right| {
            left.0
                .display_order()
                .cmp(&right.0.display_order())
                .then_with(|| right.2.total_cmp(&left.2))
                .then_with(|| left.1.cmp(&right.1))
        });

        let tags = selected_tags
            .into_iter()
            .map(|(namespace, name, _)| format!("{}:{name}", namespace.as_str()))
            .collect();

        Ok(SidecarMetadata {
            tags,
            rating: rating.context("model did not produce a recognized rating tag")?,
        })
    }
}

fn input_size_from_shape(spec: ModelSpec, shape: &[i64]) -> Result<usize> {
    let dimension_index = match spec.preprocessing {
        PreprocessingStyle::Wd => 1,
        PreprocessingStyle::Camie => 2,
    };

    let input_size = shape
        .get(dimension_index)
        .copied()
        .filter(|value| *value > 0)
        .map(|value| value as usize)
        .context("model input height is not a concrete positive dimension")?;

    if matches!(spec.preprocessing, PreprocessingStyle::Camie) {
        let channel_count = shape
            .get(1)
            .copied()
            .filter(|value| *value > 0)
            .context("Camie model input channel count is not a concrete positive dimension")?;
        if channel_count != 3 {
            bail!("Camie model input must use 3 RGB channels, found {channel_count}");
        }
    }

    Ok(input_size)
}

fn prepare_wd_input(image_path: &Path, input_size: usize) -> Result<Array4<f32>> {
    let image = image::open(image_path)
        .with_context(|| format!("failed to open image {}", image_path.display()))?;
    let rgb = flatten_to_rgb(image, [255, 255, 255]);
    let squared = pad_to_square(&rgb, [255, 255, 255]);
    let resized = if squared.width() as usize != input_size {
        image::imageops::resize(
            &squared,
            input_size as u32,
            input_size as u32,
            image::imageops::FilterType::CatmullRom,
        )
    } else {
        squared
    };

    let mut input = Array4::<f32>::zeros((1, input_size, input_size, 3));
    for (x, y, pixel) in resized.enumerate_pixels() {
        let [r, g, b] = pixel.0;
        let yi = y as usize;
        let xi = x as usize;

        input[[0, yi, xi, 0]] = f32::from(b);
        input[[0, yi, xi, 1]] = f32::from(g);
        input[[0, yi, xi, 2]] = f32::from(r);
    }

    Ok(input)
}

fn prepare_camie_input(image_path: &Path, input_size: usize) -> Result<Array4<f32>> {
    let image = image::open(image_path)
        .with_context(|| format!("failed to open image {}", image_path.display()))?;
    let rgb = flatten_to_rgb(image, CAMIE_PAD_COLOR);
    let squared = pad_to_square(&rgb, CAMIE_PAD_COLOR);
    let resized = if squared.width() as usize != input_size {
        image::imageops::resize(
            &squared,
            input_size as u32,
            input_size as u32,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        squared
    };

    let mut input = Array4::<f32>::zeros((1, 3, input_size, input_size));
    for (x, y, pixel) in resized.enumerate_pixels() {
        let [r, g, b] = pixel.0;
        let yi = y as usize;
        let xi = x as usize;

        let channels = [r, g, b];
        for (channel_index, channel) in channels.into_iter().enumerate() {
            let normalized = f32::from(channel) / 255.0;
            input[[0, channel_index, yi, xi]] = (normalized - CAMIE_IMAGE_NET_MEAN[channel_index])
                / CAMIE_IMAGE_NET_STD[channel_index];
        }
    }

    Ok(input)
}

fn select_output_tensor_index(spec: ModelSpec, output_count: usize) -> usize {
    match spec.postprocessing {
        PostprocessingStyle::Camie if output_count >= 2 => 1,
        PostprocessingStyle::Camie | PostprocessingStyle::Wd => 0,
    }
}

fn activate_scores(scores: impl Iterator<Item = f32>, spec: ModelSpec) -> Vec<f32> {
    match spec.postprocessing {
        PostprocessingStyle::Wd => scores.collect(),
        PostprocessingStyle::Camie => scores.map(sigmoid).collect(),
    }
}

fn sigmoid(value: f32) -> f32 {
    1.0 / (1.0 + (-value).exp())
}

fn threshold_for_namespace(thresholds: &Thresholds, namespace: TagNamespace) -> f32 {
    match namespace {
        TagNamespace::General => thresholds.general,
        TagNamespace::Artist => thresholds.artist,
        TagNamespace::Parody => thresholds.parody,
        TagNamespace::Character => thresholds.character,
    }
}

fn flatten_to_rgb(image: DynamicImage, background: [u8; 3]) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut out = ImageBuffer::from_pixel(width, height, Rgb(background));

    for (x, y, pixel) in rgba.enumerate_pixels() {
        let [r, g, b, a] = pixel.0;
        let alpha = f32::from(a) / 255.0;
        let blend = |channel: u8, background_channel: u8| -> u8 {
            let value = f32::from(channel) * alpha + f32::from(background_channel) * (1.0 - alpha);
            value.round().clamp(0.0, 255.0) as u8
        };
        out.put_pixel(
            x,
            y,
            Rgb([
                blend(r, background[0]),
                blend(g, background[1]),
                blend(b, background[2]),
            ]),
        );
    }

    out
}

fn pad_to_square(
    image: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    background: [u8; 3],
) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let (width, height) = image.dimensions();
    let size = width.max(height);
    let mut out = ImageBuffer::from_pixel(size, size, Rgb(background));
    let x_offset = (size - width) / 2;
    let y_offset = (size - height) / 2;

    for (x, y, pixel) in image.enumerate_pixels() {
        out.put_pixel(x + x_offset, y + y_offset, *pixel);
    }

    out
}

fn map_rating_label(name: &str) -> Result<Rating> {
    match name {
        "general" | "safe" | "rating_general" => Ok(Rating::Safe),
        "sensitive"
        | "questionable"
        | "suggestive"
        | "rating_sensitive"
        | "rating_questionable" => Ok(Rating::Suggestive),
        "explicit" | "rating_explicit" => Ok(Rating::Explicit),
        other => bail!("unsupported rating label from model: {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ModelKind, Rating, Thresholds, activate_scores, map_rating_label,
        select_output_tensor_index,
    };

    #[test]
    fn thresholds_validate_range() {
        Thresholds::default().validate().unwrap();
        assert!(
            Thresholds {
                general: 1.5,
                ..Thresholds::default()
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn model_rating_labels_map_to_tabella_rating() {
        assert_eq!(map_rating_label("general").unwrap(), Rating::Safe);
        assert_eq!(map_rating_label("rating_general").unwrap(), Rating::Safe);
        assert_eq!(
            map_rating_label("questionable").unwrap(),
            Rating::Suggestive
        );
        assert_eq!(
            map_rating_label("rating_sensitive").unwrap(),
            Rating::Suggestive
        );
        assert_eq!(map_rating_label("explicit").unwrap(), Rating::Explicit);
        assert_eq!(
            map_rating_label("rating_explicit").unwrap(),
            Rating::Explicit
        );
    }

    #[test]
    fn camie_postprocessing_uses_refined_output_when_available() {
        let spec = ModelKind::Camie.spec();
        assert_eq!(select_output_tensor_index(spec, 3), 1);
        assert_eq!(select_output_tensor_index(spec, 1), 0);
    }

    #[test]
    fn camie_postprocessing_applies_sigmoid_to_logits() {
        let scores = activate_scores([0.0, 2.0, -2.0].into_iter(), ModelKind::Camie.spec());
        assert!((scores[0] - 0.5).abs() < 0.0001);
        assert!((scores[1] - 0.8807).abs() < 0.001);
        assert!((scores[2] - 0.1192).abs() < 0.001);
    }

    #[test]
    fn wd_postprocessing_leaves_scores_unchanged() {
        let scores = activate_scores([0.1, 0.2, 0.3].into_iter(), ModelKind::Wd.spec());
        assert_eq!(scores, vec![0.1, 0.2, 0.3]);
    }
}
