use std::{
    env,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct DynamicConfig {
    pub(crate) max_download_images: usize,
    pub(crate) max_download_total_bytes: u64,
    pub(crate) download_retention_hours: u64,
    pub(crate) session_ttl_hours: u64,
    pub(crate) secure_cookies: bool,
    #[serde(default = "DynamicConfig::default_import_progress_batch_size")]
    pub(crate) import_progress_batch_size: usize,
    #[serde(default = "DynamicConfig::default_thumbnail_size")]
    pub(crate) thumbnail_size: u32,
    #[serde(default = "DynamicConfig::default_thumbnail_quality")]
    pub(crate) thumbnail_quality: f32,
    #[serde(default = "DynamicConfig::default_sample_size")]
    pub(crate) sample_size: u32,
    #[serde(default = "DynamicConfig::default_sample_quality")]
    pub(crate) sample_quality: f32,
}

impl DynamicConfig {
    fn default_import_progress_batch_size() -> usize {
        10
    }
    fn default_thumbnail_size() -> u32 {
        500
    }
    fn default_thumbnail_quality() -> f32 {
        75.0
    }
    fn default_sample_size() -> u32 {
        0
    }
    fn default_sample_quality() -> f32 {
        80.0
    }

    pub async fn load(pool: &PgPool, fallback: &Config) -> Self {
        let row = sqlx::query("SELECT value FROM settings WHERE key = 'global'")
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

        if let Some(row) = row
            && let Ok(value) = row.try_get::<serde_json::Value, _>("value")
            && let Ok(config) = serde_json::from_value::<DynamicConfig>(value)
        {
            return config;
        }

        Self {
            max_download_images: fallback.max_download_images,
            max_download_total_bytes: fallback.max_download_total_bytes,
            download_retention_hours: fallback.download_retention_hours,
            session_ttl_hours: fallback.session_ttl_hours,
            secure_cookies: fallback.secure_cookies,
            import_progress_batch_size: fallback.import_progress_batch_size,
            thumbnail_size: Self::default_thumbnail_size(),
            thumbnail_quality: Self::default_thumbnail_quality(),
            sample_size: Self::default_sample_size(),
            sample_quality: Self::default_sample_quality(),
        }
    }

    pub fn validate(&self) -> Result<()> {
        if self.max_download_images == 0 {
            bail!("max_download_images must be greater than 0");
        }
        if self.max_download_total_bytes == 0 {
            bail!("max_download_total_bytes must be greater than 0");
        }
        if self.download_retention_hours == 0 {
            bail!("download_retention_hours must be greater than 0");
        }
        if self.session_ttl_hours == 0 {
            bail!("session_ttl_hours must be greater than 0");
        }
        if self.import_progress_batch_size == 0 {
            bail!("import_progress_batch_size must be greater than 0");
        }
        if self.thumbnail_size < 100 || self.thumbnail_size > 4000 {
            bail!("thumbnail_size must be between 100 and 4000");
        }
        if self.thumbnail_quality < 1.0 || self.thumbnail_quality > 100.0 {
            bail!("thumbnail_quality must be between 1.0 and 100.0");
        }
        if self.sample_size != 0 && (self.sample_size < 100 || self.sample_size > 16000) {
            bail!("sample_size must be 0 (original) or between 100 and 16000");
        }
        if self.sample_quality < 1.0 || self.sample_quality > 100.0 {
            bail!("sample_quality must be between 1.0 and 100.0");
        }

        Ok(())
    }

    pub async fn save(&self, pool: &PgPool) -> Result<()> {
        self.validate()?;
        let value = serde_json::to_value(self)?;
        sqlx::query(
            "INSERT INTO settings (key, value, updated_at) VALUES ('global', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
        )
        .bind(value)
        .execute(pool)
        .await?;
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Config {
    pub(crate) listen_addr: SocketAddr,
    pub(crate) database_url: String,
    pub(crate) media_root: PathBuf,
    pub(crate) temp_root: PathBuf,
    pub(crate) session_cookie_name: String,
    pub(crate) session_ttl_hours: u64,
    pub(crate) secure_cookies: bool,
    pub(crate) bootstrap_admin_username: String,
    pub(crate) bootstrap_admin_password: String,
    pub(crate) max_download_images: usize,
    pub(crate) max_download_total_bytes: u64,
    pub(crate) download_retention_hours: u64,
    pub(crate) import_progress_batch_size: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            listen_addr: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 8787),
            database_url: String::new(),
            media_root: PathBuf::from("var/media"),
            temp_root: PathBuf::from("var/tmp"),
            session_cookie_name: String::from("tabella_session"),
            session_ttl_hours: 24 * 30,
            secure_cookies: false,
            bootstrap_admin_username: String::from("admin"),
            bootstrap_admin_password: String::from("admin"),
            max_download_images: 500,
            max_download_total_bytes: 2 * 1024 * 1024 * 1024,
            download_retention_hours: 24,
            import_progress_batch_size: 10,
        }
    }
}

