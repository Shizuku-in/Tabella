use std::fmt;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Rating {
    Safe,
    Suggestive,
    Explicit,
}

impl Rating {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Safe => "safe",
            Self::Suggestive => "suggestive",
            Self::Explicit => "explicit",
        }
    }
}

impl fmt::Display for Rating {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SidecarMetadata {
    pub tags: Vec<String>,
    pub rating: Rating,
}

pub fn sidecar_path_for_image(image_path: &Path) -> Result<PathBuf> {
    let file_name = image_path.file_name().and_then(|name| name.to_str());
    if file_name.is_none() {
        bail!(
            "image path does not include a file name: {}",
            image_path.display()
        );
    }

    Ok(image_path.with_extension("json"))
}

pub fn metadata_to_pretty_json(metadata: &SidecarMetadata) -> Result<String> {
    let mut json = serde_json::to_string_pretty(metadata)?;
    json.push('\n');
    Ok(json)
}

pub fn write_sidecar(path: &Path, metadata: &SidecarMetadata) -> Result<()> {
    let file = File::create(path)
        .with_context(|| format!("failed to create sidecar file {}", path.display()))?;
    let mut writer = BufWriter::new(file);
    serde_json::to_writer_pretty(&mut writer, metadata)
        .with_context(|| format!("failed to write sidecar JSON {}", path.display()))?;
    use std::io::Write as _;
    writer.write_all(b"\n")?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{Rating, SidecarMetadata, metadata_to_pretty_json, sidecar_path_for_image};

    #[test]
    fn sidecar_path_replaces_image_extension() {
        let path = sidecar_path_for_image(Path::new(r"folder\image.png")).unwrap();
        assert_eq!(path, Path::new(r"folder\image.json"));
    }

    #[test]
    fn sidecar_json_matches_expected_shape() {
        let metadata = SidecarMetadata {
            tags: vec![
                String::from("character:asuna"),
                String::from("general:1girl"),
                String::from("artist:anmi"),
            ],
            rating: Rating::Safe,
        };

        let json = metadata_to_pretty_json(&metadata).unwrap();
        assert_eq!(
            json,
            "{\n  \"tags\": [\n    \"character:asuna\",\n    \"general:1girl\",\n    \"artist:anmi\"\n  ],\n  \"rating\": \"safe\"\n}\n"
        );
    }
}
