//! Background import worker using Postgres as a job queue.
//!
//! # Pipeline
//!
//! ```text
//! queued → running → extracting → processing → completed
//!                         ^-- zip/7z only; directory skip
//! ```
//!
//! - **Crash recovery:** on startup, any `running`/`extracting`/`processing` jobs
//!   are marked `failed`.
//! - **Dedup:** SHA256 of the original file; duplicates are skipped.
//! - **Sidecar JSON:** `<image>.json` files produced by `tagger-cli` carry tags
//!   and rating for automatic annotation (see [`read_sidecar_metadata`]).
//! - **Concurrency:** jobs are claimed with `SELECT … FOR UPDATE SKIP LOCKED`,
//!   so multiple workers can safely share the queue.

use std::path::{Path, PathBuf};
use std::time::Duration;
use std::{error::Error as StdError, fmt};

use anyhow::{Context, Result};
use sqlx::PgPool;
use tokio::time::sleep;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::AppState;
use crate::ServerEvent;
use crate::config::{Config, DynamicConfig};
use crate::image_processor::compute_sha256;
use crate::tags::{ParsedTag, parse_tag};

/// Specific import-failure reasons that map to user-facing error codes
/// via [`classify_import_error`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportJobError {
    NoImportableFiles,
}

impl fmt::Display for ImportJobError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoImportableFiles => {
                f.write_str("No supported image files were found in the import source")
            }
        }
    }
}

impl StdError for ImportJobError {}

/// Progress messages streamed from the blocking ZIP extraction back to the
/// async runtime so DB/SSE updates stay off the blocking thread.
enum ExtractProgress {
    /// Total number of entries in the archive.
    Total(i32),
    /// Number of entries extracted so far.
    Processed(i32),
}

fn is_supported_image_ext(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "webp" | "gif")
}

fn lowercase_ext(path: &Path) -> String {
    path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Walks a directory looking for the first zip/7z archive (blocking).
fn find_archive_in_dir(dir: &Path) -> Option<PathBuf> {
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let ext = lowercase_ext(entry.path());
            if ext == "zip" || ext == "7z" {
                return Some(entry.path().to_path_buf());
            }
        }
    }
    None
}

/// Walks a directory collecting all supported image files (blocking).
fn scan_image_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() && is_supported_image_ext(&lowercase_ext(entry.path())) {
            files.push(entry.path().to_path_buf());
        }
    }
    files
}

/// Extracts a ZIP archive on a blocking thread, streaming progress over
/// `progress_tx`, and returns the collected image file paths.
fn extract_zip_blocking(
    archive_path: &Path,
    temp_extract_dir: &Path,
    progress_batch_size: usize,
    progress_tx: &tokio::sync::mpsc::UnboundedSender<ExtractProgress>,
) -> Result<Vec<PathBuf>> {
    let file = std::fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let total_files = archive.len() as i32;
    let _ = progress_tx.send(ExtractProgress::Total(total_files));

    std::fs::create_dir_all(temp_extract_dir)?;

    let mut files_to_process = Vec::new();
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
            if let Some(p) = outpath.parent()
                && !p.exists()
            {
                std::fs::create_dir_all(p)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;

            if is_supported_image_ext(&lowercase_ext(&outpath)) {
                files_to_process.push(outpath);
            }
        }

        // Report extraction progress at configured batch intervals
        if i % progress_batch_size == 0 && i > 0 {
            let _ = progress_tx.send(ExtractProgress::Processed(i as i32));
        }
    }

    Ok(files_to_process)
}

/// Extracts a 7z archive on a blocking thread and returns the collected image
/// file paths.
fn extract_7z_blocking(archive_path: &Path, temp_extract_dir: &Path) -> Result<Vec<PathBuf>> {
    std::fs::create_dir_all(temp_extract_dir)?;

    sevenz_rust::decompress_file(archive_path, temp_extract_dir)
        .map_err(|e| anyhow::anyhow!("7z extraction failed: {:?}", e))?;

    Ok(scan_image_files(temp_extract_dir))
}

