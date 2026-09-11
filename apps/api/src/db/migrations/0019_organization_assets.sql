CREATE TABLE organization_assets (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'image',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX organization_assets_storage_key
  ON organization_assets (storage_key);

CREATE INDEX organization_assets_org_created
  ON organization_assets (organization_id, created_at DESC, id DESC);

CREATE INDEX organization_assets_org_category
  ON organization_assets (organization_id, category, archived_at);
