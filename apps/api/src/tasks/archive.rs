use anyhow::{Context, Result};
use sqlx::PgPool;
use std::{
    fs::File,
    path::PathBuf,
};
use tracing::{error, info};
use uuid::Uuid;
use zip::write::{FileOptions, ZipWriter};



#[derive(Debug)]
pub(crate) struct ArchiveTask {
    pub job_id: Uuid,
    pub image_paths: Vec<(String, String)>, // (absolute_path, original_filename)
    pub media_root: PathBuf,
}

pub(crate) async fn process_archive_job(pool: PgPool, task: ArchiveTask) {
    let job_id = task.job_id;
    match spawn_blocking_zip(task).await {
        Ok(relative_zip_path) => {
            info!(%job_id, "Archive job completed successfully");
            let _ = sqlx::query(
                r#"
                UPDATE download_jobs
                SET status = 'completed', file_path = $1, completed_at = now()
                WHERE id = $2
                "#,
            )
            .bind(relative_zip_path)
            .bind(job_id)
            .execute(&pool)
            .await
            .inspect_err(|e| error!(%job_id, %e, "Failed to update job status to completed"));
        }
        Err(e) => {
            error!(%job_id, %e, "Archive job failed");
            let _ = sqlx::query(
                r#"
                UPDATE download_jobs
                SET status = 'failed', error_message = $1
                WHERE id = $2
                "#,
            )
            .bind(e.to_string())
            .bind(job_id)
            .execute(&pool)
            .await
            .inspect_err(|e| error!(%job_id, %e, "Failed to update job status to failed"));
        }
    }
}

async fn spawn_blocking_zip(task: ArchiveTask) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let downloads_dir = task.media_root.join("downloads");
        std::fs::create_dir_all(&downloads_dir)
            .context("failed to create downloads directory")?;

        let zip_filename = format!("{}.zip", task.job_id);
        let zip_path = downloads_dir.join(&zip_filename);
        let file = File::create(&zip_path).context("failed to create zip file")?;

        let mut zip = ZipWriter::new(file);
        let options: FileOptions<()> = FileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .large_file(true);

        for (abs_path, original_filename) in task.image_paths {
            let mut img_file = File::open(&abs_path).context(format!("failed to open image: {}", abs_path))?;
            zip.start_file(original_filename, options)
                .context("failed to start zip file entry")?;
            std::io::copy(&mut img_file, &mut zip).context("failed to write to zip")?;
        }

        zip.finish().context("failed to finish zip archive")?;

        Ok(format!("downloads/{}", zip_filename))
    })
    .await
    .context("blocking task panicked")?
}