/// Starts the import worker loop. Recovers stuck jobs (crash recovery), then
/// polls the queue every 5s. Respects `state.shutdown` for graceful exit:
/// stops claiming new jobs once the token is cancelled, letting the in-flight
/// job finish.
pub(crate) async fn start_worker(state: AppState) {
    tracing::info!("Starting background import worker");

    // Clean up any jobs that were left in a running state due to a server crash or restart.
    if let Err(e) = sqlx::query(
        "UPDATE import_jobs SET status = 'failed', last_error = 'Interrupted by server restart', error_code = 'internal_error', updated_at = now() WHERE status IN ('running', 'extracting', 'processing')"
    )
    .execute(&state.pool)
    .await {
        tracing::error!("Failed to clean up stuck jobs: {:?}", e);
    }

    let shutdown = state.shutdown.clone();

    loop {
        // Stop claiming new jobs once shutdown has been requested. Any job
        // already in flight has run to completion before this check.
        if shutdown.is_cancelled() {
            tracing::info!("Import worker stopping: shutdown requested");
            return;
        }

        match process_next_job(&state).await {
            Ok(true) => continue, // Processed a job, check for next one immediately
            Ok(false) => {}       // No jobs found, sleep
            Err(e) => tracing::error!("Import worker error: {:?}", e),
        }

        // Idle wait, but wake up immediately if shutdown is requested.
        tokio::select! {
            _ = sleep(Duration::from_secs(5)) => {}
            _ = shutdown.cancelled() => {
                tracing::info!("Import worker stopping: shutdown requested");
                return;
            }
        }
    }
}

/// Claims one `queued` job with `FOR UPDATE SKIP LOCKED`, runs it, then
/// finalises the status and cleans up temp dirs. Returns `Ok(true)` when a job
/// was processed, `Ok(false)` when the queue was empty.
async fn process_next_job(state: &AppState) -> Result<bool> {
    #[derive(sqlx::FromRow)]
    struct JobRow {
        id: Uuid,
        source_archive_path: String,
        source_type: String,
        created_by_user_id: Option<i64>,
    }

    // 1. Claim the next queued job
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
        RETURNING id, source_archive_path, source_type, created_by_user_id
        "#,
    )
    .fetch_optional(&state.pool)
    .await?;

    let job = match job {
        Some(j) => j,
        None => return Ok(false),
    };

    tracing::info!("Found import job: {} (type: {})", job.id, job.source_type);

    // 2. Process the job
    let dynamic_config = state.dynamic_config().await;
    let result = run_import_job(
        job.id,
        &job.source_archive_path,
        &job.source_type,
        &state.pool,
        &state.config,
        &state.tx,
        dynamic_config.import_progress_batch_size,
        job.created_by_user_id,
        &dynamic_config,
    )
    .await;

    // 3. Finalize the job
    let final_status = match &result {
        Ok(has_errors) => {
            if *has_errors {
                "completed_with_errors"
            } else {
                "completed"
            }
        }
        Err(e) => {
            tracing::error!("Job {} failed: {:?}", job.id, e);
            "failed"
        }
    };

    let (user_error_message, error_code, error_detail) = match result {
        Ok(_) => (None, None, None),
        Err(e) => {
            let (code, message) = classify_import_error(&e);
            (Some(message.to_string()), Some(code), Some(e.to_string()))
        }
    };

    sqlx::query(
        r#"
        UPDATE import_jobs
        SET status = $1, finished_at = now(), updated_at = now(), last_error = $2, error_code = $3, error_params = $4, error_detail = $5
        WHERE id = $6
        "#,
    )
    .bind(final_status)
    .bind(user_error_message)
    .bind(error_code)
    .bind(Option::<serde_json::Value>::None)
    .bind(error_detail)
    .bind(job.id)
    .execute(&state.pool)
    .await?;

    let _ = state.tx.send(ServerEvent {
        event: "import_job_updated".to_string(),
        data: serde_json::json!({ "id": job.id }),
    });

    cleanup_job_temp_dir(
        &temp_extract_job_dir(&state.config.temp_root, job.id),
        "temp_extract",
        job.id,
    );
    cleanup_temporary_upload_source(&state.config.temp_root, &job.source_archive_path, job.id);

    Ok(true)
}

