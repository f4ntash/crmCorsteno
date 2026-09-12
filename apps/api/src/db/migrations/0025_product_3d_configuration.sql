-- Migration number: 0025
-- Corsteno-only technical 3D configuration for canonical organization products.

CREATE TABLE IF NOT EXISTS product_3d_config (
  product_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  draft_config TEXT,
  published_config TEXT,
  draft_model_asset_id TEXT,
  published_model_asset_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (draft_model_asset_id) REFERENCES organization_assets(id),
  FOREIGN KEY (published_model_asset_id) REFERENCES organization_assets(id)
);

CREATE INDEX IF NOT EXISTS product_3d_config_organization
  ON product_3d_config (organization_id, updated_at DESC, product_id);

CREATE INDEX IF NOT EXISTS product_3d_config_draft_asset
  ON product_3d_config (organization_id, draft_model_asset_id);

CREATE INDEX IF NOT EXISTS product_3d_config_published_asset
  ON product_3d_config (organization_id, published_model_asset_id);
