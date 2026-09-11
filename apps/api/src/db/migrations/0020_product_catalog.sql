CREATE TABLE catalog_products (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  experience_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_minor_units INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ARS',
  stock INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  main_asset_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id)
);

CREATE INDEX catalog_products_experience ON catalog_products (experience_id, organization_id);
CREATE INDEX catalog_products_visible ON catalog_products (experience_id, visible, archived_at);

CREATE TABLE catalog_published_products (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  experience_id TEXT NOT NULL,
  source_product_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_minor_units INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ARS',
  stock INTEGER NOT NULL DEFAULT 0,
  main_asset_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  published_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id)
);

CREATE INDEX catalog_published_products_experience ON catalog_published_products (experience_id, organization_id);