fn temp_extract_job_dir(temp_root: &Path, job_id: Uuid) -> PathBuf {
    temp_root.join("temp_extract").join(job_id.to_string())
}

fn temp_uploads_root(temp_root: &Path) -> PathBuf {
    temp_root.join("uploads")
}

fn cleanup_temporary_upload_source(temp_root: &Path, source_archive_path: &str, job_id: Uuid) {
    let uploads_path = Path::new(source_archive_path);
    if uploads_path.starts_with(temp_uploads_root(temp_root)) {
        cleanup_job_temp_dir(uploads_path, "uploads", job_id);
    }
}

fn cleanup_job_temp_dir(path: &Path, label: &str, job_id: Uuid) {
    if !path.exists() {
        return;
    }

    if let Err(e) = std::fs::remove_dir_all(path) {
        tracing::error!(%job_id, %label, ?path, ?e, "Failed to clean up job temp directory");
    } else {
        tracing::info!(%job_id, %label, ?path, "Cleaned up job temp directory");
    }
}

/// Full import pipeline for a single job: resolve source → extract/scan →
/// process each file (SHA256 dedup, derivative generation, tag attachment)
/// → report progress via SSE.
///
/// Returns `Ok(has_errors)` on completion; `has_errors = true` means at least
/// one file failed (job status is `completed_with_errors`).
#[allow(clippy::too_many_arguments)]
async fn run_import_job(
    job_id: Uuid,
    source_path_str: &str,
    source_type: &str,
    pool: &PgPool,
    config: &Config,
    tx: &tokio::sync::broadcast::Sender<ServerEvent>,
    progress_batch_size: usize,
    uploader_id: Option<i64>,
    dyn_config: &DynamicConfig,
) -> Result<bool> {
    let mut source_path = PathBuf::from(source_path_str);

    // If it's a package upload but the path points to the temp directory, we must find the archive inside it
    if source_type == "package" && source_path.is_dir() {
        let dir = source_path.clone();
        let found = tokio::task::spawn_blocking(move || find_archive_in_dir(&dir))
            .await
            .context("archive scan task panicked")?;
        match found {
            Some(archive_path) => source_path = archive_path,
            None => anyhow::bail!("No archive (zip/7z) found in package upload directory"),
        }
    }

    // Collect all image files
    let files_to_process: Vec<PathBuf>;

    if source_path.is_dir() {
        // Folder or server import: scan for images (blocking directory walk).
        let dir = source_path.clone();
        files_to_process = tokio::task::spawn_blocking(move || scan_image_files(&dir))
            .await
            .context("image scan task panicked")?;
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
            let _ = tx.send(ServerEvent {
                event: "import_job_updated".to_string(),
                data: serde_json::json!({ "id": job_id }),
            });

            // Keep raw extracted files outside the authenticated media tree.
            let temp_extract_dir = config
                .temp_root
                .join("temp_extract")
                .join(job_id.to_string());

            // Run the blocking ZIP extraction on a dedicated thread, streaming
            // progress back over a channel so the DB/SSE updates stay on the
            // async runtime.
            let (progress_tx, mut progress_rx) =
                tokio::sync::mpsc::unbounded_channel::<ExtractProgress>();
            let archive_path = source_path.clone();
            let extract_dir = temp_extract_dir.clone();
            let mut handle = tokio::task::spawn_blocking(move || {
                extract_zip_blocking(
                    &archive_path,
                    &extract_dir,
                    progress_batch_size,
                    &progress_tx,
                )
            });

            // Drain progress messages until the blocking task finishes.
            files_to_process = loop {
                tokio::select! {
                    msg = progress_rx.recv() => {
                        match msg {
                            Some(ExtractProgress::Total(total)) => {
                                sqlx::query(
                                    "UPDATE import_jobs SET total_items = $1, updated_at = now() WHERE id = $2",
                                )
                                .bind(total)
                                .bind(job_id)
                                .execute(pool)
                                .await?;
                                let _ = tx.send(ServerEvent {
                                    event: "import_job_updated".to_string(),
                                    data: serde_json::json!({ "id": job_id }),
                                });
                            }
                            Some(ExtractProgress::Processed(processed)) => {
                                sqlx::query(
                                    "UPDATE import_jobs SET processed_items = $1, updated_at = now() WHERE id = $2",
                                )
                                .bind(processed)
                                .bind(job_id)
                                .execute(pool)
                                .await?;
                                let _ = tx.send(ServerEvent {
                                    event: "import_job_updated".to_string(),
                                    data: serde_json::json!({ "id": job_id }),
                                });
                            }
                            None => {
                                // Sender dropped: extraction finished, collect the result.
                                break (&mut handle)
                                    .await
                                    .context("zip extraction task panicked")??;
                            }
                        }
                    }
                }
            };
        } else if matches!(ext.as_str(), "7z") {
            tracing::info!("Extracting 7Z archive: {:?}", source_path);

            sqlx::query(
                "UPDATE import_jobs SET status = 'extracting', updated_at = now() WHERE id = $1",
            )
            .bind(job_id)
            .execute(pool)
            .await?;
            let _ = tx.send(ServerEvent {
                event: "import_job_updated".to_string(),
                data: serde_json::json!({ "id": job_id }),
            });

            let temp_extract_dir = config
                .temp_root
                .join("temp_extract")
                .join(job_id.to_string());

            let archive_path = source_path.clone();
            let extract_dir = temp_extract_dir.clone();
            files_to_process = tokio::task::spawn_blocking(move || {
                extract_7z_blocking(&archive_path, &extract_dir)
            })
            .await
            .context("7z extraction task panicked")??;
        } else if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif") {
            files_to_process = vec![source_path.clone()];
        } else {
            files_to_process = Vec::new();
        }
    } else {
        anyhow::bail!("Source path does not exist or is not a valid file/directory");
    }

    if files_to_process.is_empty() {
        return Err(ImportJobError::NoImportableFiles.into());
    }

    let total = files_to_process.len() as i32;
    sqlx::query(
        "UPDATE import_jobs SET status = 'processing', total_items = $1, processed_items = 0, succeeded_items = 0, failed_items = 0, updated_at = now() WHERE id = $2",
    )
    .bind(total)
    .bind(job_id)
    .execute(pool)
    .await?;
    let _ = tx.send(ServerEvent {
        event: "import_job_updated".to_string(),
        data: serde_json::json!({ "id": job_id }),
    });

    let mut succeeded = 0;
    let mut failed = 0;
    let mut has_errors = false;

    // Create media directories once before the per-file loop
    let originals_dir = config.media_root.join("originals");
    let thumbnails_dir = config.media_root.join("thumbnails");
    let samples_dir = config.media_root.join("samples");
    std::fs::create_dir_all(&originals_dir)?;
    std::fs::create_dir_all(&thumbnails_dir)?;
    std::fs::create_dir_all(&samples_dir)?;

    for (index, file_path) in files_to_process.into_iter().enumerate() {
        match process_single_file(
            &file_path,
            &originals_dir,
            pool,
            config,
            dyn_config,
            uploader_id,
        )
        .await
        {
            Ok(true) => succeeded += 1,  // Success
            Ok(false) => succeeded += 1, // Skipped (already exists), user wants it counted as succeeded
            Err(e) => {
                tracing::warn!("Failed to process file {:?}: {:?}", file_path, e);
                failed += 1;
                has_errors = true;
            }
        }

        // Update progress at configured batch intervals
        if (index + 1) % progress_batch_size == 0 || (index + 1) == total as usize {
            sqlx::query(
                "UPDATE import_jobs SET processed_items = $1, succeeded_items = $2, failed_items = $3, heartbeat_at = now(), updated_at = now() WHERE id = $4",
            )
            .bind((index + 1) as i32)
            .bind(succeeded)
            .bind(failed)
            .bind(job_id)
            .execute(pool)
            .await?;
            let _ = tx.send(ServerEvent {
                event: "import_job_updated".to_string(),
                data: serde_json::json!({ "id": job_id }),
            });
        }
    }

    Ok(has_errors)
}

