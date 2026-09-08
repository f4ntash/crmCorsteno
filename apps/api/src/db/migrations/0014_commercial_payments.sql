-- Payment-provider records are internal audit records. Provider callbacks never
-- mutate experience state directly; they call the commercial period service.
CREATE TABLE commercial_payments (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('mercado_pago')),
    provider_payment_id TEXT,
    provider_checkout_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
    provider_status TEXT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TEXT,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    UNIQUE (provider, provider_payment_id),
    UNIQUE (provider, provider_checkout_id)
);

ALTER TABLE subscription_periods ADD COLUMN commercial_payment_id TEXT REFERENCES commercial_payments(id);

CREATE INDEX commercial_payments_organization_idx ON commercial_payments (organization_id, created_at DESC);
CREATE INDEX commercial_payments_subscription_idx ON commercial_payments (subscription_id, created_at DESC);
CREATE INDEX commercial_payments_status_idx ON commercial_payments (status);
CREATE UNIQUE INDEX subscription_periods_commercial_payment_idx ON subscription_periods (commercial_payment_id) WHERE commercial_payment_id IS NOT NULL;
