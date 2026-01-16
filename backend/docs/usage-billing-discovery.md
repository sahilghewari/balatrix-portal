# Usage-Based Billing Discovery

Objective: Capture the current state of billing components and outline expectations
for the upcoming usage-based billing engine (free-minute burn-down, CDR integration,
wallet auto-deductions).

## 1. Current Billing Artifacts

### Stripe & Subscription Lifecycle
- `backend/routes/billing.js` handles checkout session creation for plan purchases and wallet top-ups.
- `backend/routes/billingWebhook.js` processes Stripe webhook events to finalize payments.
- `backend/services/subscriptionService.js` activates subscriptions from checkout sessions and adjusts status.
- `backend/services/billingSchedulerService.js` runs auto-renew cycles (wallet charge first, Stripe fallback).

### Wallet Management
- `backend/services/walletService.js` exposes `addFunds`, `deductFunds`, and balance tracking.
- Auto-renew logic already relies on `deductFunds` when wallet balance is sufficient.

### Pricing Utilities
- `backend/services/pricingService.js` currently delivers static tier/add-on pricing; there is no per-minute usage rating yet.

### Data Models Involved Today
- `Subscription`, `StripeCheckoutSession`, `Wallet`, `Transaction` cover recurring plans and top-ups.
- No schema exists for CDRs, usage ledgers, or free-minute balances.

## 2. Target Behavior for Usage Rating

### Free-Minute Burn-Down
- Free minutes are tracked at **subscription level** (one balance per active subscription). This matches current plan/customer boundaries and keeps queries localized. Future phases can add per-DID overrides by layering an optional allocation table.
- Each subscription/plan tier includes a fixed pool of free minutes per billing cycle (default defined on the rate card; overridable per subscription).
- Usage consumes remaining free minutes first; only overages generate charges.
- Need persistent balance per subscription with automatic reset on billing-cycle rollover and pro-rated refill when a subscription starts mid-cycle.

### CDR Ingestion
- Establish pipeline to import Call Detail Records from telephony infrastructure (batch files or realtime feed).
- Normalize/validate CDRs (duration, direction, destination, timestamps) and deduplicate.
- Map each CDR to the correct subscription/customer for rating.

### Rating & Charging
- Apply rate-card rules (per destination type, tier pricing) to derive cost for each CDR after free-minute depletion. Rates are stored in USD for now; multi-currency support comes from attaching a currency column to rate rows and normalizing invoices to the subscription currency.
- Maintain usage ledger per subscription with rated charges, free-minute debits, and rollback hooks for corrected CDRs.
- Trigger wallet deductions automatically when chargeable usage occurs. Preferred cadence: nightly batch (reduces Stripe chatter) with optional low-balance alerts when wallet balance drops below a configurable threshold.

### Reporting & Invoicing
- Usage charges should appear on invoices as explicit line items (with detail on free vs paid minutes).
- Admin/frontend dashboards must expose current free-minute balances, recent usage, and wallet deductions.

## 3. Decisions & Remaining Questions
- **Free-minute scope**: subscription-level, with clear extension point for per-DID allocation.
- **Rate-card storage**: introduce dedicated usage rate tables keyed by destination group + plan tier; extendable with currency column.
- **Wallet deduction cadence**: nightly batch with low-balance check; no negative balances (prepaid). If deduction fails, mark subscription for suspension and surface alert.

Remaining topics to confirm before schema design:
- Exact telephony data source format/latency (ESL stream vs daily dump).
- Rate-card specification (destination group taxonomy, currency handling, peak/off-peak rules).
- Whether free-minute refill proration is required when plan upgrades occur mid-cycle.

## 4. Inputs Needed Before Schema Design
- Confirm telephony data source format and acceptable processing latency (realtime ESL vs daily dump).
- Agree on rate-card specification (countries, toll-free vs local, currency handling).
- Decide on wallet rules (prepaid only vs postpaid/credit). Determine behavior when wallet runs dry.

## 5. Schema & Migration Plan (Draft)

### New Tables
1. `cdr_import_batches` — batch metadata (source, status, row counts, checksum) for CDR ingestion runs.
2. `cdr_records` — normalized CDRs linked to batches and subscriptions, storing call metrics, destination group, rating status, and priced amount.
3. `subscription_usage_balances` — per-subscription, per-billing-period free-minute pools with included/remaining seconds and rollover metadata.
4. `subscription_usage_ledger` — append-only ledger capturing free-minute consumption, rated charges, wallet deductions, and manual adjustments (reference CDR when available).

### Key Columns & Constraints
- All tables use `UUID` primary keys via `gen_random_uuid()` (migration ensures `pgcrypto` extension exists).
- Foreign keys:
  - `cdr_records.subscription_id` → `subscriptions.id` (`ON DELETE SET NULL`).
  - `subscription_usage_balances.subscription_id` → `subscriptions.id` (`ON DELETE CASCADE`).
  - `subscription_usage_ledger.subscription_id` → `subscriptions.id` (`ON DELETE CASCADE`).
- Monetary values stored as integer cents; durations as integer seconds.
- Unique constraint on `subscription_usage_balances(subscription_id, billing_period_start, billing_period_end)`.
- `cdr_records.provider_call_id` unique index to avoid duplicate ingestion.

### Index Strategy
- `cdr_records`: `(subscription_id, call_started_at DESC)`, `status`, and unique `(provider_call_id)`.
- `subscription_usage_balances`: unique `(subscription_id, billing_period_start, billing_period_end)` plus index on `status` (`open`, `closed`).
- `subscription_usage_ledger`: `(subscription_id, occurred_at DESC)` and index on `cdr_record_id` for reconciliation.
- `cdr_import_batches`: `status` index for operational dashboards.

### Migration Scripts
- SQL migration `backend/scripts/20250116_create_usage_tables.sql` drafted to create the four tables, constraints, indexes, and guard `pgcrypto` extension.
- Follow-up script (optional) `20250116_backfill_usage_balances.sql` to seed balances for active subscriptions if we choose SQL-based backfill.

### Backfill & Rollout Strategy
1. Deploy schema with empty tables.
2. Backfill `subscription_usage_balances` for active subscriptions by inserting the current billing period (start/end, included seconds from plan tier, remaining = included).
3. Import historical CDRs via `cdr_import_batches` (if available) and run rating job to populate `subscription_usage_ledger`.
4. Keep rating & wallet deduction jobs behind a feature flag; monitor new tables during dry-run before enabling auto-deductions in production.

---
Updated 2025-01-14. Adjust as we move into step 2 (Schema & Migration Planning).
