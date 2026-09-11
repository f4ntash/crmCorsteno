-- Migration number: 0023
-- Draft and published content snapshots for customer-managed site channels.
CREATE TABLE channel_content (
    channel_id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    profile_key TEXT NOT NULL,
    profile_version INTEGER NOT NULL DEFAULT 1,
    draft_content TEXT NOT NULL,
    published_content TEXT,
    published_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE INDEX channel_content_organization
  ON channel_content (organization_id, updated_at DESC);
