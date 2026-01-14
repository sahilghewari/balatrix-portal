CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(128) NOT NULL UNIQUE,
  type VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'processing',
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status ON stripe_webhook_events (status);
