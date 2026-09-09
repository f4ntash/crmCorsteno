-- Separate historical activation from whether a plan can be sold to new customers.
ALTER TABLE plans ADD COLUMN available_for_sale INTEGER NOT NULL DEFAULT 1 CHECK (available_for_sale IN (0, 1));
CREATE INDEX plans_catalog_idx ON plans (active, available_for_sale, price_amount_minor);
