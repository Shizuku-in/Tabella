use sqlx::PgPool;
use std::path::PathBuf;
use tracing::{error, info};

pub(crate) async fn run_cleanup_worker(pool: PgPool, media_root: PathBuf) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // Every hour

    loop {
        interval.tick().await;
        info!("Running download jobs cleanup task");

        let expired_jobs = sqlx::query(
            r#"
            SELECT id, file_path
            FROM download_jobs
            WHERE expires_at < now()
            "#
        )
        .fetch_all(&pool)
        .await;

        match expired_jobs {
            Ok(jobs) => {
                for job in jobs {
                    let job_id: uuid::Uuid = sqlx::Row::try_get(&job, "id").unwrap();
                    let file_path: Option<String> = sqlx::Row::try_get(&job, "file_path").unwrap();

                    if let Some(file_path) = file_path {
                        let abs_path = media_root.join(&file_path);
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
    }
}
