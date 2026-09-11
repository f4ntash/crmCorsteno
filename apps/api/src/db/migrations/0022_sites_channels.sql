-- Migration number: 0022
-- Organization-scoped delivery destinations for managed experiences.
CREATE TABLE channels (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('external_site', 'corsteno_site', 'hosted_runtime')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE UNIQUE INDEX channels_organization_name
  ON channels (organization_id, name);

CREATE INDEX channels_organization_status
  ON channels (organization_id, status, name);

CREATE TABLE experience_channels (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    experience_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (experience_id) REFERENCES experiences(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE UNIQUE INDEX experience_channels_experience_channel
  ON experience_channels (experience_id, channel_id);

CREATE INDEX experience_channels_channel
  ON experience_channels (channel_id, organization_id);

CREATE INDEX experience_channels_organization
  ON experience_channels (organization_id, experience_id);

-- Existing public experiences keep their hosted runtime behavior through one
-- reusable organization-level channel. The experience slug remains the public
-- identity for that hosted delivery.
INSERT INTO channels (id, organization_id, name, type, status, url, created_at, updated_at)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
  o.id,
  'Corsteno Hosted',
  'hosted_runtime',
  'active',
  NULL,
  unixepoch('now') * 1000,
  unixepoch('now') * 1000
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM channels c
  WHERE c.organization_id = o.id AND c.type = 'hosted_runtime'
);

INSERT INTO experience_channels (id, organization_id, experience_id, channel_id, created_at)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
  e.organization_id,
  e.id,
  c.id,
  unixepoch('now') * 1000
FROM experiences e
JOIN channels c ON c.organization_id = e.organization_id AND c.type = 'hosted_runtime'
WHERE NOT EXISTS (
  SELECT 1 FROM experience_channels ec
  WHERE ec.experience_id = e.id AND ec.channel_id = c.id
);
