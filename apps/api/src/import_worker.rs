use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::PgPool;
use tokio::time::sleep;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::config::Config;
use crate::image_processor::{compute_sha256, process_image};

pub(crate) async fn start_worker(pool: PgPool, config: Config) {
    tracing::info!("Starting background import worker");
    loop {
        if let Err(e) = process_next_job(&pool, &config).await {
            tracing::error!("Import worker error: {:?}", e);
        }
        sleep(Duration::from_secs(5)).await;
    }
}

async fn process_next_job(pool: &PgPool, config: &Config) -> Result<()> {
    #[derive(sqlx::FromRow)]
    struct JobRow {
        id: Uuid,
        source_archive_path: String,
        source_type: String,
    }

    let job: Option<JobRow> = sqlx::query_as(
        r#"
        UPDATE import_jobs
        SET status = 'running', started_at = now(), updated_at = now()
        WHERE id = (
            SELECT id FROM import_jobs 
            WHERE status = 'queued' 
            ORDER BY created_at ASC 
            FOR UPDATE SKIP LOCKED 
            LIMIT 1
        )
        RETURNING id, source_archive_path, source_type
        "#,
    )
    .fetch_optional(pool)
    .await?;

    let job = match job {
        Some(j) => j,
        None => return Ok(()),
    };

    tracing::info!("Found import job: {} (type: {})", job.id, job.source_type);

    // 2. Process the job
    let result = run_import_job(
        job.id,
        &job.source_archive_path,
        &job.source_type,
        pool,
        config,
    )
    .await;

    // 3. Finalize the job
    let final_status = match result {
        Ok(has_errors) => {
            if has_errors {
                "completed_with_errors"
            } else {
                "completed"
            }
        }
        Err(ref e) => {
            tracing::error!("Job {} failed: {:?}", job.id, e);
            "failed"
        }
    };

    let error_msg = result.err().map(|e| e.to_string());

    sqlx::query(
        r#"
        UPDATE import_jobs
        SET status = $1, finished_at = now(), updated_at = now(), last_error = $2
        WHERE id = $3
        "#,
    )
    .bind(final_status)
    .bind(error_msg)
    .bind(job.id)
    .execute(pool)
    .await?;

    Ok(())
}

