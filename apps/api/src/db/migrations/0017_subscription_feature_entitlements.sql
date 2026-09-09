-- Snapshot the capabilities granted at subscription creation.
-- NULL is intentionally retained for legacy subscriptions and means full legacy access.
ALTER TABLE subscriptions ADD COLUMN feature_entitlements_json TEXT;
