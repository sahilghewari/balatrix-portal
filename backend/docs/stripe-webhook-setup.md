# Stripe Webhook Setup (Local Development)

Follow these steps whenever you need to refresh the Stripe webhook secret for the wallet top-up flow in local development.

## 1. Configure environment variables

Make sure the backend `.env` file contains valid Stripe keys:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=
```

Leave `STRIPE_WEBHOOK_SECRET` blank or with the previous value for now; it will be replaced in Step 3.

Restart the backend after editing the `.env` file whenever you change any of these values.

## 2. Install/verify Stripe CLI

The webhook listener relies on the Stripe CLI. Install it (if you have not already) by following Stripe’s official instructions:

- macOS (Homebrew):
  ```bash
  brew install stripe/stripe-cli/stripe
  ```
- Linux:
  ```bash
  curl -L https://stripe.dev/stripe-cli/install.sh | sudo bash
  ```
- Windows (Winget):
  ```powershell
  winget install -e --id Stripe.StripeCLI
  ```

Verify the installation:

```bash
stripe version
```

## 3. Start the webhook listener

From the repository root (or any folder), run the Stripe CLI to forward webhooks to your local backend:

```bash
stripe listen --forward-to localhost:3000/billing/webhook
```

The CLI will print a line similar to:

```
Ready! Your webhook signing secret is whsec_12345...
```

Copy the value after `whsec_` (include the full string) and update the backend `.env` file:

```
STRIPE_WEBHOOK_SECRET=whsec_12345...
```

Restart the backend server so it picks up the new secret.

> **Tip:** Every time you restart the Stripe CLI listener you get a new `whsec_…` value. Update the `.env` and restart the backend each time.

## 4. Verify delivery

While the listener is running, trigger a payment (e.g., complete a wallet top-up). The Stripe CLI console should show events such as `payment_intent.succeeded`. The backend logs should confirm:

```
Stripe webhook handler processed event ...
```

You can also check the `wallet_top_ups` table to confirm the status changed to `succeeded` and that a recharge transaction was written.

```bash
psql -h localhost -U postgres -d balatrix_portal \
  -c "SELECT status, processed_at FROM wallet_top_ups ORDER BY created_at DESC LIMIT 5;"
```

## 5. Troubleshooting

- **Signature verification failed:** Ensure the CLI is running and `.env` contains the exact secret the CLI printed. Restart the backend after updating.
- **No events arrive:** Confirm you are forwarding to the correct port/URL (`localhost:3000/billing/webhook`) and that the backend server is running.
- **Duplicate credits:** The webhook handler is idempotent, but if you re-run the listener with a new secret, make sure the previous CLI instance is stopped to avoid duplicate deliveries.

Once you are done testing, stop the Stripe CLI with `Ctrl+C`.
