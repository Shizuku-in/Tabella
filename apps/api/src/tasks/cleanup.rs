use sqlx::PgPool;
use std::path::PathBuf;
use tracing::{error, info};

pub(crate) async fn run_cleanup_worker(pool: PgPool, temp_root: PathBuf) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // Every hour

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

        // Cleanup orphaned temp_extract directories older than 24 hours
        let temp_extract_dir = temp_root.join("temp_extract");
        if temp_extract_dir.exists()
            && let Ok(mut entries) = tokio::fs::read_dir(&temp_extract_dir).await
        {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(metadata) = entry.metadata().await
                    && let Ok(modified) = metadata.modified()
                    && let Ok(elapsed) = modified.elapsed()
                    && elapsed > std::time::Duration::from_secs(24 * 3600)
                {
                    let path = entry.path();
                    if let Err(e) = tokio::fs::remove_dir_all(&path).await {
                        error!(?path, %e, "Failed to delete orphaned temp_extract directory");
                    } else {
                        info!(?path, "Deleted orphaned temp_extract directory");
                    }
                }
            }
        }

        // Cleanup orphaned uploads directories older than 24 hours
        let uploads_dir = temp_root.join("uploads");
        if uploads_dir.exists()
            && let Ok(mut entries) = tokio::fs::read_dir(&uploads_dir).await
        {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(metadata) = entry.metadata().await
                    && let Ok(modified) = metadata.modified()
                    && let Ok(elapsed) = modified.elapsed()
                    && elapsed > std::time::Duration::from_secs(24 * 3600)
                {
                    let path = entry.path();
                    if let Err(e) = tokio::fs::remove_dir_all(&path).await {
                        error!(?path, %e, "Failed to delete orphaned uploads directory");
                    } else {
                        info!(?path, "Deleted orphaned uploads directory");
                    }
                }
            }
        }
    }
}
