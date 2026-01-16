BEGIN;

CREATE TABLE IF NOT EXISTS addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    currency VARCHAR(8) NOT NULL DEFAULT 'usd',
    monthly_price_cents INTEGER NOT NULL DEFAULT 0,
    setup_fee_cents INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, addon_id)
);

CREATE INDEX IF NOT EXISTS idx_addons_active ON addons (is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_addons_subscription ON subscription_addons (subscription_id);

COMMIT;
