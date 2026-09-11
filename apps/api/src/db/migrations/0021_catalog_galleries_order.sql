ALTER TABLE catalog_products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE catalog_products AS current
SET sort_order = (
  SELECT COUNT(*)
  FROM catalog_products AS previous
  WHERE previous.experience_id = current.experience_id
    AND previous.organization_id = current.organization_id
    AND previous.archived_at IS NULL
    AND (previous.created_at < current.created_at OR (previous.created_at = current.created_at AND previous.id < current.id))
);

ALTER TABLE catalog_published_products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE catalog_published_products AS current
SET sort_order = (
  SELECT COUNT(*)
  FROM catalog_published_products AS previous
  WHERE previous.experience_id = current.experience_id
    AND previous.organization_id = current.organization_id
    AND previous.rowid < current.rowid
);

CREATE INDEX catalog_products_order
  ON catalog_products (experience_id, organization_id, sort_order, id);

CREATE INDEX catalog_published_products_order
  ON catalog_published_products (experience_id, organization_id, sort_order, id);

CREATE TABLE catalog_product_images (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  experience_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id),
  FOREIGN KEY (product_id) REFERENCES catalog_products(id),
  FOREIGN KEY (asset_id) REFERENCES organization_assets(id)
);

CREATE UNIQUE INDEX catalog_product_images_product_asset
  ON catalog_product_images (product_id, asset_id);

CREATE INDEX catalog_product_images_product
  ON catalog_product_images (product_id, organization_id, sort_order, id);

CREATE TABLE catalog_published_product_images (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  experience_id TEXT NOT NULL,
  published_product_id TEXT NOT NULL,
  source_image_id TEXT,
  asset_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id),
  FOREIGN KEY (published_product_id) REFERENCES catalog_published_products(id)
);

CREATE INDEX catalog_published_product_images_product
  ON catalog_published_product_images (published_product_id, organization_id, sort_order, id);
