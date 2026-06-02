-- This script inserts some mock data into your local Tabella database
-- so you can test the frontend /api/images integration.

-- You can run this with:
-- psql -d <your-db-name> -f mock_data.sql

BEGIN;

-- 1. Insert some dummy tags
INSERT INTO tags (id, namespace, name, normalized_namespace, normalized_name)
VALUES 
    (1, '', 'nature', '', 'nature'),
    (2, '', 'waterfall', '', 'waterfall'),
    (3, 'artist', 'johndoe', 'artist', 'johndoe'),
    (4, 'series', 'landscape', 'series', 'landscape')
ON CONFLICT DO NOTHING;

-- 2. Insert some dummy images
-- We will use some random unsplash image URLs for preview/thumbnail 
-- to simulate the images we were fetching in the mock.
-- In a real scenario, these would be local file paths inside `media_root`.
-- To test without a local static server, we can put absolute http URLs here, 
-- but the backend prepends `/media/`. Let's just put `https://images.unsplash.com/...`
-- Actually, the backend code `format!("/media/{}", path)` will result in `/media/https://...`.
-- Since `api.rs` does `format!("/media/{}", path)`, we need to make sure the frontend can load them.
-- If the user doesn't have a static server, the images will 404.
-- For local testing, you might need to create the `var/media` folder and put an image there.
-- Let's assume we place a dummy image at `var/media/test.jpg`.

INSERT INTO images (
    id, sha256, original_path, preview_path, thumbnail_path, original_filename, 
    mime_type, width, height, file_size, rating
)
VALUES 
    (1, 'dummy_sha_1', 'test.jpg', 'test.jpg', 'test.jpg', 'nature1.jpg', 'image/jpeg', 800, 600, 102400, 'safe'),
    (2, 'dummy_sha_2', 'test2.jpg', 'test2.jpg', 'test2.jpg', 'nature2.jpg', 'image/jpeg', 1200, 1600, 204800, 'safe'),
    (3, 'dummy_sha_3', 'test3.jpg', 'test3.jpg', 'test3.jpg', 'portrait.jpg', 'image/jpeg', 1000, 1000, 150000, 'suggestive')
ON CONFLICT DO NOTHING;

-- 3. Link images to tags
INSERT INTO image_tags (image_id, tag_id)
VALUES 
    (1, 1),
    (1, 2),
    (2, 1),
    (2, 3),
    (3, 4)
ON CONFLICT DO NOTHING;

-- Also reset the sequence so future inserts work properly
SELECT setval('images_id_seq', (SELECT MAX(id) FROM images));
SELECT setval('tags_id_seq', (SELECT MAX(id) FROM tags));

COMMIT;
