-- Commercial domain foundation. Payment providers are intentionally out of scope.
CREATE TABLE plans (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly', 'one_time')),
    billing_interval_count INTEGER NOT NULL DEFAULT 1 CHECK (billing_interval_count > 0),
    included_access_days INTEGER CHECK (included_access_days IS NULL OR included_access_days > 0),
    price_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_amount_minor >= 0),
    currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'cancelled', 'expired')),
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
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE subscription_periods (
    id TEXT PRIMARY KEY NOT NULL,
    subscription_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    UNIQUE (subscription_id, starts_at, ends_at),
    UNIQUE (idempotency_key)
);

CREATE TABLE subscription_experiences (
    subscription_id TEXT NOT NULL,
    experience_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (subscription_id, experience_id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (experience_id) REFERENCES experiences(id) ON DELETE CASCADE
);

ALTER TABLE experience_access_periods ADD COLUMN subscription_period_id TEXT REFERENCES subscription_periods(id);

CREATE INDEX subscriptions_organization_idx ON subscriptions (organization_id, created_at DESC);
CREATE INDEX subscriptions_plan_idx ON subscriptions (plan_id);
CREATE INDEX subscription_periods_subscription_idx ON subscription_periods (subscription_id, starts_at DESC);
CREATE INDEX subscription_periods_organization_idx ON subscription_periods (organization_id, starts_at DESC);
CREATE INDEX subscription_experiences_experience_idx ON subscription_experiences (experience_id);
CREATE INDEX experience_access_periods_subscription_period_idx ON experience_access_periods (subscription_period_id);
CREATE UNIQUE INDEX experience_access_periods_subscription_experience_idx ON experience_access_periods (subscription_period_id, experience_id) WHERE subscription_period_id IS NOT NULL;

-- Development/reference catalog only. These are not final commercial prices.
INSERT OR IGNORE INTO plans (id, code, name, description, billing_interval, billing_interval_count, price_amount_minor, currency, active)
VALUES
  ('plan-starter', 'starter', 'Starter', 'Plan de referencia; precio comercial pendiente.', 'monthly', 1, 0, 'ARS', 1),
  ('plan-professional', 'professional', 'Professional', 'Plan de referencia; precio comercial pendiente.', 'monthly', 1, 0, 'ARS', 1),
  ('plan-enterprise', 'enterprise', 'Enterprise', 'Plan de referencia; precio comercial pendiente.', 'yearly', 1, 0, 'ARS', 1);