async fn run_import_job(
    job_id: Uuid,
    source_path_str: &str,
    source_type: &str,
    pool: &PgPool,
    config: &Config,
) -> Result<bool> {
    let mut source_path = PathBuf::from(source_path_str);

    // If it's a package upload but the path points to the temp directory, we must find the archive inside it
    if source_type == "package" && source_path.is_dir() {
        let mut found = false;
        for entry in WalkDir::new(&source_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                let ext = entry
                    .path()
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if ext == "zip" || ext == "7z" {
                    source_path = entry.path().to_path_buf();
                    found = true;
                    break;
                }
            }
        }
        if !found {
            anyhow::bail!("No archive (zip/7z) found in package upload directory");
        }
    }

    // Collect all image files
    let mut files_to_process = Vec::new();

    if source_path.is_dir() {
        // Folder or server import: scan for images
        for entry in WalkDir::new(&source_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                let ext = entry
                    .path()
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif") {
                    files_to_process.push(entry.path().to_path_buf());
                }
            }
        }
    } else if source_path.is_file() {
        let ext = source_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if matches!(ext.as_str(), "zip") {
            tracing::info!("Extracting ZIP archive: {:?}", source_path);

            // Set status to extracting and update total items based on zip length
            sqlx::query(
                "UPDATE import_jobs SET status = 'extracting', total_items = $1, updated_at = now() WHERE id = $2"
            )
            .bind(0i32) // Will update during extraction
            .bind(job_id)
            .execute(pool)
            .await?;

            let file = std::fs::File::open(&source_path)?;
            let mut archive = zip::ZipArchive::new(file)?;
            let total_files = archive.len() as i32;

            sqlx::query(
                "UPDATE import_jobs SET total_items = $1, updated_at = now() WHERE id = $2",
            )
            .bind(total_files)
            .bind(job_id)
            .execute(pool)
            .await?;

            // Create a temporary extraction directory inside media root
            let temp_extract_dir = config
                .media_root
                .join("temp_extract")
                .join(job_id.to_string());
            std::fs::create_dir_all(&temp_extract_dir)?;

            for i in 0..archive.len() {
                let mut file = archive.by_index(i)?;
                let outpath = match file.enclosed_name() {
                    Some(path) => path.to_owned(),
                    None => continue,
                };

                let outpath = temp_extract_dir.join(outpath);
                if (*file.name()).ends_with('/') {
                    std::fs::create_dir_all(&outpath)?;
                } else {
                    if let Some(p) = outpath.parent() {
                        if !p.exists() {
                            std::fs::create_dir_all(p)?;
                        }
                    }
                    let mut outfile = std::fs::File::create(&outpath)?;
                    std::io::copy(&mut file, &mut outfile)?;

                    let out_ext = outpath
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if matches!(out_ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif") {
                        files_to_process.push(outpath);
                    }
                }

                // Report progress every 50 files
                if i % 50 == 0 && i > 0 {
                    sqlx::query(
                        "UPDATE import_jobs SET processed_items = $1, updated_at = now() WHERE id = $2"
                    )
                    .bind(i as i32)
                    .bind(job_id)
                    .execute(pool)
                    .await?;
                }
            }
        } else if matches!(ext.as_str(), "7z") {
            tracing::info!("Extracting 7Z archive: {:?}", source_path);

            sqlx::query(
                "UPDATE import_jobs SET status = 'extracting', updated_at = now() WHERE id = $1",
            )
            .bind(job_id)
            .execute(pool)
            .await?;

            let temp_extract_dir = config
                .media_root
                .join("temp_extract")
                .join(job_id.to_string());
            std::fs::create_dir_all(&temp_extract_dir)?;

            sevenz_rust::decompress_file(&source_path, &temp_extract_dir)
                .map_err(|e| anyhow::anyhow!("7z extraction failed: {:?}", e))?;

            // Collect extracted files
            for entry in WalkDir::new(&temp_extract_dir)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let ext = entry
                        .path()
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif") {
                        files_to_process.push(entry.path().to_path_buf());
                    }
                }
            }
        } else if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif") {
            files_to_process.push(source_path.clone());
        }
    } else {
        anyhow::bail!("Source path does not exist or is not a valid file/directory");
    }

    let total = files_to_process.len() as i32;
    sqlx::query(
        "UPDATE import_jobs SET status = 'processing', total_items = $1, processed_items = 0, succeeded_items = 0, failed_items = 0, updated_at = now() WHERE id = $2",
    )
    .bind(total)
    .bind(job_id)
    .execute(pool)
    .await?;

    let mut succeeded = 0;
    let mut failed = 0;
    let mut has_errors = false;

    // Create originals directory
    let originals_dir = config.media_root.join("originals");
    std::fs::create_dir_all(&originals_dir)?;

    for (index, file_path) in files_to_process.into_iter().enumerate() {
        match process_single_file(&file_path, &originals_dir, pool, config).await {
            Ok(true) => succeeded += 1,  // Success
            Ok(false) => succeeded += 1, // Skipped (already exists), user wants it counted as succeeded
            Err(e) => {
                tracing::warn!("Failed to process file {:?}: {:?}", file_path, e);
                failed += 1;
                has_errors = true;
            }
        }

        // Update progress every 10 items or at the end
        if (index + 1) % 10 == 0 || (index + 1) == total as usize {
            sqlx::query(
                "UPDATE import_jobs SET processed_items = $1, succeeded_items = $2, failed_items = $3, heartbeat_at = now(), updated_at = now() WHERE id = $4",
            )
            .bind((index + 1) as i32)
            .bind(succeeded)
            .bind(failed)
            .bind(job_id)
            .execute(pool)
            .await?;
        }
    }

    Ok(has_errors)
}

