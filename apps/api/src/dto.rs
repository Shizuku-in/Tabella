use std::{fmt, marker::PhantomData, str::FromStr};

use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, SeqAccess, Visitor},
};

#[derive(Debug, Clone, Serialize)]
pub(crate) struct HealthResponse {
    pub(crate) status: &'static str,
    pub(crate) service: &'static str,
    pub(crate) version: &'static str,
    pub(crate) max_download_images: usize,
    pub(crate) download_retention_hours: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum UserRole {
    Admin,
    Editor,
    Viewer,
}

impl TryFrom<&str> for UserRole {
    type Error = anyhow::Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "admin" => Ok(Self::Admin),
            "editor" => Ok(Self::Editor),
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
    pub(crate) avatar_url: Option<String>,
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

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Rating {
    Safe,
    Suggestive,
    Explicit,
}

impl Rating {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Safe => "safe",
            Self::Suggestive => "suggestive",
            Self::Explicit => "explicit",
        }
    }

    /// Ordinal used to compare ratings: `safe < suggestive < explicit`.
    pub(crate) fn level(self) -> u8 {
        match self {
            Self::Safe => 0,
            Self::Suggestive => 1,
            Self::Explicit => 2,
        }
    }
}

impl FromStr for Rating {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "safe" => Ok(Self::Safe),
            "suggestive" => Ok(Self::Suggestive),
            "explicit" => Ok(Self::Explicit),
            other => Err(format!("unknown rating: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ImageSort {
    #[default]
    Newest,
    Oldest,
    FilenameAsc,
    FilenameDesc,
    Random,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub(crate) struct ListImagesQuery {
    #[serde(default, deserialize_with = "deserialize_csv_or_repeated")]
    pub(crate) include_tags: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_csv_or_repeated")]
    pub(crate) exclude_tags: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_csv_or_repeated")]
    pub(crate) rating: Vec<Rating>,
    #[serde(default)]
    pub(crate) sort: ImageSort,
    pub(crate) seed: Option<i32>,
    pub(crate) cursor: Option<String>,
    pub(crate) limit: Option<u32>,
    #[serde(default)]
    pub(crate) favorites_only: bool,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub(crate) uploaded_after: Option<time::OffsetDateTime>,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub(crate) uploaded_before: Option<time::OffsetDateTime>,
    pub(crate) min_width: Option<u32>,
    pub(crate) min_height: Option<u32>,
    pub(crate) aspect_ratio_min: Option<f32>,
    pub(crate) aspect_ratio_max: Option<f32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub(crate) struct TagSuggestQuery {
    #[serde(default)]
    pub(crate) q: String,
    pub(crate) namespace: Option<String>,
    pub(crate) limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub(crate) struct ListTagsQuery {
    /// Filter to a single namespace (e.g. `artist`). Omit for all namespaces.
    pub(crate) namespace: Option<String>,
    /// Max results (1–500, default 100).
    pub(crate) limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UpdateImageRequest {
    pub(crate) rating: Option<Rating>,
    pub(crate) tags: Option<Vec<String>>,
    /// `Some("text")` sets the note; `Some("")` clears it; `None` leaves it unchanged.
    pub(crate) note: Option<String>,
    /// `Some("url")` sets the source; `Some("")` clears it; `None` leaves it unchanged.
    pub(crate) source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ImageUploader {
    pub(crate) id: i64,
    pub(crate) username: String,
    pub(crate) avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ImageListItem {
    pub(crate) id: i64,
    pub(crate) original_filename: String,
    pub(crate) thumbnail_url: String,
    pub(crate) preview_url: String,
    pub(crate) original_url: Option<String>,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) sha256: String,
    pub(crate) source_url: Option<String>,
    pub(crate) note: Option<String>,
    #[serde(with = "time::serde::iso8601")]
    pub(crate) imported_at: time::OffsetDateTime,
    pub(crate) rating: Rating,
    pub(crate) is_favorite: bool,
    pub(crate) tags: Vec<String>,
    pub(crate) file_size: i64,
    pub(crate) uploader: Option<ImageUploader>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ListImagesResponse {
    pub(crate) items: Vec<ImageListItem>,
    pub(crate) next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StatsResponse {
    pub(crate) total_images: i64,
    pub(crate) total_tags: i64,
    pub(crate) total_size_bytes: i64,
    pub(crate) rating_counts: RatingCounts,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct RatingCounts {
    pub(crate) safe: i64,
    pub(crate) suggestive: i64,
    pub(crate) explicit: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub(crate) struct RandomImageQuery {
    /// Exact rating set; an image matches when its rating is one of these.
    #[serde(default, deserialize_with = "deserialize_csv_or_repeated")]
    pub(crate) rating: Vec<Rating>,
    /// Upper bound (inclusive) on the rating; e.g. `suggestive` allows safe + suggestive.
    /// When neither this nor `rating` is provided, the handler defaults to `Safe`.
    #[serde(default)]
    pub(crate) max_rating: Option<Rating>,
    /// Which derivative URL to surface as the primary `url`.
    #[serde(default)]
    pub(crate) quality: DownloadQuality,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct RandomImageResponse {
    pub(crate) id: i64,
    pub(crate) url: String,
    pub(crate) quality: DownloadQuality,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) rating: Rating,
    pub(crate) original_filename: String,
    pub(crate) tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DownloadQuality {
    Thumbnail,
    Sample,
    #[default]
    Original,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct DownloadJobRequest {
    pub(crate) image_ids: Vec<i64>,
    #[serde(default)]
    pub(crate) quality: DownloadQuality,
}

fn deserialize_csv_or_repeated<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr,
    T::Err: fmt::Display,
{
    struct CsvOrRepeatedVisitor<T>(PhantomData<T>);

    impl<'de, T> Visitor<'de> for CsvOrRepeatedVisitor<T>
    where
        T: FromStr,
        T::Err: fmt::Display,
    {
        type Value = Vec<T>;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a comma-separated string or repeated query parameter values")
        }

        fn visit_none<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Vec::new())
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Vec::new())
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            parse_csv_values::<T, E>(value)
        }

        fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            parse_csv_values::<T, E>(&value)
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: SeqAccess<'de>,
        {
            let mut values = Vec::new();

            while let Some(value) = seq.next_element::<String>()? {
                values.extend(parse_csv_values::<T, A::Error>(&value)?);
            }

            Ok(values)
        }
    }

    deserializer.deserialize_any(CsvOrRepeatedVisitor(PhantomData))
}

fn parse_csv_values<T, E>(value: &str) -> Result<Vec<T>, E>
where
    T: FromStr,
    T::Err: fmt::Display,
    E: de::Error,
{
    value
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| T::from_str(part).map_err(E::custom))
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct UserResponse {
    pub(crate) id: i64,
    pub(crate) username: String,
    pub(crate) role: UserRole,
    #[serde(with = "time::serde::iso8601")]
    pub(crate) created_at: time::OffsetDateTime,
    pub(crate) avatar_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CreateUserRequest {
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) role: UserRole,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UpdateUserRequest {
    pub(crate) password: Option<String>,
    pub(crate) role: Option<UserRole>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UpdateProfileRequest {
    pub(crate) username: Option<String>,
    pub(crate) current_password: Option<String>,
    pub(crate) new_password: Option<String>,
}

#[cfg(test)]
mod tests {
    use axum::http::Uri;
    use axum_extra::extract::Query;

    use super::{DownloadQuality, ListImagesQuery, RandomImageQuery, Rating};

    #[test]
    fn random_image_query_parses_rating_set_and_quality() {
        let uri: Uri = "http://example.com/api/images/random?rating=safe,suggestive&quality=sample"
            .parse()
            .unwrap();

        let query: Query<RandomImageQuery> = Query::try_from_uri(&uri).unwrap();

        assert_eq!(query.rating, vec![Rating::Safe, Rating::Suggestive]);
        assert!(matches!(query.quality, DownloadQuality::Sample));
        // max_rating absent from query string → None (safe default applied in handler)
        assert!(query.max_rating.is_none());
    }

    #[test]
    fn random_image_query_parses_max_rating() {
        let uri: Uri = "http://example.com/api/images/random?max_rating=suggestive"
            .parse()
            .unwrap();

        let query: Query<RandomImageQuery> = Query::try_from_uri(&uri).unwrap();

        assert_eq!(query.max_rating, Some(Rating::Suggestive));
        assert!(query.rating.is_empty());
    }

    #[test]
    fn random_image_query_defaults_quality_to_original() {
        let uri: Uri = "http://example.com/api/images/random".parse().unwrap();

        let query: Query<RandomImageQuery> = Query::try_from_uri(&uri).unwrap();

        assert!(matches!(query.quality, DownloadQuality::Original));
    }

    #[test]
    fn list_images_query_accepts_repeated_rating_params() {
        let uri: Uri = "http://example.com/api/images?rating=safe&rating=explicit"
            .parse()
            .unwrap();

        let query: Query<ListImagesQuery> = Query::try_from_uri(&uri).unwrap();

        assert_eq!(query.rating, vec![Rating::Safe, Rating::Explicit]);
    }

    #[test]
    fn list_images_query_accepts_comma_separated_rating_params() {
        let uri: Uri = "http://example.com/api/images?rating=safe,explicit"
            .parse()
            .unwrap();

        let query: Query<ListImagesQuery> = Query::try_from_uri(&uri).unwrap();

        assert_eq!(query.rating, vec![Rating::Safe, Rating::Explicit]);
    }

    #[test]
    fn list_images_query_accepts_both_tag_formats() {
        let repeated_uri: Uri =
            "http://example.com/api/images?include_tags=artist%3Ajane&include_tags=series%3Alandscape"
                .parse()
                .unwrap();
        let csv_uri: Uri =
            "http://example.com/api/images?include_tags=artist%3Ajane,series%3Alandscape"
                .parse()
                .unwrap();

        let repeated_query: Query<ListImagesQuery> = Query::try_from_uri(&repeated_uri).unwrap();
        let csv_query: Query<ListImagesQuery> = Query::try_from_uri(&csv_uri).unwrap();

        assert_eq!(
            repeated_query.include_tags,
            vec!["artist:jane", "series:landscape"]
        );
        assert_eq!(
            csv_query.include_tags,
            vec!["artist:jane", "series:landscape"]
        );
    }
}
