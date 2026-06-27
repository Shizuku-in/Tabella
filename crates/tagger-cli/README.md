# tagger-cli

Batch-tag images with [WD Tagger](https://huggingface.co/SmilingWolf/wd-vit-tagger-v3) or [Camie Tagger v2](https://huggingface.co/Camais03/camie-tagger-v2) ONNX models and write sidecar JSON files consumable by [Tabella](../..)'s import pipeline.

## Usage

```bash
# Default: WD model, general threshold 0.35
tagger-cli tag ./images

# Camie Tagger v2
tagger-cli tag ./images --model camie

# Dry-run (preview without writing files)
tagger-cli tag ./images --dry-run

# Overwrite existing sidecars and use 4 threads
tagger-cli tag ./images --overwrite --jobs 4

# Custom thresholds
tagger-cli tag ./images --general-threshold 0.5 --artist-threshold 0.8
```

## Sidecar format

For each `<image>.{png,jpg,webp,gif}`, a `<image>.json` is written next to it:

```json
{
  "tags": ["artist:anmi", "general:1girl"],
  "rating": "safe"
}
```

Tabella's import worker reads these sidecars to auto-annotate images.

## Model download

Models are downloaded from Hugging Face on first run and cached locally. To override the default repo:

```bash
tagger-cli tag ./images --model camie --model-repo my-org/my-custom-model
```
