-- Performance indexes for common gallery query patterns.
-- images(rating, imported_at DESC, id DESC): accelerates the default
-- "filter by rating, sort newest-first" query path that powers list_images.
-- The rating column has only 3 values but is almost always filtered.
CREATE INDEX images_rating_imported_at_id_idx ON images (rating, imported_at DESC, id DESC);

-- favorites(image_id, user_id): the PK is (user_id, image_id), but
-- list_images runs a correlated EXISTS subquery per row that filters on
-- image_id first. This index lets PostgreSQL answer those subqueries
-- with a single index lookup instead of scanning the PK.
CREATE INDEX favorites_image_id_user_id_idx ON favorites (image_id, user_id);
