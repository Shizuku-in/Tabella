DROP TABLE IF EXISTS download_jobs;
DROP TYPE IF EXISTS download_job_status;

CREATE TYPE download_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE download_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status download_job_status NOT NULL DEFAULT 'pending',
    total_images INTEGER NOT NULL,
    total_bytes BIGINT NOT NULL,
    file_path TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_download_jobs_user_id ON download_jobs(user_id);
CREATE INDEX idx_download_jobs_expires_at ON download_jobs(expires_at) WHERE expires_at IS NOT NULL;
