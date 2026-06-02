use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub(crate) struct HealthResponse {
    pub(crate) status: &'static str,
    pub(crate) service: &'static str,
    pub(crate) max_download_images: usize,
    pub(crate) download_retention_hours: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum UserRole {
    Admin,
    Viewer,
}

impl TryFrom<&str> for UserRole {
    type Error = anyhow::Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "admin" => Ok(Self::Admin),
            "viewer" => Ok(Self::Viewer),
            other => Err(anyhow::anyhow!("unknown user role: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SessionUser {
    pub(crate) id: i64,
    pub(crate) username: String,
    pub(crate) role: UserRole,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct LoginRequest {
    pub(crate) username: String,
    pub(crate) password: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct AuthUserResponse {
    pub(crate) user: SessionUser,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Rating {
    Safe,
    Suggestive,
    Explicit,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ImageSort {
    #[default]
    Newest,
    Oldest,
    FilenameAsc,
    FilenameDesc,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub(crate) struct ListImagesQuery {
    #[serde(default)]
    pub(crate) include_tags: Vec<String>,
    #[serde(default)]
    pub(crate) exclude_tags: Vec<String>,
    #[serde(default)]
    pub(crate) rating: Vec<Rating>,
    #[serde(default)]
    pub(crate) sort: ImageSort,
    pub(crate) cursor: Option<String>,
    pub(crate) limit: Option<u32>,
    #[serde(default)]
    pub(crate) favorites_only: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub(crate) struct TagSuggestQuery {
    #[serde(default)]
    pub(crate) q: String,
    pub(crate) namespace: Option<String>,
    pub(crate) limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ImageListItem {
    pub(crate) id: i64,
    pub(crate) original_filename: String,
    pub(crate) thumbnail_url: String,
    pub(crate) preview_url: String,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) rating: Rating,
    pub(crate) is_favorite: bool,
    pub(crate) tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ListImagesResponse {
    pub(crate) items: Vec<ImageListItem>,
    pub(crate) next_cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct DownloadJobRequest {
    pub(crate) image_ids: Vec<i64>,
}