/// Maps an import error to a user-facing `(error_code, message)` pair.
/// Known `ImportJobError` variants get specific codes; everything else is
/// `import_processing_failed`.
fn classify_import_error(error: &anyhow::Error) -> (&'static str, &'static str) {
    if let Some(import_error) = error.downcast_ref::<ImportJobError>() {
        match import_error {
            ImportJobError::NoImportableFiles => (
                crate::api::error_codes::NO_IMPORTABLE_FILES,
                "No supported image files were found in the import source.",
            ),
        }
    } else {
        (
            crate::api::error_codes::IMPORT_PROCESSING_FAILED,
            "Import job failed.",
        )
    }
}

/// Result of the CPU/IO-heavy image processing stage, computed inside
/// `spawn_blocking` so the async runtime threads are never blocked.
struct ProcessedFile {
    metadata: crate::image_processor::ImageMetadata,
    tags_to_insert: Vec<ParsedTag>,
    rating_to_insert: String,
    original_filename_str: String,
    original_relative_path: String,
    mime_type: &'static str,
    file_size: i64,
}

/// Runs all blocking work for a single file (decode, resize, webp encode,
/// sidecar read, original copy) on a blocking thread and returns the data
/// needed to insert the row.
fn process_single_file_blocking(
    file_path: &Path,
    originals_dir: &Path,
    media_root: &Path,
    sha256: &str,
    dyn_config: &crate::config::DynamicConfig,
) -> Result<ProcessedFile> {
    // Process image (generate thumbnail and sample)
    let metadata =
        crate::image_processor::process_image(file_path, media_root, sha256, dyn_config)?;

    // Read sidecar metadata JSON if it exists
    let mut tags_to_insert: Vec<ParsedTag> = Vec::new();
    let mut rating_to_insert = "safe".to_string();
    if let Some(sidecar) = read_sidecar_metadata(file_path) {
        tags_to_insert = sidecar.tags;
        rating_to_insert = sidecar.rating;
    }

    // Move original file to media_root/originals/
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

    let original_relative_path = format!("originals/{}", original_filename);

    Ok(ProcessedFile {
        metadata,
        tags_to_insert,
        rating_to_insert,
        original_filename_str,
        original_relative_path,
        mime_type,
        file_size,
    })
}

