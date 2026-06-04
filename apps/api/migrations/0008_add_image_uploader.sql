ALTER TABLE images ADD COLUMN uploader_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX images_uploader_id_idx ON images(uploader_id);
