-- 20250117_update_wallet_schema.sql
-- Align wallet schema with reservation support and introduce wallet top-up tracking.

BEGIN;

-- Wallet table enhancements
ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS reserved_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'usd',
    ADD COLUMN IF NOT EXISTS low_balance_threshold_cents INTEGER NOT NULL DEFAULT 0;

-- Extend transaction type enum with reservation operations if missing
DO $$
DECLARE
    enum_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        WHERE t.typname = 'enum_transactions_type'
    ) INTO enum_exists;

    IF enum_exists THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'enum_transactions_type'
              AND e.enumlabel = 'reservation'
        ) THEN
            ALTER TYPE enum_transactions_type ADD VALUE 'reservation';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'enum_transactions_type'
              AND e.enumlabel = 'reservation_release'
        ) THEN
            ALTER TYPE enum_transactions_type ADD VALUE 'reservation_release';
        END IF;
    END IF;
END
$$;

-- Ensure reservation reference column exists on wallet transactions
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS reservation_id VARCHAR(255);

-- Wallet top-up status enum (created here to avoid sync-only creation)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t WHERE t.typname = 'enum_wallet_top_ups_status'
    ) THEN
        CREATE TYPE enum_wallet_top_ups_status AS ENUM (
            'pending',
            'processing',
            'requires_action',
            'succeeded',
            'failed',
            'canceled'
        );
    END IF;
END
$$;

-- Wallet top-up tracking table
CREATE TABLE IF NOT EXISTS wallet_top_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'usd',
    status enum_wallet_top_ups_status NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255) NOT NULL UNIQUE,
    client_secret VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_top_ups_wallet ON wallet_top_ups (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_top_ups_user ON wallet_top_ups (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_top_ups_status ON wallet_top_ups (status);

COMMIT;
