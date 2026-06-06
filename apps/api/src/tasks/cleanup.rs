use sqlx::PgPool;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tracing::{error, info};

const ORPHAN_TEMP_TTL: Duration = Duration::from_secs(24 * 3600);

pub(crate) async fn run_cleanup_worker(pool: PgPool, temp_root: PathBuf) {
    let mut interval = tokio::time::interval(Duration::from_secs(3600)); // Every hour

    loop {
        interval.tick().await;
        info!("Running download jobs cleanup task");

        let expired_jobs = sqlx::query(
            r#"
            SELECT id, file_path
            FROM download_jobs
            WHERE expires_at < now()
            "#,
        )
        .fetch_all(&pool)
        .await;

        match expired_jobs {
            Ok(jobs) => {
                for job in jobs {
                    let job_id: uuid::Uuid = sqlx::Row::try_get(&job, "id").unwrap();
                    let file_path: Option<String> = sqlx::Row::try_get(&job, "file_path").unwrap();

                    if let Some(file_path) = file_path {
                        let abs_path = temp_root.join(&file_path);
                        if abs_path.exists() {
                            if let Err(e) = tokio::fs::remove_file(&abs_path).await {
                                error!(%job_id, %e, "Failed to delete expired zip file");
                            } else {
                                info!(%job_id, "Deleted expired zip file");
                            }
                        }
                    }

                    // Delete the job record
                    if let Err(e) = sqlx::query("DELETE FROM download_jobs WHERE id = $1")
                        .bind(job_id)
                        .execute(&pool)
                        .await
                    {
                        error!(%job_id, %e, "Failed to delete expired job record");
                    }
                }
            }
            Err(e) => {
                error!(%e, "Failed to fetch expired download jobs");
            }
        }

        cleanup_old_child_dirs(
            &temp_root.join("temp_extract"),
            "temp_extract",
            ORPHAN_TEMP_TTL,
        )
        .await;
        cleanup_old_child_dirs(&temp_root.join("uploads"), "uploads", ORPHAN_TEMP_TTL).await;
    }
}

async fn cleanup_old_child_dirs(root: &Path, label: &str, older_than: Duration) {
    if !root.exists() {
        return;
    }

    let Ok(mut entries) = tokio::fs::read_dir(root).await else {
        return;
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let Ok(metadata) = entry.metadata().await else {
            continue;
        };

        if !metadata.is_dir() {
            continue;
        }

        let Ok(modified) = metadata.modified() else {
            continue;
        };

        let Ok(elapsed) = modified.elapsed() else {
            continue;
        };

        if elapsed <= older_than {
            continue;
        }

        let path = entry.path();
        if let Err(e) = tokio::fs::remove_dir_all(&path).await {
            error!(?path, %label, %e, "Failed to delete orphaned temp directory");
        } else {
            info!(?path, %label, "Deleted orphaned temp directory");
        }
    }
}