impl Config {
    pub(crate) fn from_env() -> Result<Self> {
        let defaults = Self::default();

        Ok(Self {
            listen_addr: read_env("TABELLA_LISTEN_ADDR").unwrap_or(defaults.listen_addr),
            database_url: env::var("DATABASE_URL").context("DATABASE_URL is required")?,
            media_root: read_env("TABELLA_MEDIA_ROOT").unwrap_or(defaults.media_root),
            temp_root: read_env("TABELLA_TEMP_ROOT").unwrap_or(defaults.temp_root),
            session_cookie_name: env::var("TABELLA_SESSION_COOKIE_NAME")
                .unwrap_or(defaults.session_cookie_name),
            session_ttl_hours: read_env("TABELLA_SESSION_TTL_HOURS")
                .unwrap_or(defaults.session_ttl_hours),
            secure_cookies: read_env("TABELLA_SECURE_COOKIES").unwrap_or(defaults.secure_cookies),
            bootstrap_admin_username: env::var("TABELLA_BOOTSTRAP_ADMIN_USERNAME")
                .unwrap_or(defaults.bootstrap_admin_username),
            bootstrap_admin_password: env::var("TABELLA_BOOTSTRAP_ADMIN_PASSWORD")
                .unwrap_or(defaults.bootstrap_admin_password),
            max_download_images: read_env("TABELLA_MAX_DOWNLOAD_IMAGES")
                .unwrap_or(defaults.max_download_images),
            max_download_total_bytes: read_env("TABELLA_MAX_DOWNLOAD_TOTAL_BYTES")
                .unwrap_or(defaults.max_download_total_bytes),
            download_retention_hours: read_env("TABELLA_DOWNLOAD_RETENTION_HOURS")
                .unwrap_or(defaults.download_retention_hours),
            import_progress_batch_size: read_env("TABELLA_IMPORT_PROGRESS_BATCH_SIZE")
                .unwrap_or(defaults.import_progress_batch_size),
        })
    }
}

fn read_env<T>(key: &str) -> Option<T>
where
    T: std::str::FromStr,
{
    env::var(key).ok()?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::{Config, DynamicConfig};

    #[test]
    fn dynamic_config_validate_rejects_zero_values() {
        let defaults = Config::default();
        let mut config = DynamicConfig {
            max_download_images: defaults.max_download_images,
            max_download_total_bytes: defaults.max_download_total_bytes,
            download_retention_hours: defaults.download_retention_hours,
            session_ttl_hours: defaults.session_ttl_hours,
            secure_cookies: defaults.secure_cookies,
            import_progress_batch_size: defaults.import_progress_batch_size,
            thumbnail_size: DynamicConfig::default_thumbnail_size(),
            thumbnail_quality: DynamicConfig::default_thumbnail_quality(),
            sample_size: DynamicConfig::default_sample_size(),
            sample_quality: DynamicConfig::default_sample_quality(),
        };

        config.session_ttl_hours = 0;
        assert!(config.validate().is_err());

        config.session_ttl_hours = 1;
        config.max_download_images = 0;
        assert!(config.validate().is_err());
    }
}
