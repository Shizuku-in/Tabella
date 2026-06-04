use std::path::Path;

use anyhow::{Context, Result, bail};
use image::{DynamicImage, ImageBuffer, Rgb};
use ndarray::Array4;
use ort::session::Session;
use ort::value::{TensorRef, ValueType};

use crate::model::{
    DEFAULT_MODEL_REPO, LabelSet, ModelArtifacts, TagNamespace, download_model_artifacts,
};
use crate::sidecar::{Rating, SidecarMetadata};

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
    pub model_repo: String,
    pub thresholds: Thresholds,
}

impl Default for PredictorConfig {
    fn default() -> Self {
        Self {
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
        let artifacts = download_model_artifacts(&config.model_repo)?;
        let labels = LabelSet::from_csv_path(&artifacts.labels_path)?;
        let startup_warnings = labels.startup_warnings(&config.model_repo);

        Ok(Self {
            artifacts,
            labels,
            config,
            startup_warnings,
        })
    }

    pub fn create(&self) -> Result<WdTaggerPredictor> {
        WdTaggerPredictor::new(
            self.artifacts.clone(),
            self.labels.clone(),
            self.config.thresholds.clone(),
        )
    }

    pub fn startup_warnings(&self) -> &[String] {
        &self.startup_warnings
    }
}

pub struct WdTaggerPredictor {
    session: Session,
    labels: LabelSet,
    input_size: usize,
    thresholds: Thresholds,
}

impl WdTaggerPredictor {
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
        let shape = input
            .dtype()
            .tensor_shape()
            .context("model input is not a tensor")?;
        let input_size = shape
            .get(1)
            .copied()
            .filter(|value| *value > 0)
            .map(|value| value as usize)
            .context("model input height is not a concrete positive dimension")?;

        if !matches!(input.dtype(), ValueType::Tensor { .. }) {
            bail!("model input is not a tensor");
        }

        Ok(Self {
            session,
            labels,
            input_size,
            thresholds,
        })
    }

    fn prepare_input(&self, image_path: &Path) -> Result<Array4<f32>> {
        let image = image::open(image_path)
            .with_context(|| format!("failed to open image {}", image_path.display()))?;
        let rgb = flatten_to_rgb(image);
        let squared = pad_to_square(&rgb);
        let resized = if squared.width() as usize != self.input_size {
            image::imageops::resize(
                &squared,
                self.input_size as u32,
                self.input_size as u32,
                image::imageops::FilterType::CatmullRom,
            )
        } else {
            squared
        };

        let mut input = Array4::<f32>::zeros((1, self.input_size, self.input_size, 3));
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
}

impl TagPredictor for WdTaggerPredictor {
    fn predict_path(&mut self, image_path: &Path) -> Result<SidecarMetadata> {
        let input = self.prepare_input(image_path)?;
        let thresholds = self.thresholds.clone();
        let outputs = self
            .session
            .run(ort::inputs![TensorRef::from_array_view(&input)?])?;

        let output = &outputs[0];
        let (_, scores) = output.try_extract_tensor::<f32>()?;

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

        for (label, score) in self.labels.labels().iter().zip(scores.iter().copied()) {
            if label.category == 9 {
                if score > best_rating_score {
                    rating = Some(map_rating_label(&label.name)?);
                    best_rating_score = score;
                }
                continue;
            }

            let Some(namespace) = label.namespace else {
                continue;
            };

            if score >= threshold_for_namespace(&thresholds, namespace) {
                selected_tags.push((namespace, label.name.clone(), score));
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

fn threshold_for_namespace(thresholds: &Thresholds, namespace: TagNamespace) -> f32 {
    match namespace {
        TagNamespace::General => thresholds.general,
        TagNamespace::Artist => thresholds.artist,
        TagNamespace::Parody => thresholds.parody,
        TagNamespace::Character => thresholds.character,
    }
}

fn flatten_to_rgb(image: DynamicImage) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut out = ImageBuffer::from_pixel(width, height, Rgb([255, 255, 255]));

    for (x, y, pixel) in rgba.enumerate_pixels() {
        let [r, g, b, a] = pixel.0;
        let alpha = f32::from(a) / 255.0;
        let blend = |channel: u8| -> u8 {
            let value = f32::from(channel) * alpha + 255.0 * (1.0 - alpha);
            value.round().clamp(0.0, 255.0) as u8
        };
        out.put_pixel(x, y, Rgb([blend(r), blend(g), blend(b)]));
    }

    out
}

fn pad_to_square(image: &ImageBuffer<Rgb<u8>, Vec<u8>>) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let (width, height) = image.dimensions();
    let size = width.max(height);
    let mut out = ImageBuffer::from_pixel(size, size, Rgb([255, 255, 255]));
    let x_offset = (size - width) / 2;
    let y_offset = (size - height) / 2;

    for (x, y, pixel) in image.enumerate_pixels() {
        out.put_pixel(x + x_offset, y + y_offset, *pixel);
    }

    out
}

fn map_rating_label(name: &str) -> Result<Rating> {
    match name {
        "general" | "safe" => Ok(Rating::Safe),
        "sensitive" | "questionable" | "suggestive" => Ok(Rating::Suggestive),
        "explicit" => Ok(Rating::Explicit),
        other => bail!("unsupported rating label from model: {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{Rating, Thresholds, map_rating_label};

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
        assert_eq!(
            map_rating_label("questionable").unwrap(),
            Rating::Suggestive
        );
        assert_eq!(map_rating_label("explicit").unwrap(), Rating::Explicit);
    }
}
