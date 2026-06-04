use std::collections::BTreeSet;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use csv::ReaderBuilder;
use hf_hub::api::sync::Api;

pub const DEFAULT_MODEL_REPO: &str = "SmilingWolf/wd-vit-tagger-v3";
const MODEL_FILENAME: &str = "model.onnx";
const LABELS_FILENAME: &str = "selected_tags.csv";

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
    pub model_path: PathBuf,
    pub labels_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct Label {
    pub name: String,
    pub category: u32,
    pub namespace: Option<TagNamespace>,
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
    pub fn from_csv_path(path: &PathBuf) -> Result<Self> {
        let mut reader = ReaderBuilder::new()
            .has_headers(true)
            .from_path(path)
            .with_context(|| format!("failed to open labels CSV {}", path.display()))?;

        let mut labels = Vec::new();
        let mut available_namespaces = BTreeSet::new();
        let mut found_rating = false;

        for row in reader.deserialize::<CsvLabelRow>() {
            let row =
                row.with_context(|| format!("failed to parse labels CSV {}", path.display()))?;
            let namespace = category_to_namespace(row.category);
            if let Some(namespace) = namespace {
                available_namespaces.insert(namespace);
            }
            if row.category == 9 {
                found_rating = true;
            }

            labels.push(Label {
                name: row.name.trim().to_lowercase(),
                category: row.category,
                namespace,
            });
        }

        let missing_required = missing_required_capabilities(&available_namespaces, found_rating);
        if !missing_required.is_empty() {
            let missing = missing_required
                .iter()
                .map(|capability| capability.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            bail!("labels CSV is missing required output capabilities: {missing}");
        }

        Ok(Self {
            labels,
            available_namespaces,
        })
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
}

#[derive(Debug, serde::Deserialize)]
struct CsvLabelRow {
    name: String,
    category: u32,
}

pub fn download_model_artifacts(model_repo: &str) -> Result<ModelArtifacts> {
    let api = Api::new().context("failed to initialize Hugging Face API client")?;
    let repo = api.model(model_repo.to_owned());

    let model_path = repo
        .get(MODEL_FILENAME)
        .with_context(|| format!("failed to download {MODEL_FILENAME} from {model_repo}"))?;
    let labels_path = repo
        .get(LABELS_FILENAME)
        .with_context(|| format!("failed to download {LABELS_FILENAME} from {model_repo}"))?;

    Ok(ModelArtifacts {
        model_path,
        labels_path,
    })
}

pub fn category_to_namespace(category: u32) -> Option<TagNamespace> {
    match category {
        0 => Some(TagNamespace::General),
        1 => Some(TagNamespace::Artist),
        3 => Some(TagNamespace::Parody),
        4 => Some(TagNamespace::Character),
        _ => None,
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

    use super::{LabelSet, TagNamespace, category_to_namespace};

    #[test]
    fn category_mapping_matches_plan() {
        assert_eq!(category_to_namespace(0), Some(TagNamespace::General));
        assert_eq!(category_to_namespace(1), Some(TagNamespace::Artist));
        assert_eq!(category_to_namespace(3), Some(TagNamespace::Parody));
        assert_eq!(category_to_namespace(4), Some(TagNamespace::Character));
        assert_eq!(category_to_namespace(5), None);
    }

    #[test]
    fn labels_csv_accepts_missing_optional_categories() {
        let temp_dir = std::env::temp_dir().join(format!(
            "tagger-cli-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let csv_path = temp_dir.join("selected_tags.csv");
        fs::write(&csv_path, "name,category\n1girl,0\nasuna,4\nexplicit,9\n").unwrap();

        let labels = LabelSet::from_csv_path(&csv_path).unwrap();
        assert_eq!(labels.labels().len(), 3);
        assert_eq!(labels.startup_warnings("test/model").len(), 1);
    }

    #[test]
    fn labels_csv_rejects_missing_required_character_category() {
        let temp_dir = std::env::temp_dir().join(format!(
            "tagger-cli-test-missing-character-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let csv_path = temp_dir.join("selected_tags.csv");
        fs::write(&csv_path, "name,category\n1girl,0\nexplicit,9\n").unwrap();

        let error = LabelSet::from_csv_path(&csv_path).unwrap_err().to_string();
        assert!(error.contains("character"));
    }

    #[test]
    fn labels_csv_has_no_warnings_when_optional_categories_exist() {
        let temp_dir = std::env::temp_dir().join(format!(
            "tagger-cli-test-full-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let csv_path = temp_dir.join("selected_tags.csv");
        fs::write(
            &csv_path,
            "name,category\n1girl,0\nartist_name,1\nmy_series,3\nasuna,4\nexplicit,9\n",
        )
        .unwrap();

        let labels = LabelSet::from_csv_path(&csv_path).unwrap();
        assert!(labels.startup_warnings("test/model").is_empty());
    }
}
