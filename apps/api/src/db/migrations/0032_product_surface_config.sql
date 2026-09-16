-- Surface materials are a separate capability from product_3d_config, which
-- remains dedicated to GLB models. JSON keeps the contract evolvable while
-- asset references remain organization-owned IDs rather than arbitrary URLs.
CREATE TABLE product_surface_config (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  draft_config TEXT,
  published_config TEXT,
  draft_version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE INDEX product_surface_config_organization ON product_surface_config(organization_id, updated_at, product_id);
