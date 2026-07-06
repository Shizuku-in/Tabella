//! Hourly cleanup: expired download jobs, orphaned temp dirs, orphaned tags,
//! orphaned media files. All deletions use TTL guards to avoid import/edit races.

use sqlx::PgPool;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

const ORPHAN_TEMP_TTL: Duration = Duration::from_secs(24 * 3600);

// media subdirectories holding image derivatives (DB-referenced). `avatars` is
// deliberately excluded: it is not tracked in the images table.
const MANAGED_MEDIA_DIRS: [&str; 3] = ["originals", "samples", "thumbnails"];

#[derive(sqlx::FromRow)]
struct ExpiredJobRow {
    id: uuid::Uuid,
    file_path: Option<String>,
}

/// Runs every hour: deletes expired download jobs + zips, prunes orphaned
/// temp dirs/older than 24h, and sweeps orphan tags + media files.
///
/// Respects `shutdown`: wakes from idle sleep immediately when the token is
/// cancelled so the worker exits without waiting for the next hourly tick.
pub(crate) async fn run_cleanup_worker(
    pool: PgPool,
    temp_root: PathBuf,
    media_root: PathBuf,
    shutdown: CancellationToken,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(3600)); // Every hour

    loop {
        // Wait for the next tick, but exit immediately if shutdown is requested.
        // `biased` ensures the shutdown branch is always checked first so we
        // don't waste time running a non-urgent cleanup cycle at shutdown.
        tokio::select! {
            biased;
            _ = shutdown.cancelled() => {
                info!("Cleanup worker stopping: shutdown requested");
                return;
            }
            _ = interval.tick() => {}
        }

        info!("Running download jobs cleanup task");

        let expired_jobs = sqlx::query_as::<_, ExpiredJobRow>(
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
                    let job_id = job.id;

                    if let Some(file_path) = job.file_path {
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

        cleanup_orphan_media(&pool, &media_root).await;
        cleanup_orphan_tags(&pool, ORPHAN_TEMP_TTL).await;
        cleanup_expired_sessions(&pool).await;
    }
}

/// Recursively deletes immediate child directories of `root` whose last
/// modification time is older than `older_than`.
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

/// Delete tags that are not referenced by any image and whose `created_at` is
/// older than `older_than`. Unlike media files there is no import race (tag
/// creation and image_tags insertion share a transaction), but a TTL avoids
/// racing with in-flight edits that temporarily remove the last reference.
async fn cleanup_orphan_tags(pool: &PgPool, older_than: Duration) {
    let result = sqlx::query(
        r#"
        DELETE FROM tags
        WHERE NOT EXISTS (SELECT 1 FROM image_tags WHERE tag_id = tags.id)
          AND created_at < now() - $1::interval
        "#,
    )
    .bind(format!("{} seconds", older_than.as_secs()))
    .execute(pool)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            info!(removed = r.rows_affected(), "Pruned orphan tags");
        }
        Ok(_) => {}
        Err(e) => {
            error!(%e, "Failed to prune orphan tags");
        }
    }
}

/// Deletes expired session rows so the `sessions` table doesn't grow
/// indefinitely. Session validity is checked on every request via
/// `expires_at > now()`, but expired rows are never removed otherwise.
async fn cleanup_expired_sessions(pool: &PgPool) {
    let result = sqlx::query("DELETE FROM sessions WHERE expires_at < now()")
        .execute(pool)
        .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            info!(removed = r.rows_affected(), "Pruned expired sessions");
        }
        Ok(_) => {}
        Err(e) => {
            error!(%e, "Failed to prune expired sessions");
        }
    }
}

/// Delete media files on disk that no image row references. Guards against the
/// import race (file written before its DB row) by only removing files older
/// than ORPHAN_TEMP_TTL; the avatars dir is never touched.
async fn cleanup_orphan_media(pool: &PgPool, media_root: &Path) {
    // Read the referenced set first: a file inserted after this query but before
    // we scan disk will still be new enough to be skipped by the age guard.
    let referenced: Result<Vec<String>, _> = sqlx::query_scalar(
        r#"
        SELECT original_path FROM images
        UNION ALL
        SELECT preview_path FROM images
        UNION ALL
        SELECT thumbnail_path FROM images
        "#,
    )
    .fetch_all(pool)
    .await;

    let referenced: HashSet<String> = match referenced {
        Ok(paths) => paths.into_iter().collect(),
        Err(e) => {
            error!(%e, "Failed to fetch referenced media paths; skipping orphan media sweep");
            return;
        }
    };

    for subdir in MANAGED_MEDIA_DIRS {
        let dir = media_root.join(subdir);
        let Ok(mut entries) = tokio::fs::read_dir(&dir).await else {
            continue;
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(metadata) = entry.metadata().await else {
                continue;
            };
            if !metadata.is_file() {
                continue;
            }

            // DB stores forward-slash relative paths (e.g. "originals/<sha>.jpg");
            // rebuild the same shape regardless of platform separators.
            let Some(filename) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let relative = format!("{subdir}/{filename}");
            if referenced.contains(&relative) {
                continue;
            }

            // Age guard: only delete when we can confirm the file is older than
            // the TTL. Any uncertainty (unreadable mtime, clock skew) keeps the
            // file, so an in-flight import (file on disk, row not yet committed)
            // is never deleted.
            let old_enough = metadata
                .modified()
                .ok()
                .and_then(|m| m.elapsed().ok())
                .is_some_and(|elapsed| elapsed > ORPHAN_TEMP_TTL);
            if !old_enough {
                continue;
            }

            let path = entry.path();
            if let Err(e) = tokio::fs::remove_file(&path).await {
                error!(?path, %e, "Failed to delete orphaned media file");
            } else {
                info!(?path, "Deleted orphaned media file");
            }
        }
    }
}
