-- Migration number: 0024
-- Promote catalog products to organization-owned reusable products.
-- The legacy catalog tables are intentionally retained as a compatibility
-- source for older installations and test fixtures.

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_minor_units INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ARS',
  stock INTEGER NOT NULL DEFAULT 0,
  main_asset_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  published_content TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS products_organization_key
  ON products (organization_id, product_key);

CREATE INDEX IF NOT EXISTS products_organization_status
  ON products (organization_id, status, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (asset_id) REFERENCES organization_assets(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_images_product_asset
  ON product_images (product_id, asset_id);

CREATE INDEX IF NOT EXISTS product_images_product
  ON product_images (product_id, organization_id, sort_order, id);

CREATE TABLE IF NOT EXISTS product_published_images (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS product_published_images_product
  ON product_published_images (product_id, organization_id, sort_order, id);

CREATE TABLE IF NOT EXISTS catalog_experience_products (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  experience_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_experience_products_unique
  ON catalog_experience_products (experience_id, product_id);

CREATE INDEX IF NOT EXISTS catalog_experience_products_order
  ON catalog_experience_products (experience_id, organization_id, sort_order, id);

CREATE TABLE IF NOT EXISTS catalog_published_experience_products (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  experience_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  published_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_published_experience_products_unique
  ON catalog_published_experience_products (experience_id, product_id);

CREATE INDEX IF NOT EXISTS catalog_published_experience_products_order
  ON catalog_published_experience_products (experience_id, organization_id, sort_order, id);

-- Existing catalog product ids become the canonical ids. This preserves asset
-- references and gives existing published catalogs an immediate product
-- snapshot without copying runtime data.
INSERT INTO products (
  id, organization_id, product_key, name, description, price_minor_units,
  currency, stock, main_asset_url, cta_label, cta_url, status,
  published_content, published_at, created_at, updated_at, archived_at
)
SELECT
  p.id, p.organization_id, 'legacy-' || p.id, p.name, p.description,
  p.price_minor_units, p.currency, p.stock, p.main_asset_url, p.cta_label,
  p.cta_url, CASE WHEN p.archived_at IS NULL THEN 'active' ELSE 'archived' END,
  (
    SELECT json_object(
      'name', pp.name,
      'description', pp.description,
      'priceMinorUnits', pp.price_minor_units,
      'currency', pp.currency,
      'stock', pp.stock,
      'mainAssetUrl', pp.main_asset_url,
      'ctaLabel', pp.cta_label,
      'ctaUrl', pp.cta_url
    )
    FROM catalog_published_products pp
    WHERE pp.source_product_id = p.id
      AND pp.organization_id = p.organization_id
    ORDER BY pp.published_at DESC, pp.id DESC
    LIMIT 1
  ),
  (
    SELECT MAX(pp.published_at)
    FROM catalog_published_products pp
    WHERE pp.source_product_id = p.id
      AND pp.organization_id = p.organization_id
  ),
  p.created_at, p.updated_at, p.archived_at
FROM catalog_products p
WHERE NOT EXISTS (SELECT 1 FROM products existing WHERE existing.id = p.id);

INSERT OR IGNORE INTO product_images (id, organization_id, product_id, asset_id, sort_order, created_at)
SELECT i.id, i.organization_id, i.product_id, i.asset_id, i.sort_order, i.created_at
FROM catalog_product_images i
JOIN products p ON p.id = i.product_id AND p.organization_id = i.organization_id;

INSERT OR IGNORE INTO product_published_images (id, organization_id, product_id, asset_url, sort_order, published_at)
SELECT i.id, i.organization_id, pp.source_product_id, i.asset_url, i.sort_order, i.published_at
FROM catalog_published_product_images i
JOIN catalog_published_products pp
  ON pp.id = i.published_product_id
 AND pp.organization_id = i.organization_id
JOIN products p
  ON p.id = pp.source_product_id
 AND p.organization_id = pp.organization_id;

INSERT OR IGNORE INTO catalog_experience_products (
  id, organization_id, experience_id, product_id, sort_order, visible,
  created_at, updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(6))),
  p.organization_id, p.experience_id, p.id, p.sort_order, p.visible,
  p.created_at, p.updated_at
FROM catalog_products p
JOIN products canonical ON canonical.id = p.id AND canonical.organization_id = p.organization_id
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_experience_products existing
  WHERE existing.experience_id = p.experience_id AND existing.product_id = p.id
);

INSERT OR IGNORE INTO catalog_published_experience_products (
  id, organization_id, experience_id, product_id, sort_order, visible, published_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(6))),
  pp.organization_id, pp.experience_id, pp.source_product_id, pp.sort_order,
  1, pp.published_at
FROM catalog_published_products pp
JOIN products p ON p.id = pp.source_product_id AND p.organization_id = pp.organization_id
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_published_experience_products existing
  WHERE existing.experience_id = pp.experience_id
    AND existing.product_id = pp.source_product_id
);
