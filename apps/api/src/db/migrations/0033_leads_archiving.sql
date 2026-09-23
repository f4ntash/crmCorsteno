ALTER TABLE leads ADD COLUMN archived_at INTEGER;
CREATE INDEX IF NOT EXISTS leads_org_archived_updated ON leads (organization_id, archived_at, updated_at DESC);
