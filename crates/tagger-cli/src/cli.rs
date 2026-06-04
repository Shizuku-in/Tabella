use std::path::PathBuf;

use anyhow::Result;
use clap::{Args, Parser, Subcommand};

use crate::predict::{PredictorConfig, PredictorFactory, Thresholds};
use crate::scan::{FileAction, ScanOptions, render_dry_run, run_with_factory};

#[derive(Debug, Parser)]
#[command(name = "tagger-cli")]
#[command(about = "Batch tag images with WD tagger models and write sidecar JSON files.")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Tag(TagArgs),
}

#[derive(Debug, Args)]
struct TagArgs {
    path: PathBuf,

    #[arg(long)]
    overwrite: bool,

    #[arg(long)]
    dry_run: bool,

    #[arg(long, default_value_t = 1)]
    jobs: usize,

    #[arg(long, default_value_t = 0.35)]
    general_threshold: f32,

    #[arg(long, default_value_t = 0.70)]
    artist_threshold: f32,

    #[arg(long, default_value_t = 0.70)]
    parody_threshold: f32,

    #[arg(long, default_value_t = 0.85)]
    character_threshold: f32,

    #[arg(long, default_value = crate::model::DEFAULT_MODEL_REPO)]
    model_repo: String,
}

pub fn run() -> Result<u8> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Tag(args) => run_tag(args),
    }
}

fn run_tag(args: TagArgs) -> Result<u8> {
    let thresholds = Thresholds {
        general: args.general_threshold,
        artist: args.artist_threshold,
        parody: args.parody_threshold,
        character: args.character_threshold,
    };
    thresholds.validate()?;

    let factory = PredictorFactory::new(PredictorConfig {
        model_repo: args.model_repo,
        thresholds,
    })?;
    for warning in factory.startup_warnings() {
        eprintln!("{warning}");
    }

    let (outcomes, summary) = run_with_factory(
        &args.path,
        &ScanOptions {
            overwrite: args.overwrite,
            dry_run: args.dry_run,
            jobs: args.jobs,
        },
        || factory.create(),
    )?;

    for outcome in &outcomes {
        match outcome.action {
            FileAction::Tagged => {
                if args.dry_run {
                    if let Some(rendered) = render_dry_run(outcome)? {
                        println!("{rendered}");
                    }
                } else {
                    println!(
                        "tagged: {} -> {}",
                        outcome.image_path.display(),
                        outcome.json_path.display()
                    );
                }
            }
            FileAction::SkippedExisting => {
                println!(
                    "skipped: {} (sidecar already exists at {})",
                    outcome.image_path.display(),
                    outcome.json_path.display()
                );
            }
            FileAction::Failed => {
                eprintln!(
                    "failed: {} ({})",
                    outcome.image_path.display(),
                    outcome.error.as_deref().unwrap_or("unknown error")
                );
            }
        }
    }

    println!(
        "summary: total={}, tagged={}, skipped_existing={}, failed={}",
        summary.total_images, summary.tagged, summary.skipped_existing, summary.failed
    );

    Ok(if summary.failed > 0 { 1 } else { 0 })
}
