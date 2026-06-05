use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use csv::ReaderBuilder;
use hf_hub::api::sync::Api;

pub const DEFAULT_WD_MODEL_REPO: &str = "SmilingWolf/wd-vit-tagger-v3";
pub const DEFAULT_CAMIE_MODEL_REPO: &str = "Camais03/camie-tagger-v2";
pub const DEFAULT_MODEL_REPO: &str = DEFAULT_WD_MODEL_REPO;

const WD_MODEL_FILENAME: &str = "model.onnx";
const WD_LABELS_FILENAME: &str = "selected_tags.csv";
const CAMIE_MODEL_FILENAME: &str = "camie-tagger-v2.onnx";
const CAMIE_METADATA_FILENAME: &str = "camie-tagger-v2-metadata.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum ModelKind {
    Wd,
    Camie,
}

impl Default for ModelKind {
    fn default() -> Self {
        Self::Wd
    }
}

impl ModelKind {
    pub fn spec(self) -> ModelSpec {
        match self {
            Self::Wd => ModelSpec {
                kind: self,
                default_repo: DEFAULT_WD_MODEL_REPO,
                model_filename: WD_MODEL_FILENAME,
                metadata_filename: WD_LABELS_FILENAME,
                preprocessing: PreprocessingStyle::Wd,
                postprocessing: PostprocessingStyle::Wd,
            },
            Self::Camie => ModelSpec {
                kind: self,
                default_repo: DEFAULT_CAMIE_MODEL_REPO,
                model_filename: CAMIE_MODEL_FILENAME,
                metadata_filename: CAMIE_METADATA_FILENAME,
                preprocessing: PreprocessingStyle::Camie,
                postprocessing: PostprocessingStyle::Camie,
            },
        }
    }
}

