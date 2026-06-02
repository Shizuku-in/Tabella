ALTER TABLE import_jobs DROP CONSTRAINT import_jobs_status_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_status_check CHECK (
    status in ('queued', 'running', 'extracting', 'processing', 'completed', 'completed_with_errors', 'failed')
);
