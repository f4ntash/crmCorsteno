-- Explicitly distinguish paid, free and not-yet-configured plans.
ALTER TABLE plans ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'unconfigured' CHECK (pricing_mode IN ('paid', 'free', 'unconfigured'));

-- Rebuild the payment table so offline money is auditable without pretending to
-- be a provider payment. Existing Mercado Pago records are preserved.
PRAGMA foreign_keys=OFF;
CREATE TABLE commercial_payments_new (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    payment_source TEXT NOT NULL DEFAULT 'provider' CHECK (payment_source IN ('provider', 'offline')),
    provider TEXT CHECK (provider IS NULL OR provider IN ('mercado_pago')),
    payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'bank_transfer', 'other')),
    provider_payment_id TEXT,
    provider_checkout_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
    provider_status TEXT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
    reference TEXT,
    note TEXT,
    created_by TEXT,
    idempotency_key TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TEXT,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    UNIQUE (provider, provider_payment_id),
    UNIQUE (provider, provider_checkout_id),
    UNIQUE (idempotency_key)
);
INSERT INTO commercial_payments_new (id,organization_id,subscription_id,payment_source,provider,provider_payment_id,provider_checkout_id,status,provider_status,amount_minor,currency,metadata,created_at,updated_at,paid_at)
SELECT id,organization_id,subscription_id,'provider',provider,provider_payment_id,provider_checkout_id,status,provider_status,amount_minor,currency,metadata,created_at,updated_at,paid_at FROM commercial_payments;
DROP TABLE commercial_payments;
ALTER TABLE commercial_payments_new RENAME TO commercial_payments;
PRAGMA foreign_keys=ON;

ALTER TABLE experience_access_periods ADD COLUMN commercial_grant_id TEXT;
CREATE TABLE commercial_grants (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    grant_type TEXT NOT NULL CHECK (grant_type IN ('free', 'promotion', 'courtesy', 'trial', 'support_extension')),
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    note TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    CHECK (starts_at < ends_at)
);
CREATE INDEX commercial_grants_subscription_idx ON commercial_grants (subscription_id, starts_at DESC);
CREATE INDEX commercial_payments_organization_idx ON commercial_payments (organization_id, created_at DESC);
CREATE INDEX commercial_payments_subscription_idx ON commercial_payments (subscription_id, created_at DESC);
CREATE INDEX commercial_payments_status_idx ON commercial_payments (status);
CREATE UNIQUE INDEX commercial_payments_provider_payment_idx ON commercial_payments (provider, provider_payment_id);
CREATE UNIQUE INDEX commercial_payments_provider_checkout_idx ON commercial_payments (provider, provider_checkout_id);
CREATE UNIQUE INDEX commercial_payments_idempotency_idx ON commercial_payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
