use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow};
use rayon::ThreadPoolBuilder;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use walkdir::WalkDir;

use crate::predict::TagPredictor;
use crate::sidecar::{
    SidecarMetadata, metadata_to_pretty_json, sidecar_path_for_image, write_sidecar,
};

#[derive(Debug, Clone)]
pub struct ScanOptions {
    pub overwrite: bool,
    pub dry_run: bool,
    pub jobs: usize,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            overwrite: false,
            dry_run: false,
            jobs: 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileAction {
    Tagged,
    SkippedExisting,
    Failed,
}

#[derive(Debug, Clone)]
pub struct FileOutcome {
    pub image_path: PathBuf,
    pub json_path: PathBuf,
    pub action: FileAction,
    pub metadata: Option<SidecarMetadata>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ScanSummary {
    pub total_images: usize,
    pub tagged: usize,
    pub skipped_existing: usize,
    pub failed: usize,
}

impl ScanSummary {
    pub fn from_outcomes(outcomes: &[FileOutcome]) -> Self {
        let mut summary = Self {
            total_images: outcomes.len(),
            ..Self::default()
        };

        for outcome in outcomes {
            match outcome.action {
                FileAction::Tagged => summary.tagged += 1,
                FileAction::SkippedExisting => summary.skipped_existing += 1,
                FileAction::Failed => summary.failed += 1,
            }
        }

        summary
    }
}

pub fn collect_image_paths(path: &Path) -> Result<Vec<PathBuf>> {
    if path.is_file() {
        if is_supported_image(path) {
            return Ok(vec![path.to_path_buf()]);
        }
        return Ok(Vec::new());
    }

    if !path.is_dir() {
        return Err(anyhow!("path does not exist: {}", path.display()));
    }

    let mut images = Vec::new();
    for entry in WalkDir::new(path)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        if entry.file_type().is_file() && is_supported_image(entry.path()) {
            images.push(entry.into_path());
        }
    }

    images.sort();
    Ok(images)
}

pub fn run_with_factory<F, P>(
    target: &Path,
    options: &ScanOptions,
    predictor_factory: F,
) -> Result<(Vec<FileOutcome>, ScanSummary)>
where
    F: Fn() -> Result<P> + Sync,
    P: TagPredictor + Send,
{
    if options.jobs == 0 {
        return Err(anyhow!("jobs must be greater than 0"));
    }

    let images = collect_image_paths(target)?;
    let pool = ThreadPoolBuilder::new()
        .num_threads(options.jobs)
        .build()
        .context("failed to initialize worker thread pool")?;

    let outcomes = pool.install(|| {
        images
            .par_iter()
            .map_init(
                || predictor_factory(),
                |predictor_result, image_path| match predictor_result {
                    Ok(predictor) => process_single_file(predictor, image_path, options),
                    Err(error) => FileOutcome {
                        image_path: image_path.to_path_buf(),
                        json_path: sidecar_path_for_image(image_path)
                            .unwrap_or_else(|_| image_path.with_extension("json")),
                        action: FileAction::Failed,
                        metadata: None,
                        error: Some(error.to_string()),
                    },
                },
            )
            .collect::<Vec<_>>()
    });

    let summary = ScanSummary::from_outcomes(&outcomes);
    Ok((outcomes, summary))
}

fn process_single_file<P: TagPredictor>(
    predictor: &mut P,
    image_path: &Path,
    options: &ScanOptions,
) -> FileOutcome {
    let json_path =
        sidecar_path_for_image(image_path).unwrap_or_else(|_| image_path.with_extension("json"));

    if json_path.exists() && !options.overwrite {
        return FileOutcome {
            image_path: image_path.to_path_buf(),
            json_path,
            action: FileAction::SkippedExisting,
            metadata: None,
            error: None,
        };
    }

    match predictor.predict_path(image_path) {
        Ok(metadata) => {
            let write_result = if options.dry_run {
                Ok(())
            } else {
                write_sidecar(&json_path, &metadata)
            };

            match write_result {
                Ok(()) => FileOutcome {
                    image_path: image_path.to_path_buf(),
                    json_path,
                    action: FileAction::Tagged,
                    metadata: Some(metadata),
                    error: None,
                },
                Err(error) => FileOutcome {
                    image_path: image_path.to_path_buf(),
                    json_path,
                    action: FileAction::Failed,
                    metadata: None,
                    error: Some(error.to_string()),
                },
            }
        }
        Err(error) => FileOutcome {
            image_path: image_path.to_path_buf(),
            json_path,
            action: FileAction::Failed,
            metadata: None,
            error: Some(error.to_string()),
        },
    }
}

pub fn render_dry_run(outcome: &FileOutcome) -> Result<Option<String>> {
    if outcome.action != FileAction::Tagged {
        return Ok(None);
    }

    let metadata = outcome
        .metadata
        .as_ref()
        .context("tagged outcome is missing metadata")?;
    let json = metadata_to_pretty_json(metadata)?;
    Ok(Some(format!(
        "{} -> {}\n{}",
        outcome.image_path.display(),
        outcome.json_path.display(),
        json
    )))
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "gif"
            )
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use anyhow::{Result, anyhow};
    use image::{ImageBuffer, Rgb};

