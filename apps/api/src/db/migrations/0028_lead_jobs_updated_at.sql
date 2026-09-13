ALTER TABLE lead_jobs ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE lead_jobs SET updated_at = COALESCE(started_at, created_at);
