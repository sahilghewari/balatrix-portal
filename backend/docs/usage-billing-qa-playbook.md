# Usage Billing QA Playbook

This checklist helps validate end-to-end usage-based billing in non-production environments.  Run these steps after applying migrations (`20250116_create_usage_tables.sql`) and seeding the necessary rate cards/subscriptions.

## 1. Environment Prep
- Ensure `.env` has `RUN_USAGE_PIPELINE_ON_BOOT=true` and `USAGE_PIPELINE_INTERVAL_MINUTES` set to a sensible cadence (e.g., 15).
- Confirm local Postgres is running and migrations executed.
- Seed or verify at least one **active subscription** with a positive plan amount and `autoRenew=true`.
- Optional: configure `CURRENCY_RATES` JSON in `.env` when validating multi-currency scenarios.

## 2. Free-Minute Burn Test
1. Seed a usage balance with known `included_seconds` (e.g., 600).
2. POST a CDR via `/usage/cdrs` ingestion job or fixtures (`npm --prefix backend run seed:cdr`).
3. Run `npm --prefix backend run usage:pipeline` (or wait for scheduler).
4. Verify:
   - `subscription_usage_balances.remaining_seconds` reduced by call duration.
   - `subscription_usage_ledger` contains `free_minutes_consumed` + `usage_charge` rows.

## 3. Wallet Deduction Test
1. Add wallet funds for the subscription owner via `/wallet/top-up` or `addFunds` helper.
2. Re-run the usage pipeline.
3. Check `usage_deduction_batches` for `status='completed'` and `pending_amount_cents=0`.
4. Confirm `subscription_usage_ledger` gained a `wallet_deduction` entry with negative cents.
5. Review wallet transactions to ensure a matching deduction.

## 4. Invoice Generation
1. Trigger `npm --prefix backend run usage:invoice --subscription=<id>` or hit the admin invoice endpoint.
2. Inspect the created invoice:
   - `usage_amount_cents` matches aggregated usage charges.
   - `wallet_offset_cents` equals total wallet deductions for that period.
   - Notes detail free-minute consumption.
3. Download/render invoice via frontend (Usage page → View Invoice) and confirm UI values align.

## 5. Scheduler & Automation
- Allow nightly cron/job to run or execute `npm --prefix backend run usage:pipeline` multiple times.
- Validate that reruns do not duplicate ledger entries (idempotent) and retries respect `retryAfter` fields.

## 6. Multi-Currency & Tiered Rates (Optional)
- Adjust subscription currency and rate card tiers.
- Seed CDRs with destination groups hitting alternate rates.
- Ensure rating converts to subscription currency and ledger metadata records destination group.

## 7. Error Handling
- Simulate a failed wallet deduction (set wallet funds below usage charge) and rerun pipeline.
- Confirm batch transitions to `failed`, logs contain reason, and retry clears once funds added.
- Verify alerts/log forwarding picks up failures (check `usageRating` job logs).

## 8. Frontend Verification
- Visit Usage dashboard: confirm remaining minutes, graphs, and ledger tables reflect backend data.
- Ensure super-admin `adminId` selector switches tenants and updates metrics.

## 9. Stripe/Auto-Renew Regression
- Run `npm --prefix backend test` to cover automated suite (checkout, pipeline, invoice).
- Manually simulate auto-renew by setting `nextBillingDate` to yesterday and running scheduler.
- Invoice should attach to renewal record and wallet deductions should stay in sync.

## 10. Sign-off
- Capture screenshots/log extracts demonstrating free-minute burn, wallet deduction, invoice totals.
- File issues for any edge cases (e.g., currency mismatch) before promoting to higher environments.
