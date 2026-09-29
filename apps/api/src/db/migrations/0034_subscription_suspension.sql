-- Allow a platform administrator to suspend a subscription without deleting
-- its periods or experience configuration.
PRAGMA foreign_keys=OFF;

-- Preserve unlimited access for historical experiences while requiring new
-- Roulette experiences to receive an active commercial period before serving.
ALTER TABLE experiences ADD COLUMN commercial_access_required INTEGER NOT NULL DEFAULT 0 CHECK (commercial_access_required IN (0, 1));

CREATE TABLE subscriptions_new (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'cancelled', 'expired')),
    starts_at TEXT NOT NULL,
    current_period_start TEXT NOT NULL,
    current_period_end TEXT NOT NULL,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
    price_amount_minor INTEGER NOT NULL CHECK (price_amount_minor >= 0),
    currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly', 'one_time')),
    billing_interval_count INTEGER NOT NULL CHECK (billing_interval_count > 0),
    included_access_days INTEGER CHECK (included_access_days IS NULL OR included_access_days > 0),
    provider TEXT,
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    feature_entitlements_json TEXT,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);

INSERT INTO subscriptions_new (
    id, organization_id, plan_id, status, starts_at, current_period_start,
    current_period_end, cancel_at_period_end, price_amount_minor, currency,
    billing_interval, billing_interval_count, included_access_days, provider,
    provider_customer_id, provider_subscription_id, created_at, updated_at,
    feature_entitlements_json
)
SELECT
    id, organization_id, plan_id, status, starts_at, current_period_start,
    current_period_end, cancel_at_period_end, price_amount_minor, currency,
    billing_interval, billing_interval_count, included_access_days, provider,
    provider_customer_id, provider_subscription_id, created_at, updated_at,
    feature_entitlements_json
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_new RENAME TO subscriptions;

CREATE INDEX subscriptions_organization_idx ON subscriptions (organization_id, created_at DESC);
CREATE INDEX subscriptions_plan_idx ON subscriptions (plan_id);

PRAGMA foreign_keys=ON;
