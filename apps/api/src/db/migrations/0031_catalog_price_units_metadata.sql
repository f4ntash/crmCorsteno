-- Optional merchandising fields shared by legacy and organization-owned catalog products.
-- Existing furniture products remain unchanged when these values are NULL.
ALTER TABLE catalog_products ADD COLUMN price_unit TEXT;
ALTER TABLE catalog_products ADD COLUMN metadata TEXT;

ALTER TABLE catalog_published_products ADD COLUMN price_unit TEXT;
ALTER TABLE catalog_published_products ADD COLUMN metadata TEXT;

ALTER TABLE products ADD COLUMN price_unit TEXT;
ALTER TABLE products ADD COLUMN metadata TEXT;
