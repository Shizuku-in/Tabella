-- Remove tags that are not referenced by any image.
-- These can accumulate when images are deleted or re-tagged prior to the
-- introduction of the per-operation orphan-cleanup logic (tags.rs).
DELETE FROM tags
WHERE NOT EXISTS (
    SELECT 1 FROM image_tags WHERE tag_id = tags.id
);
