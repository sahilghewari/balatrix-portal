-- Support seat allocation table
CREATE TABLE IF NOT EXISTS support_seat_allocations (
    admin_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_seats INTEGER NOT NULL DEFAULT 0,
    used_seats INTEGER NOT NULL DEFAULT 0,
    max_monitoring_seats INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_seat_allocations_admin
    ON support_seat_allocations (admin_id);

-- Support seat audit log for traceability
CREATE TABLE IF NOT EXISTS support_seat_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    support_user_id UUID NULL REFERENCES support_users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    metadata JSONB NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_seat_audit_logs_admin
    ON support_seat_audit_logs (admin_id);

CREATE INDEX IF NOT EXISTS idx_support_seat_audit_logs_action
    ON support_seat_audit_logs (action);

