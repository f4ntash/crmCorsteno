CREATE TABLE experiences_new (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'roulette',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  draft_config TEXT,
  published_config TEXT,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO experiences_new
SELECT id, organization_id, name, slug, type,
  CASE WHEN status IN ('scheduled','active','expired') THEN 'published' ELSE status END,
  schema_version, draft_config, published_config, starts_at, ends_at, created_at, updated_at
FROM experiences;

DROP TABLE experiences;
ALTER TABLE experiences_new RENAME TO experiences;
CREATE INDEX idx_experiences_organization_id ON experiences (organization_id);
CREATE INDEX idx_experiences_slug ON experiences (slug);
CREATE INDEX idx_experiences_status ON experiences (status);
CREATE INDEX idx_experiences_dates ON experiences (starts_at, ends_at);