/// Processes one file through the import pipeline: SHA256 → dedup check →
/// blocking image processing (resize/encode/copy) → DB insert with tags in
/// a single transaction.
///
/// Returns `Ok(true)` for a new insert, `Ok(false)` for a skipped duplicate.
async fn process_single_file(
    file_path: &Path,
    originals_dir: &Path,
    pool: &PgPool,
    config: &Config,
    dyn_config: &crate::config::DynamicConfig,
    uploader_id: Option<i64>,
) -> Result<bool> {
    // 1. Compute SHA256 (blocking file read) off the async runtime threads.
    let sha256 = {
        let file_path = file_path.to_path_buf();
        tokio::task::spawn_blocking(move || compute_sha256(&file_path))
            .await
            .context("sha256 task panicked")?
            .context("failed to compute sha256")?
    };

    #[derive(sqlx::FromRow)]
    struct ImageId {
        #[allow(dead_code)]
        id: i64,
    }

    // 2. Dedup check before doing any expensive processing.
    let existing: Option<ImageId> = sqlx::query_as("SELECT id FROM images WHERE sha256 = $1")
        .bind(&sha256)
        .fetch_optional(pool)
        .await?;

    if existing.is_some() {
        tracing::debug!("Skipping {}, already exists", sha256);
        return Ok(false); // Returning false means skipped
    }

    // 3. Run all CPU/IO-heavy work (decode, resize, encode, copy) on a
    //    blocking thread so the Tokio worker threads stay responsive.
    let processed = {
        let file_path = file_path.to_path_buf();
        let originals_dir = originals_dir.to_path_buf();
        let media_root = config.media_root.clone();
        let sha256 = sha256.clone();
        let dyn_config = dyn_config.clone();
        tokio::task::spawn_blocking(move || {
            process_single_file_blocking(
                &file_path,
                &originals_dir,
                &media_root,
                &sha256,
                &dyn_config,
            )
        })
        .await
        .context("image processing task panicked")??
    };

    // 4. Insert the image row and its tags in one transaction so a failure
    //    midway can't leave an image with only part of its tags.
    let mut tx = pool.begin().await?;

    let image_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO images (
            sha256, original_path, preview_path, thumbnail_path, original_filename,
            mime_type, width, height, file_size, rating, uploader_id
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        RETURNING id
        "#,
    )
    .bind(&sha256)
    .bind(&processed.original_relative_path)
    .bind(&processed.metadata.sample_path)
    .bind(&processed.metadata.thumbnail_path)
    .bind(&processed.original_filename_str)
    .bind(processed.mime_type)
    .bind(processed.metadata.width as i32)
    .bind(processed.metadata.height as i32)
    .bind(processed.file_size)
    .bind(&processed.rating_to_insert)
    .bind(uploader_id)
    .fetch_one(&mut *tx)
    .await?;

    crate::tags::bulk_attach_tags_to_image(&mut tx, image_id, &processed.tags_to_insert).await?;

    tx.commit().await?;

    Ok(true)
}