async fn process_single_file(
    file_path: &Path,
    originals_dir: &Path,
    pool: &PgPool,
    config: &Config,
) -> Result<bool> {
    // 1. Compute SHA256
    let sha256 = compute_sha256(file_path).context("failed to compute sha256")?;

    #[derive(sqlx::FromRow)]
    struct ImageId {
        #[allow(dead_code)]
        id: i64,
    }

    let existing: Option<ImageId> = sqlx::query_as("SELECT id FROM images WHERE sha256 = $1")
        .bind(&sha256)
        .fetch_optional(pool)
        .await?;

    if existing.is_some() {
        tracing::debug!("Skipping {}, already exists", sha256);
        return Ok(false); // Returning false means skipped
    }

    // 3. Process image (generate thumbnail and sample)
    let metadata = process_image(file_path, &config.media_root, &sha256)?;

    // 3.5 Read metadata JSON if exists
    let mut tags_to_insert: Vec<String> = Vec::new();
    let mut rating_to_insert = "safe".to_string();
    let json_path = file_path.with_extension("json");
    if json_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&json_path) {
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(tags_arr) = json_val.get("tags").and_then(|v| v.as_array()) {
                    for tag_val in tags_arr {
                        if let Some(tag_str) = tag_val.as_str() {
                            tags_to_insert.push(tag_str.to_string());
                        }
                    }
                }
                if let Some(rating_str) = json_val.get("rating").and_then(|v| v.as_str()) {
                    let r = rating_str.to_lowercase();
                    if r == "safe" || r == "suggestive" || r == "explicit" {
                        rating_to_insert = r;
                    }
                }
            }
        }
    }

    // 4. Move original file to media_root/originals/
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    let original_filename = format!("{}.{}", sha256, ext);
    let target_original_path = originals_dir.join(&original_filename);

    // Copy instead of move, in case it's an external library
    std::fs::copy(file_path, &target_original_path).context("failed to copy original file")?;

    let file_size = target_original_path.metadata()?.len() as i64;
    let original_filename_str = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mime_type = match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };

    // 5. Insert into DB
    let original_relative_path = format!("originals/{}", original_filename);

    let image_id: Option<i64> = sqlx::query_scalar(
        r#"
        INSERT INTO images (
            sha256, original_path, preview_path, thumbnail_path, original_filename,
            mime_type, width, height, file_size, rating
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING id
        "#,
    )
    .bind(&sha256)
    .bind(&original_relative_path)
    .bind(&metadata.sample_path)
    .bind(&metadata.thumbnail_path)
    .bind(&original_filename_str)
    .bind(mime_type)
    .bind(metadata.width as i32)
    .bind(metadata.height as i32)
    .bind(file_size)
    .bind(&rating_to_insert)
    .fetch_one(pool)
    .await?;

    if let Some(id) = image_id {
        for tag in tags_to_insert {
            // Find or create tag
            let tag_id: i64 = sqlx::query_scalar(
                r#"
                WITH new_tag AS (
                    INSERT INTO tags (namespace, name, normalized_namespace, normalized_name)
                    VALUES ('', $1, '', $2)
                    ON CONFLICT (normalized_namespace, normalized_name) DO NOTHING
                    RETURNING id
                )
                SELECT id FROM new_tag
                UNION ALL
                SELECT id FROM tags WHERE normalized_namespace = '' AND normalized_name = $2
                LIMIT 1
                "#,
            )
            .bind(&tag)
            .bind(&tag.to_lowercase())
            .fetch_one(pool)
            .await?;

            sqlx::query(
                "INSERT INTO image_tags (image_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(id)
            .bind(tag_id)
            .execute(pool)
            .await?;
        }
    }

    Ok(true)
}
