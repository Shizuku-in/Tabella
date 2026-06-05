use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use sha2::{Digest, Sha256};
use webp::Encoder;

pub(crate) struct ImageMetadata {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) thumbnail_path: String,
    pub(crate) sample_path: String,
}

pub(crate) fn compute_sha256(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    Ok(hex::encode(hasher.finalize()))
}

pub(crate) fn process_image(
    source_path: &Path,
    media_root: &Path,
    sha256: &str,
    config: &crate::config::DynamicConfig,
) -> Result<ImageMetadata> {
    let img = image::open(source_path).context("failed to open image")?;
    let (width, height) = img.dimensions();

    // Ensure target directories exist
    let thumbnails_dir = media_root.join("thumbnails");
    let samples_dir = media_root.join("samples");
    std::fs::create_dir_all(&thumbnails_dir).context("failed to create thumbnails directory")?;
    std::fs::create_dir_all(&samples_dir).context("failed to create samples directory")?;

    let thumbnail_filename = format!("{}.webp", sha256);
    let sample_filename = format!("{}.webp", sha256);

    let thumbnail_full_path = thumbnails_dir.join(&thumbnail_filename);
    let sample_full_path = samples_dir.join(&sample_filename);

    // 1. Generate Thumbnail
    let thumbnail_img = img.resize(config.thumbnail_size, config.thumbnail_size, image::imageops::FilterType::Lanczos3);
    encode_webp(&thumbnail_img, &thumbnail_full_path, config.thumbnail_quality)
        .context("failed to encode thumbnail webp")?;

    // 2. Generate Sample
    if config.sample_size > 0 {
        let sample_img = img.resize(config.sample_size, config.sample_size, image::imageops::FilterType::Lanczos3);
        encode_webp(&sample_img, &sample_full_path, config.sample_quality).context("failed to encode sample webp")?;
    } else {
        encode_webp(&img, &sample_full_path, config.sample_quality).context("failed to encode sample webp")?;
    }

    Ok(ImageMetadata {
        width,
        height,
        thumbnail_path: format!("thumbnails/{}", thumbnail_filename),
        sample_path: format!("samples/{}", sample_filename),
    })
}

fn encode_webp(img: &DynamicImage, output_path: &Path, quality: f32) -> Result<()> {
    // webp crate encoder expects rgb or rgba
    let rgba; // declare outside to extend lifetime
    let encoder = match img {
        DynamicImage::ImageRgb8(rgb) => Encoder::from_rgb(rgb.as_raw(), img.width(), img.height()),
        DynamicImage::ImageRgba8(rgba_img) => {
            Encoder::from_rgba(rgba_img.as_raw(), img.width(), img.height())
        }
        _ => {
            // Convert to Rgba8 if it's not Rgb8 or Rgba8
            rgba = img.to_rgba8();
            Encoder::from_rgba(rgba.as_raw(), img.width(), img.height())
        }
    };

    let webp_memory = encoder.encode(quality);
    std::fs::write(output_path, &*webp_memory)?;

    Ok(())
}