    use super::{FileAction, ScanOptions, collect_image_paths, run_with_factory};
    use crate::predict::TagPredictor;
    use crate::sidecar::{Rating, SidecarMetadata};

    struct MockPredictor {
        calls: Arc<AtomicUsize>,
        fail_on_name: Option<String>,
    }

    impl TagPredictor for MockPredictor {
        fn predict_path(&mut self, image_path: &Path) -> Result<SidecarMetadata> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if self.fail_on_name.as_deref().is_some_and(|name| {
                image_path.file_name().and_then(|value| value.to_str()) == Some(name)
            }) {
                return Err(anyhow!("mock failure"));
            }

            Ok(SidecarMetadata {
                tags: vec![String::from("general:1girl")],
                rating: Rating::Safe,
            })
        }
    }

    #[test]
    fn collect_image_paths_finds_supported_extensions_recursively() {
        let root = temp_test_dir("collect-images");
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested").join("ignore.txt"), "x").unwrap();
        write_test_image(&root.join("a.png"));
        write_test_image(&root.join("nested").join("b.jpg"));

        let images = collect_image_paths(&root).unwrap();
        assert_eq!(images.len(), 2);
    }

    #[test]
    fn scan_respects_skip_overwrite_and_dry_run() {
        let root = temp_test_dir("scan-dry-run");
        fs::create_dir_all(&root).unwrap();
        let image_path = root.join("sample.png");
        write_test_image(&image_path);

        let calls = Arc::new(AtomicUsize::new(0));
        let options = ScanOptions {
            overwrite: false,
            dry_run: false,
            jobs: 1,
        };

        let (outcomes, summary) = run_with_factory(&image_path, &options, {
            let calls = Arc::clone(&calls);
            move || {
                Ok(MockPredictor {
                    calls: Arc::clone(&calls),
                    fail_on_name: None,
                })
            }
        })
        .unwrap();
        assert_eq!(summary.tagged, 1);
        assert!(image_path.with_extension("json").exists());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(outcomes[0].action, FileAction::Tagged);

        let (outcomes, summary) = run_with_factory(&image_path, &options, {
            let calls = Arc::clone(&calls);
            move || {
                Ok(MockPredictor {
                    calls: Arc::clone(&calls),
                    fail_on_name: None,
                })
            }
        })
        .unwrap();
        assert_eq!(summary.skipped_existing, 1);
        assert_eq!(outcomes[0].action, FileAction::SkippedExisting);

        let dry_run_image = root.join("dry-run.png");
        write_test_image(&dry_run_image);
        let (outcomes, summary) = run_with_factory(
            &dry_run_image,
            &ScanOptions {
                overwrite: false,
                dry_run: true,
                jobs: 1,
            },
            {
                let calls = Arc::clone(&calls);
                move || {
                    Ok(MockPredictor {
                        calls: Arc::clone(&calls),
                        fail_on_name: None,
                    })
                }
            },
        )
        .unwrap();
        assert_eq!(summary.tagged, 1);
        assert_eq!(outcomes[0].action, FileAction::Tagged);
        assert!(!dry_run_image.with_extension("json").exists());
    }

    #[test]
    fn scan_reports_per_file_failures() {
        let root = temp_test_dir("scan-failures");
        fs::create_dir_all(&root).unwrap();
        write_test_image(&root.join("ok.png"));
        write_test_image(&root.join("fail.png"));

        let (outcomes, summary) = run_with_factory(
            &root,
            &ScanOptions {
                overwrite: true,
                dry_run: false,
                jobs: 2,
            },
            move || {
                Ok(MockPredictor {
                    calls: Arc::new(AtomicUsize::new(0)),
                    fail_on_name: Some(String::from("fail.png")),
                })
            },
        )
        .unwrap();

        assert_eq!(summary.total_images, 2);
        assert_eq!(summary.failed, 1);
        assert!(
            outcomes
                .iter()
                .any(|outcome| outcome.action == FileAction::Failed)
        );
    }

    fn temp_test_dir(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "tagger-cli-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_test_image(path: &Path) {
        let image = ImageBuffer::from_pixel(8, 8, Rgb([32_u8, 64_u8, 96_u8]));
        image.save(path).unwrap();
    }
}
