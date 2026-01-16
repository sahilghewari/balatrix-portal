-- 20250116_create_usage_tables.sql
-- Schema additions for usage-based billing (CDR ingestion, usage balances, ledger)

BEGIN;

-- Ensure UUID generation available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS cdr_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    checksum VARCHAR(128),
    metadata JSONB DEFAULT '{}'::jsonb,
    last_error TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cdr_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES cdr_import_batches(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider_call_id VARCHAR(128) UNIQUE,
    direction VARCHAR(16) NOT NULL,
    destination VARCHAR(64),
    destination_group VARCHAR(64),
    call_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    call_ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    billable_seconds INTEGER NOT NULL DEFAULT 0,
    rate_cents INTEGER,
    currency VARCHAR(8) DEFAULT 'usd',
    cost_cents INTEGER DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    retry_at TIMESTAMP WITH TIME ZONE,
    error_code VARCHAR(64),
    error_message TEXT,
    raw_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdr_records_subscription_started_at
    ON cdr_records (subscription_id, call_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cdr_records_status
    ON cdr_records (status);

CREATE INDEX IF NOT EXISTS idx_cdr_records_retry
    ON cdr_records (retry_at)
    WHERE retry_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscription_usage_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    included_seconds INTEGER NOT NULL DEFAULT 0,
    rollover_seconds INTEGER NOT NULL DEFAULT 0,
    consumed_seconds INTEGER NOT NULL DEFAULT 0,
    remaining_seconds INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, billing_period_start, billing_period_end)
);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_balances_status
    ON subscription_usage_balances (status);

CREATE TABLE IF NOT EXISTS subscription_usage_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    cdr_record_id UUID REFERENCES cdr_records(id) ON DELETE SET NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    entry_type VARCHAR(32) NOT NULL,
    seconds_delta INTEGER DEFAULT 0,
    amount_cents INTEGER DEFAULT 0,
    currency VARCHAR(8) DEFAULT 'usd',
    balance_seconds_after INTEGER,
    balance_cents_after INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_subscription_occurred
    ON subscription_usage_ledger (subscription_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_cdr_record
    ON subscription_usage_ledger (cdr_record_id);

CREATE INDEX IF NOT EXISTS idx_cdr_import_batches_status
    ON cdr_import_batches (status);

CREATE TABLE IF NOT EXISTS usage_deduction_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    charge_date DATE NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'usd',
    total_amount_cents INTEGER NOT NULL DEFAULT 0,
    pending_amount_cents INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    retry_after TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, charge_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_deduction_batches_status
    ON usage_deduction_batches (status);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number VARCHAR(32) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    currency VARCHAR(8) NOT NULL DEFAULT 'usd',
    billing_cycle VARCHAR(16) NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    issue_date TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    usage_amount_cents INTEGER NOT NULL DEFAULT 0,
    plan_amount_cents INTEGER NOT NULL DEFAULT 0,
    wallet_offset_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_subscription_period
    ON invoices (subscription_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_invoices_user_status
    ON invoices (user_id, status);

COMMIT;
