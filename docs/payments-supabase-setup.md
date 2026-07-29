# BuildEx crypto payments and custody payouts

BuildEx accepts crypto only. Prices, commissions, escrow, and provider balances
remain denominated in integer USD cents.

## Production policy

- Marketplace minimum: **$5.00** for independent builders and studios.
- Checkout: `usdtbsc`, `usdtmatic`, and `usdtsol`.
- A network is shown only when NOWPayments reports the service healthy, the
  currency enabled, and its live USD minimum no greater than the order total.
- BSC is recommended by default. A forged or stale client selection is checked
  again by `create-invoice`.
- Buyer-paid fees and fixed-rate invoices are disabled. BuildEx absorbs provider
  processing costs inside its 9–18% commission.
- Withdrawals: **USDT-BSC only**, minimum **$20.00**, sent in weekly custody mass
  payout batches. The displayed withdrawal amount is the amount sent; BuildEx
  absorbs the batch network cost.

Provider minimums are always authoritative. The $5 marketplace floor does not
promise that a $5 rail will be available at every moment.

## Database

Apply every migration in `supabase/migrations` in numeric order, including:

```text
0072_low_fee_stablecoin_payments.sql
```

Migration 0072:

- lowers both placement-function floors to $5;
- adds requested/received currency, crypto amount, provider fee, payment ID, and
  provider status fields to `payments`;
- restricts saved payout destinations to `usdt_bsc` and validates
  `^0x[0-9a-fA-F]{40}$`;
- keeps the $20 withdrawal minimum and atomic balance reservation;
- forces approved withdrawals to have zero builder fee deduction.

Legacy TRC20/ERC20 payout preferences are cleared so users must explicitly save
a BSC address. Unsent legacy requests are failed and released back to available
balance; historical and already-processing payout rows are retained.

## NOWPayments account

1. Keep the merchant account and API key active.
2. Enable Custody and Mass Payouts.
3. Enable `USDTBSC`, `USDTMATIC`, and `USDTSOL` for deposits.
4. Configure the primary custody/payout balance as USDT-BSC.
5. Enable account 2FA and allowlist the fixed public IP of the payout relay.
6. Configure the IPN callback:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`
7. Store the IPN secret separately from the API key.

Other accepted USDT rails may require provider-side conversion into the
USDT-BSC custody balance. Confirm that account feature and conversion pricing
with NOWPayments before enabling Polygon or Solana in production.

## Secrets

Set incoming payment secrets in Supabase:

```powershell
npx supabase secrets set NOWPAYMENTS_API_KEY=...
npx supabase secrets set NOWPAYMENTS_IPN_SECRET=...
```

Set relay connection secrets in Supabase:

```powershell
npx supabase secrets set PAYOUT_RELAY_URL=https://YOUR_FIXED_IP_RELAY
npx supabase secrets set PAYOUT_RELAY_SHARED_SECRET=...
```

The relay alone holds `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_EMAIL`, and
`NOWPAYMENTS_PASSWORD`. Use `services/payout-relay/.env.example` and the bundled
service definition when installing it.

## Deploy Edge Functions

```powershell
npx supabase functions deploy payment-options
npx supabase functions deploy create-invoice
npx supabase functions deploy payment-webhook --no-verify-jwt
npx supabase functions deploy create-payout
npx supabase functions deploy verify-payout
npx supabase functions deploy reconcile-payout
```

`payment-webhook` is the only payment function with gateway JWT verification
disabled. It authenticates NOWPayments with the IPN HMAC signature.

After deployment, build with:

```text
NEXT_PUBLIC_PAYMENTS_ENABLED=true
```

Do not revoke the mock payment RPC until the real checkout acceptance test has
passed. Production builds must not expose a service-role key or provider secret.

## Weekly payout operation

1. Builders and studios accumulate completed-order earnings in the USD-cent
   ledger.
2. A withdrawal request immediately reserves the requested balance.
3. Admin approves valid BSC requests. The fee deduction is always zero.
4. Once per week, click **Send approved weekly batch** in the admin payout
   console.
5. Enter the NOWPayments 2FA code to authorize the custody mass payout.
6. Use **Reconcile processing batches** until the provider reports a terminal
   status.
7. Successful rows become `sent`. Failed/rejected/expired/cancelled batches
   become `failed`; those amounts are excluded from reservations and therefore
   return to the available balance.

The relay derives an idempotency key from the sorted payout IDs. Database state
transitions only approved rows to processing, preventing the same withdrawal
from entering a second batch.

## Required pre-production tests

- Create one $5 independent-builder order and one $5 studio order.
- Confirm every offered rail has a live minimum no greater than the order.
- Verify forged currency codes are rejected.
- Exercise BSC, Polygon, and Solana signed webhook events: replay, invalid
  signature, wrong USD amount, partial payment, expiry, finished, and
  overpayment.
- Confirm rank/studio commission snapshots and builder earnings do not change
  when provider fees are absorbed.
- Test BSC address validation, $20 aggregation, duplicate batch attempts, 2FA,
  failure restoration, and reconciliation.
- Finally run one real $5 USDT-BSC checkout and one real $20 USDT-BSC payout.

Do not enable production payments until Custody/Mass Payouts are active and the
two real transactions succeed. Provider/service costs must remain below the 9%
Master commission for ordinary successful orders; pause affected rails during
abnormal network-fee spikes.
