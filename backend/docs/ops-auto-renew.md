# Auto-Renew Operations Guide

This document explains how to monitor and operate the subscription auto-renew pipeline.

## Overview
- Auto-renew runs via `runAutoRenewCycle()` (see `backend/jobs/autoRenew.js`), invoked on a 15-minute interval by default (configurable via `AUTO_RENEW_INTERVAL_MINUTES`).
- The job finds due subscriptions, tries wallet deduction first, then Stripe Checkout, and records failures.

## Logs & Alerts
- Successful cycles log only when failures occur.
- Warnings:
  - `Auto-renew charge failed`: wallet and Stripe charge attempts could not complete for the current cycle. Investigate user balance/Stripe configuration.
  - `Auto-renew outcome indicates failure`: renewal returned a failure status from the pipeline.
- Errors:
  - `Auto-renew processing failed`: unexpected exception while processing a subscription (retry will occur on next run).

Configure your log aggregator to alert when these warnings/errors exceed baseline thresholds.

## Manual Invocation
Run `node -e "require('./jobs/autoRenew').runAutoRenewCycle().then(console.log)"` from within `backend/` to trigger an immediate cycle.

## Schema Requirements
- Ensure the migration `backend/scripts/20250114_create_stripe_webhook_events.sql` is applied (or incorporated into your migration tooling) so webhook dedupe data persists.

## Investigating Failures
1. Check logs for the subscription ID and user ID.
2. Verify wallet balance via `Wallet` table and transactions.
3. Inspect Stripe logs/PaymentIntents for corresponding client tokens (`renew_<subscriptionId>_<timestamp>`).

## Configuration Flags
- `DISABLE_SCHEDULER=true`: disables automatic interval execution.
- `AUTO_RENEW_INTERVAL_MINUTES`: override interval frequency.

## Future Enhancements
- Hook warnings/errors into email/on-call alerts.
- Add dashboard metrics (e.g., success/failure counts per run).