/// Tags and rating parsed from a `<image>.json` sidecar file.
#[derive(Debug, Clone)]
struct SidecarImportMetadata {
    tags: Vec<ParsedTag>,
    rating: String,
}

/// Reads a `<image>.json` sidecar produced by `tagger-cli`. Expects
/// `{ "tags": ["artist:name", …], "rating": "safe|suggestive|explicit" }`.
/// Returns `None` if the file is missing or malformed.
fn read_sidecar_metadata(file_path: &Path) -> Option<SidecarImportMetadata> {
    let json_path = file_path.with_extension("json");
    if !json_path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&json_path).ok()?;
    let json_val = serde_json::from_str::<serde_json::Value>(&content).ok()?;

    let mut tags = Vec::new();
    if let Some(tags_arr) = json_val.get("tags").and_then(|value| value.as_array()) {
        for tag_val in tags_arr {
            if let Some(tag_str) = tag_val.as_str()
                && let Some(tag) = parse_tag(tag_str)
            {
                tags.push(tag);
            }
        }
    }

    let rating = json_val
        .get("rating")
        .and_then(|value| value.as_str())
        .map(str::to_lowercase)
        .filter(|value| value == "safe" || value == "suggestive" || value == "explicit")
        .unwrap_or_else(|| String::from("safe"));

    Some(SidecarImportMetadata { tags, rating })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use anyhow::anyhow;

    use super::{ImportJobError, classify_import_error, read_sidecar_metadata};

    #[test]
    fn read_sidecar_metadata_preserves_namespaces() {
        let root = std::env::temp_dir().join(format!(
            "tabella-sidecar-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();

        let image_path = root.join("sample.png");
        fs::write(&image_path, b"not-an-image").unwrap();
        fs::write(
            image_path.with_extension("json"),
            r#"{"tags":["artist:anmi","general:1girl"],"rating":"safe"}"#,
        )
        .unwrap();

        let metadata = read_sidecar_metadata(Path::new(&image_path)).unwrap();
        assert_eq!(metadata.tags.len(), 2);
        assert_eq!(metadata.tags[0].namespace, "artist");
        assert_eq!(metadata.tags[0].name, "anmi");
        assert_eq!(metadata.tags[1].namespace, "general");
        assert_eq!(metadata.rating, "safe");
    }

    #[test]
    fn classify_import_error_maps_no_importable_files() {
        let error = anyhow!(ImportJobError::NoImportableFiles);
        let (code, message) = classify_import_error(&error);
        assert_eq!(code, crate::api::error_codes::NO_IMPORTABLE_FILES);
        assert_eq!(
            message,
            "No supported image files were found in the import source."
        );
    }
}
