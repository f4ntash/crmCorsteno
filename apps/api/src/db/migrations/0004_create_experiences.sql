-- Migration number: 0004 	 2026-09-08T13:58:04.423Z
CREATE TABLE IF NOT EXISTS experiences (
    id TEXT PRIMARY KEY NOT NULL,

    organization_id TEXT NOT NULL,

    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,

    type TEXT NOT NULL DEFAULT 'roulette',

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft',
            'scheduled',
            'active',
            'paused',
            'expired'
        )),

    schema_version INTEGER NOT NULL DEFAULT 1,

    draft_config TEXT,
    published_config TEXT,

    starts_at TEXT,
    ends_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_experiences_organization_id
ON experiences (organization_id);

CREATE INDEX IF NOT EXISTS idx_experiences_slug
ON experiences (slug);

CREATE INDEX IF NOT EXISTS idx_experiences_status
ON experiences (status);

CREATE INDEX IF NOT EXISTS idx_experiences_dates
ON experiences (starts_at, ends_at);