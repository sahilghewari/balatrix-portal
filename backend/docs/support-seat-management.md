# Support Seat Management Overview

This document captures the database changes and high-level workflow for the
support seat management features introduced in January 2025.

## Schema Changes

- `support_seat_allocations` — stores the total and used seats per tenant,
  plus a dedicated monitoring seat quota (`max_monitoring_seats`).
  See `backend/scripts/20250115_create_support_seats.sql` for DDL.
- `support_seat_audit_logs` — immutable audit history for seat allocation
  updates, monitoring access changes, and user lifecycle events.
- `support_users` — now enforces a unique `(admin_id, email)` constraint and
  tracks seat numbers, monitoring assignments, invitation metadata.

Run migrations in the following order when deploying:

1. `add_webrtc_username_column.sql`
2. `20250114_create_stripe_webhook_events.sql`
3. `20250115_create_support_seats.sql`

## API Overview

- `GET /support-users?adminId=` — list tenant support users (super admins can
  target other tenants via `adminId`).
- `POST /support-users` — create support users with automatic seat reservation.
- `PATCH /support-users/:supportUserId` — update user profile, suspend/reactivate.
- `DELETE /support-users/:supportUserId` — removes user and frees the seat.
- `GET /support-users/allocation` — view current seat usage and monitoring quota.
- `PUT /support-users/allocation` — super admin endpoint to adjust quotas.

All mutating endpoints log to `support_seat_audit_logs` and enforce seat
limits/resolution via `supportSeatService`.

## Monitoring Add-on Enforcement

- Purchasing the monitoring add-on deducts wallet funds and toggles the
  subscription flag.
- Granting monitoring access validates quota via `enforceMonitoringSeatLimit`
  before assigning a monitoring extension to a support user.
- Revoking access releases the extension and writes an audit entry.

## Follow-up

- Frontend needs a seat management UI to consume these endpoints.
- Add reporting dashboards for audit log review.
- Extend monitoring service to trigger notifications on seat exhaustion.

