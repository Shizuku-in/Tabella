use std::{fmt, marker::PhantomData, str::FromStr};

use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, SeqAccess, Visitor},
};

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
    pub(crate) original_url: Option<String>,
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

#[cfg(test)]
mod tests {
    use axum::http::Uri;
    use axum_extra::extract::Query;

    use super::{ListImagesQuery, Rating};

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
