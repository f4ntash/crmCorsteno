-- Public site identity and explicitly published Product associations.
ALTER TABLE channels ADD COLUMN public_key TEXT;

UPDATE channels
SET public_key = 'site_' || lower(hex(randomblob(16)))
WHERE public_key IS NULL OR public_key = '';

CREATE UNIQUE INDEX IF NOT EXISTS channels_public_key
  ON channels (public_key);

CREATE TABLE channel_products (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE UNIQUE INDEX channel_products_channel_product
  ON channel_products (channel_id, product_id);

CREATE INDEX channel_products_channel_order
  ON channel_products (channel_id, organization_id, sort_order, id);

CREATE TABLE channel_published_products (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    published_at INTEGER NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE UNIQUE INDEX channel_published_products_channel_product
  ON channel_published_products (channel_id, product_id);

CREATE INDEX channel_published_products_channel_order
  ON channel_published_products (channel_id, organization_id, sort_order, id);
