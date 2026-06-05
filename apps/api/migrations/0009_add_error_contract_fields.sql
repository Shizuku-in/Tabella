ALTER TABLE import_jobs
    ADD COLUMN error_code TEXT,
    ADD COLUMN error_params JSONB,
    ADD COLUMN error_detail TEXT;

ALTER TABLE download_jobs
    ADD COLUMN error_code TEXT,
    ADD COLUMN error_params JSONB,
    ADD COLUMN error_detail TEXT;
