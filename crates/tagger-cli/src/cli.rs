use std::path::PathBuf;

use anyhow::Result;
use clap::{Args, Parser, Subcommand};

use crate::model::{ModelKind, resolve_model_repo};
use crate::predict::{PredictorConfig, PredictorFactory, Thresholds};
use crate::scan::{FileAction, ScanOptions, render_dry_run, run_with_factory};

#[derive(Debug, Parser)]
#[command(name = "tagger-cli")]
#[command(about = "Batch tag images with WD or Camie tagger models and write sidecar JSON files.")]
#[command(after_help = "Model selection:\n  Use `tag --model wd` for the default WD tagger.\n  Use `tag --model camie` to switch to Camie Tagger v2.\n\nExamples:\n  tagger-cli tag ./images\n  tagger-cli tag ./images --model camie\n  tagger-cli tag ./images --model camie --model-repo Camais03/camie-tagger-v2")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    #[command(about = "Tag images in a directory tree.", long_about = "Tag images in a directory tree.\n\nUse `--model wd` for the default WD model family, or `--model camie` to use Camie Tagger v2.")]
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

    #[arg(long, value_enum, default_value_t = ModelKind::Wd, help = "Model family to use: `wd` (default) or `camie`")]
    model: ModelKind,

    #[arg(long, help = "Override the Hugging Face repo for the selected model family")]
    model_repo: Option<String>,
}

pub fn run() -> Result<u8> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Tag(args) => run_tag(args),
    }
}

fn run_tag(args: TagArgs) -> Result<u8> {
    let config = predictor_config_from_args(&args)?;

    let factory = PredictorFactory::new(config)?;
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

fn predictor_config_from_args(args: &TagArgs) -> Result<PredictorConfig> {
    let thresholds = Thresholds {
        general: args.general_threshold,
        artist: args.artist_threshold,
        parody: args.parody_threshold,
        character: args.character_threshold,
    };
    thresholds.validate()?;

    Ok(PredictorConfig {
        model_kind: args.model,
        model_repo: resolve_model_repo(args.model, args.model_repo.as_deref()),
        thresholds,
    })
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::{Cli, Commands, predictor_config_from_args};
    use crate::model::{DEFAULT_CAMIE_MODEL_REPO, DEFAULT_MODEL_REPO, ModelKind};

    #[test]
    fn cli_defaults_to_wd_model_family_and_repo() {
        let cli = Cli::try_parse_from(["tagger-cli", "tag", "images"]).unwrap();
        let Commands::Tag(args) = cli.command;

        assert_eq!(args.model, ModelKind::Wd);
        assert!(args.model_repo.is_none());

        let config = predictor_config_from_args(&args).unwrap();
        assert_eq!(config.model_kind, ModelKind::Wd);
        assert_eq!(config.model_repo, DEFAULT_MODEL_REPO);
    }

    #[test]
    fn cli_resolves_camie_default_repo() {
        let cli = Cli::try_parse_from(["tagger-cli", "tag", "images", "--model", "camie"]).unwrap();
        let Commands::Tag(args) = cli.command;

        let config = predictor_config_from_args(&args).unwrap();
        assert_eq!(config.model_kind, ModelKind::Camie);
        assert_eq!(config.model_repo, DEFAULT_CAMIE_MODEL_REPO);
    }

    #[test]
    fn cli_allows_overriding_repo_for_selected_model_family() {
        let cli = Cli::try_parse_from([
            "tagger-cli",
            "tag",
            "images",
            "--model",
            "camie",
            "--model-repo",
            "example/custom-camie",
        ])
        .unwrap();
        let Commands::Tag(args) = cli.command;

        let config = predictor_config_from_args(&args).unwrap();
        assert_eq!(config.model_kind, ModelKind::Camie);
        assert_eq!(config.model_repo, "example/custom-camie");
    }
}
