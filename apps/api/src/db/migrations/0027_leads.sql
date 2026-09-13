-- Leads v1: organization-scoped prospect records and future job history.
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  website TEXT NOT NULL,
  domain TEXT NOT NULL,
  city TEXT NOT NULL,
  province_state TEXT NOT NULL,
  country TEXT NOT NULL,
  address TEXT,
  google_maps_url TEXT,
  instagram_url TEXT,
  linkedin_url TEXT,
  phone TEXT,
  contact_name TEXT,
  contact_role TEXT,
  contact_email TEXT,
  source TEXT NOT NULL,
  source_reference TEXT,
  score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  recommended_offer TEXT,
  recommended_demo TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','ENRICHING','QUALIFIED','TO_CONTACT','CONTACTED','REPLIED','MEETING','OPPORTUNITY','WON','LOST')),
  notes TEXT,
  last_contact_at INTEGER,
  next_action_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS leads_org_updated ON leads (organization_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS leads_org_status ON leads (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS leads_org_category ON leads (organization_id, category, city);
CREATE INDEX IF NOT EXISTS leads_org_domain ON leads (organization_id, domain);

CREATE TABLE IF NOT EXISTS lead_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('FINDER','ENRICHER','SCORING','OUTREACH_PREPARATION')),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS lead_jobs_org_created ON lead_jobs (organization_id, created_at DESC);
