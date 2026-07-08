# BuildEx payments and payouts: exact Supabase setup

This project already contains the SQL and Edge Function code. To enable real payments and builder withdrawals, use only these payment-related migrations:

1. `supabase/migrations/0031_payments.sql`
2. `supabase/migrations/0033_payouts.sql`
3. `supabase/migrations/0034_payment_reconciliation_and_fiat_payouts.sql`

Do not run `supabase/migrations/0032_revoke_mock_payment.sql` until real NOWPayments checkout has been tested successfully. That migration disables the old mock payment path.

## Supabase dashboard steps

### 1. Run the SQL

Open your Supabase project, then:

1. Go to `SQL Editor`.
2. Click `New query`.
3. Open `supabase/migrations/0031_payments.sql` from this repo, copy all of it, paste it into the SQL editor, and click `Run`.
4. Repeat the same steps for:
   - `supabase/migrations/0033_payouts.sql`
   - `supabase/migrations/0034_payment_reconciliation_and_fiat_payouts.sql`

Run them in exactly that order.

### 2. Add Edge Function secrets

Open your Supabase project, then:

1. Go to `Edge Functions`.
2. Open the secrets/settings page for functions.
3. Add these secrets:

For incoming payments:

- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`

For outgoing payouts:

- `NOWPAYMENTS_EMAIL`
- `NOWPAYMENTS_PASSWORD`

Notes:

- `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` come from your NOWPayments account.
- `NOWPAYMENTS_EMAIL` and `NOWPAYMENTS_PASSWORD` are required by this repo's payout functions.
- If your NOWPayments account only uses Google sign-in and has no password, payouts will not work until you either set a NOWPayments password for that account or use a separate NOWPayments account with a normal email/password login.

### 3. Deploy the Edge Functions

These four functions must be deployed from the repo code:

- `create-invoice`
- `payment-webhook`
- `create-payout`
- `verify-payout`

Their source files are:

- `supabase/functions/create-invoice/index.ts`
- `supabase/functions/payment-webhook/index.ts`
- `supabase/functions/create-payout/index.ts`
- `supabase/functions/verify-payout/index.ts`

The repo config already expects this JWT behavior:

- `create-invoice`: JWT on
- `payment-webhook`: JWT off
- `create-payout`: JWT on
- `verify-payout`: JWT on

That config is already present in `supabase/config.toml`.

### 4. Set the NOWPayments webhook URL

In NOWPayments, set the IPN callback URL to:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`

Replace `YOUR_PROJECT_REF` with your real Supabase project reference.

### 5. Turn payments on in the frontend deploy env

In the site environment variables, set:

- `NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_SUPABASE_KEY`
- `NEXT_PUBLIC_PAYMENTS_ENABLED=true`

If deployed on GitHub Pages for this repo, also set:

- `NEXT_PUBLIC_BASE_PATH=/BuildEx`

If deployed at a root domain, leave `NEXT_PUBLIC_BASE_PATH` empty.

## What happens after setup

- Buyer places order.
- `create-invoice` creates a NOWPayments checkout.
- NOWPayments calls `payment-webhook`.
- The webhook marks the order paid through the internal RPC.
- When the buyer completes the order, a payout row is queued.
- Admin sends payout batch from the BuildEx admin payouts screen.

## Important limitation

SQL alone is not enough here. Payments and payouts in this repo depend on Supabase Edge Functions, so you need both:

- the three SQL migrations above
- the four Edge Functions above
