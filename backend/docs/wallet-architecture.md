# Wallet & Stripe Top-Up Architecture

## Scope & Responsibilities
- **Wallet ownership**: One wallet per admin/customer user (`users.id`). Subscriptions reference their owner; wallet charges and credits are attributed to that user.
- **Supported currencies**: Wallet currency matches the owning user's active subscription currency (default `usd`). Mixed-currency subscriptions require separate wallets or real-time FX conversion (out of current scope).
- **Low-balance thresholds**: Wallet row stores `balance_zero` (boolean) today; roadmap adds `low_balance_threshold_cents` to trigger notifications when balance falls beneath the configured amount.
- **Existing touchpoints**:
  - **Plan checkout** ensures a wallet exists post-activation.
  - **TFN provisioning** and **monitoring add-on** deduct one-time fees from the wallet before provisioning proceeds.
  - **Usage deductions** rely on nightly batches (`usage_deduction_batches`) to debit wallets for rated CDR charges.
  - **Auto-renew** attempts wallet charge first, Stripe fallback second.

## Lifecycle States & Notifications
- **Top-up flow**
  - `wallet_top_ups.status`: `pending` → `requires_payment_method` (optional) → `processing` (awaiting Stripe webhook) → `succeeded` or `failed`.
  - On `succeeded`, wallet service credits balance and ledger entry `wallet_top_up` is written.
  - On `failed`, ledger remains unchanged; user receives in-app + email notification with retry guidance.
- **Usage deduction flow**
  - `usage_deduction_batches.status`: `pending` → `processing` → `completed` (wallet debit) or `failed` (insufficient funds or wallet error). `failed` batches reschedule with exponential backoff; after N retries they trigger suspension alerts.
  - Ledger entry `usage_charge` (from rating) precedes `wallet_deduction`. Wallet debit writes `wallet_deduction` entry ensuring invoice offsets reconcile.
- **Notification hooks**
  - Top-up success/failure (email + optional Slack for ops).
  - Low balance threshold crossed (push + email) with recommended top-up amounts.
  - Usage batch failure (ops alert) to flag stuck deductions.

## Interaction Summary
```
Plan purchase -> wallet ensured -> subscription active
TFN/add-on -> walletService.deductFunds (pre-check) -> provisioning
CDR rated -> usage ledger updated -> deduction batch -> wallet debit -> invoice wallet offset
Manual adjustment -> walletService.credit/debit with metadata -> ledger entry -> audit trail
```

## Open Requirements
- **✅ Implemented**: `Reserve`/`capture` flows, cents-based math (`walletService.js`), and transaction enum extension (`reservation`, `reservation_release`).
- **✅ Implemented**: Stripe-backed top-up scaffolding with `wallet_top_ups` model/service; event handling and integration tests pending migration roll-out.
- **TODO**: Extend `Wallet` schema with `currency` + `low_balance_threshold_cents` (migration ready once legacy impact reviewed).
- **TODO**: Notification plumbing (email templates, in-app alerts, ops webhooks) tied to lifecycle events above.
- **TODO**: Negative balance policy documentation; blocked until postpaid roadmap confirmed.

## Schema & Migration Design Summary
- **Existing tables**: `wallets` (one per user), `transactions` (ledger of credits/debits). Both already live in schema with FK to `users.id` and index on `transactions.wallet_id`. Migration history ensures wallets auto-created for legacy users via service logic.
- **Planned additions**:
  - `wallet_top_ups` (id, wallet_id, subscription_id, amount_cents, currency, status enum, stripe_payment_intent_id UNIQUE, processed_at, created_by, metadata JSONB, timestamps). Indexes on `(wallet_id, created_at DESC)` and `(stripe_payment_intent_id)` for idempotency. Optional `(status)` for dashboards.
  - Extend `wallets` with `currency` (default `usd`) and `low_balance_threshold_cents` (default 0). Add partial index for wallets below threshold once notifications enabled.
- **Backfill strategy**:
  1. Add new columns with defaults (nullable during migration, populate via script tied to subscription currency, then set NOT NULL).
  2. Create `wallet_top_ups` table empty; no backfill needed unless importing historic top-ups.
  3. Run reconciliation script to ensure each active user has a wallet row; leverage existing `walletService.getOrCreateWallet` for gaps.
- **Validation**: Migration checklist includes verifying new indexes, ensuring Stripe intent column unique, and running smoke tests on wallet queries post-migration.

## Wallet Service Enhancements (Planned)
- Introduce `credit`/`debit` helpers that accept integer cents + metadata; wrap DECIMAL math in consistent utility to avoid float precision issues.
- Add `getBalance` and `reserveFunds` (places hold before expensive provisioning, releases on failure) using `SELECT ... FOR UPDATE` to avoid race conditions.
- Enforce ledger entries via a dedicated `walletLedgerService` that writes to `transactions` table with typed enums and structured metadata (e.g., `source: usage_batch`, `referenceId`).

## Stripe Integration Plan
- `POST /wallet/top-ups` (protected): creates PaymentIntent with idempotency key `wallet-{walletId}-{timestamp}`, persists row in `wallet_top_ups` as `pending`, returns `clientSecret` + publishable key hints.
- Optional `POST /wallet/top-ups/:id/cancel` to allow cancel before confirmation.
- Webhook handler ensures:
  - On `payment_intent.succeeded`: mark top-up `succeeded`, call wallet `credit` with amount, append ledger entry `wallet_top_up`.
  - On failure/cancel: mark status `failed`/`canceled`, prompt UI to refresh.
  - Maintain processed flag so retries don’t double-credit; log event metadata for reconciliation.

## Notification & Monitoring Hooks
- Events emitted on `wallet.top_up.succeeded`, `wallet.top_up.failed`, `wallet.low_balance`, and `wallet.deduction.failed` routed through central event bus (or immediate email/log fallback).
- Metrics: count successes/failures, average top-up amount, number of deduction failures, outstanding retry batches.
- Dashboards/alerts: e.g., alert if `wallet_top_ups` failed >5 in 10 minutes.


## Wallet Service Implementation Plan
- Represent wallet amounts in integer cents internally (`balanceCents`, `reservedCents`) and expose helper conversions to/from decimal for UI compatibility.
- Add `reserveFunds`, `captureReservation`, `releaseReservation` flows to support operations that require pre-authorization (e.g., TFN provisioning, plan upgrades). Reservations increase `reservedCents` while leaving the actual decimal balance unchanged until capture.
- Wrap mutations in `sequelize.transaction` and use `SELECT ... FOR UPDATE` on wallet rows to avoid race conditions. Helper: `loadWalletForUpdate(userId, transaction)`.
- Update Transaction model enum with `reservation` and `reservation_release`; store metadata including reservation IDs to trace lifecycle.
- Enforce ledger entries via `Transactions` table with consistent metadata keys (`source`, `referenceId`, `notes`). All wallet API operations must create a transaction row.
- Introduce service helpers:
  - `creditCents(walletId, amountCents, metadata)`
  - `debitCents(walletId, amountCents, metadata)`
  - `reserveCents(walletId, amountCents, reservationId, metadata)`
  - `releaseReservation(walletId, reservationId, metadata)`
  - All return updated wallet snapshot (decimal balance + reserved cents) for caller convenience.
- Implement guard rails: prevent negative balances, enforce currency checks, and raise custom errors (`WalletInsufficientFundsError`, `WalletReservationError`) for clearer API responses.
- Update usage deduction & TFN services to consume new helpers in later steps.
