ALTER TABLE leads ADD COLUMN dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_dedupe_key ON leads (organization_id, dedupe_key);