pub fn resolve_model_repo(model_kind: ModelKind, model_repo: Option<&str>) -> String {
    match model_repo {
        Some(model_repo) if !model_repo.trim().is_empty() => model_repo.trim().to_owned(),
        _ => model_kind.spec().default_repo.to_owned(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreprocessingStyle {
    Wd,
    Camie,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PostprocessingStyle {
    Wd,
    Camie,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelSpec {
    pub kind: ModelKind,
    pub default_repo: &'static str,
    pub model_filename: &'static str,
    pub metadata_filename: &'static str,
    pub preprocessing: PreprocessingStyle,
    pub postprocessing: PostprocessingStyle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TagNamespace {
    Artist,
    Character,
    Parody,
    General,
}

impl TagNamespace {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Artist => "artist",
            Self::Character => "character",
            Self::Parody => "parody",
            Self::General => "general",
        }
    }

    pub fn display_order(self) -> usize {
        match self {
            Self::Artist => 0,
            Self::Character => 1,
            Self::Parody => 2,
            Self::General => 3,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ModelArtifacts {
    pub spec: ModelSpec,
    pub model_path: PathBuf,
    pub metadata_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LabelKind {
    Namespace(TagNamespace),
    Rating,
    Ignored,
}

#[derive(Debug, Clone)]
pub struct Label {
    pub name: String,
    pub kind: LabelKind,
}

#[derive(Debug, Clone)]
pub struct LabelSet {
    labels: Vec<Label>,
    available_namespaces: BTreeSet<TagNamespace>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequiredCapability {
    General,
    Character,
    Rating,
}

impl RequiredCapability {
    fn as_str(self) -> &'static str {
        match self {
            Self::General => "general",
            Self::Character => "character",
            Self::Rating => "rating",
        }
    }
}

impl LabelSet {
    pub fn from_path(model_kind: ModelKind, path: &Path) -> Result<Self> {
        match model_kind {
            ModelKind::Wd => Self::from_wd_csv_path(path),
            ModelKind::Camie => Self::from_camie_metadata_path(path),
        }
    }

    pub fn labels(&self) -> &[Label] {
        &self.labels
    }

    pub fn startup_warnings(&self, model_repo: &str) -> Vec<String> {
        let mut missing_optional = Vec::new();
        for namespace in [TagNamespace::Artist, TagNamespace::Parody] {
            if !self.available_namespaces.contains(&namespace) {
                missing_optional.push(namespace.as_str());
            }
        }

        if missing_optional.is_empty() {
            return Vec::new();
        }

        vec![format!(
            "warning: model {model_repo} does not provide {} categories; output will only include available namespaces such as general/character/rating",
            missing_optional.join("/")
        )]
    }

    fn from_wd_csv_path(path: &Path) -> Result<Self> {
        let mut reader = ReaderBuilder::new()
            .has_headers(true)
            .from_path(path)
            .with_context(|| format!("failed to open labels CSV {}", path.display()))?;

        let mut labels = Vec::new();
        for row in reader.deserialize::<WdCsvLabelRow>() {
            let row =
                row.with_context(|| format!("failed to parse labels CSV {}", path.display()))?;
            labels.push(Label {
                name: row.name.trim().to_lowercase(),
                kind: wd_category_to_label_kind(row.category),
            });
        }

        Self::from_labels(labels)
    }

    fn from_camie_metadata_path(path: &Path) -> Result<Self> {
        let metadata_text = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read Camie metadata {}", path.display()))?;
        let metadata: CamieMetadata = serde_json::from_str(&metadata_text)
            .with_context(|| format!("failed to parse Camie metadata {}", path.display()))?;

        let idx_to_tag = metadata.dataset_info.tag_mapping.idx_to_tag;
        let tag_to_category = metadata.dataset_info.tag_mapping.tag_to_category;

        let mut labels_with_index = Vec::with_capacity(idx_to_tag.len());
        for (index, tag_name) in idx_to_tag {
            let index = index.parse::<usize>().with_context(|| {
                format!("Camie metadata contains a non-numeric tag index `{index}`")
            })?;
            let category = tag_to_category.get(&tag_name).with_context(|| {
                format!("Camie metadata is missing a category for tag `{tag_name}`")
            })?;

            labels_with_index.push((
                index,
                Label {
                    name: tag_name.trim().to_lowercase(),
                    kind: camie_category_to_label_kind(category),
                },
            ));
        }

        labels_with_index.sort_by_key(|(index, _)| *index);
        let labels = labels_with_index
            .into_iter()
            .map(|(_, label)| label)
            .collect();

        Self::from_labels(labels)
    }

    fn from_labels(labels: Vec<Label>) -> Result<Self> {
        let mut available_namespaces = BTreeSet::new();
        let mut found_rating = false;

        for label in &labels {
            match label.kind {
                LabelKind::Namespace(namespace) => {
                    available_namespaces.insert(namespace);
                }
                LabelKind::Rating => {
                    found_rating = true;
                }
                LabelKind::Ignored => {}
            }
        }

        let missing_required = missing_required_capabilities(&available_namespaces, found_rating);
        if !missing_required.is_empty() {
            let missing = missing_required
                .iter()
                .map(|capability| capability.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            bail!("metadata is missing required output capabilities: {missing}");
        }

        Ok(Self {
            labels,
            available_namespaces,
        })
    }
}

#[derive(Debug, serde::Deserialize)]
struct WdCsvLabelRow {
    name: String,
    category: u32,
}

#[derive(Debug, serde::Deserialize)]
struct CamieMetadata {
    dataset_info: CamieDatasetInfo,
}

#[derive(Debug, serde::Deserialize)]
struct CamieDatasetInfo {
    tag_mapping: CamieTagMapping,
}

#[derive(Debug, serde::Deserialize)]
struct CamieTagMapping {
    idx_to_tag: BTreeMap<String, String>,
    tag_to_category: HashMap<String, String>,
}

pub fn download_model_artifacts(model_kind: ModelKind, model_repo: &str) -> Result<ModelArtifacts> {
    let api = Api::new().context("failed to initialize Hugging Face API client")?;
    let repo = api.model(model_repo.to_owned());
    let spec = model_kind.spec();

    let model_path = repo.get(spec.model_filename).with_context(|| {
        format!(
            "failed to download {} from {model_repo}",
            spec.model_filename
        )
    })?;
    let metadata_path = repo.get(spec.metadata_filename).with_context(|| {
        format!(
            "failed to download {} from {model_repo}",
            spec.metadata_filename
        )
    })?;

    Ok(ModelArtifacts {
        spec,
        model_path,
        metadata_path,
    })
}

pub fn wd_category_to_label_kind(category: u32) -> LabelKind {
    match category {
        0 => LabelKind::Namespace(TagNamespace::General),
        1 => LabelKind::Namespace(TagNamespace::Artist),
        3 => LabelKind::Namespace(TagNamespace::Parody),
        4 => LabelKind::Namespace(TagNamespace::Character),
        9 => LabelKind::Rating,
        _ => LabelKind::Ignored,
    }
}

pub fn camie_category_to_label_kind(category: &str) -> LabelKind {
    match category.trim().to_lowercase().as_str() {
        "general" => LabelKind::Namespace(TagNamespace::General),
        "artist" => LabelKind::Namespace(TagNamespace::Artist),
        "character" => LabelKind::Namespace(TagNamespace::Character),
        "copyright" => LabelKind::Namespace(TagNamespace::Parody),
        "rating" => LabelKind::Rating,
        "meta" | "year" => LabelKind::Ignored,
        _ => LabelKind::Ignored,
    }
}

fn missing_required_capabilities(
    available_namespaces: &BTreeSet<TagNamespace>,
    found_rating: bool,
) -> Vec<RequiredCapability> {
    let mut missing = Vec::new();

    if !available_namespaces.contains(&TagNamespace::General) {
        missing.push(RequiredCapability::General);
    }
    if !available_namespaces.contains(&TagNamespace::Character) {
        missing.push(RequiredCapability::Character);
    }
    if !found_rating {
        missing.push(RequiredCapability::Rating);
    }

    missing
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        DEFAULT_CAMIE_MODEL_REPO, DEFAULT_MODEL_REPO, LabelKind, LabelSet, ModelKind, TagNamespace,
        camie_category_to_label_kind, resolve_model_repo, wd_category_to_label_kind,
    };

    #[test]
    fn default_repos_match_model_families() {
        assert_eq!(resolve_model_repo(ModelKind::Wd, None), DEFAULT_MODEL_REPO);
        assert_eq!(
            resolve_model_repo(ModelKind::Camie, None),
            DEFAULT_CAMIE_MODEL_REPO
        );
    }

    #[test]
    fn wd_category_mapping_matches_plan() {
        assert_eq!(
            wd_category_to_label_kind(0),
            LabelKind::Namespace(TagNamespace::General)
        );
        assert_eq!(
            wd_category_to_label_kind(1),
            LabelKind::Namespace(TagNamespace::Artist)
        );
        assert_eq!(
            wd_category_to_label_kind(3),
            LabelKind::Namespace(TagNamespace::Parody)
        );
        assert_eq!(
            wd_category_to_label_kind(4),
            LabelKind::Namespace(TagNamespace::Character)
        );
        assert_eq!(wd_category_to_label_kind(9), LabelKind::Rating);
        assert_eq!(wd_category_to_label_kind(5), LabelKind::Ignored);
    }

    #[test]
    fn camie_category_mapping_maps_copyright_to_parody() {
        assert_eq!(
            camie_category_to_label_kind("copyright"),
            LabelKind::Namespace(TagNamespace::Parody)
        );
        assert_eq!(camie_category_to_label_kind("rating"), LabelKind::Rating);
        assert_eq!(camie_category_to_label_kind("meta"), LabelKind::Ignored);
        assert_eq!(camie_category_to_label_kind("year"), LabelKind::Ignored);
    }

    #[test]
    fn labels_csv_accepts_missing_optional_categories() {
        let temp_dir = test_temp_dir("wd-missing-optional");
        let csv_path = temp_dir.join("selected_tags.csv");
        fs::write(&csv_path, "name,category\n1girl,0\nasuna,4\nexplicit,9\n").unwrap();

        let labels = LabelSet::from_path(ModelKind::Wd, &csv_path).unwrap();
        assert_eq!(labels.labels().len(), 3);
        assert_eq!(labels.startup_warnings("test/model").len(), 1);
    }

    #[test]
    fn labels_csv_rejects_missing_required_character_category() {
        let temp_dir = test_temp_dir("wd-missing-character");
        let csv_path = temp_dir.join("selected_tags.csv");
        fs::write(&csv_path, "name,category\n1girl,0\nexplicit,9\n").unwrap();

        let error = LabelSet::from_path(ModelKind::Wd, &csv_path)
            .unwrap_err()
            .to_string();
        assert!(error.contains("character"));
    }

    #[test]
    fn camie_metadata_parses_nested_tag_mapping() {
        let temp_dir = test_temp_dir("camie-full");
        let json_path = temp_dir.join("camie-tagger-v2-metadata.json");
        fs::write(
            &json_path,
            r#"{
  "dataset_info": {
    "tag_mapping": {
      "idx_to_tag": {
        "0": "rating_general",
        "1": "1girl",
        "2": "my_series",
        "3": "my_artist",
        "4": "asuna",
        "5": "commentary",
        "6": "year_2024"
      },
      "tag_to_category": {
        "rating_general": "rating",
        "1girl": "general",
        "my_series": "copyright",
        "my_artist": "artist",
        "asuna": "character",
        "commentary": "meta",
        "year_2024": "year"
      }
    }
  }
}"#,
        )
        .unwrap();

        let labels = LabelSet::from_path(ModelKind::Camie, &json_path).unwrap();
        assert_eq!(labels.labels().len(), 7);
        assert_eq!(labels.startup_warnings("test/model").len(), 0);

        assert_eq!(labels.labels()[0].kind, LabelKind::Rating);
        assert_eq!(
            labels.labels()[2].kind,
            LabelKind::Namespace(TagNamespace::Parody)
        );
        assert_eq!(labels.labels()[5].kind, LabelKind::Ignored);
    }

    #[test]
    fn camie_metadata_rejects_missing_required_character_category() {
        let temp_dir = test_temp_dir("camie-missing-character");
        let json_path = temp_dir.join("camie-tagger-v2-metadata.json");
        fs::write(
            &json_path,
            r#"{
  "dataset_info": {
    "tag_mapping": {
      "idx_to_tag": {
        "0": "rating_general",
        "1": "1girl"
      },
      "tag_to_category": {
        "rating_general": "rating",
        "1girl": "general"
      }
    }
  }
}"#,
        )
        .unwrap();

        let error = LabelSet::from_path(ModelKind::Camie, &json_path)
            .unwrap_err()
            .to_string();
        assert!(error.contains("character"));
    }

    fn test_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "tagger-cli-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    use std::path::PathBuf;
}
