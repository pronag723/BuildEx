# BuildEx payments and builder withdrawals: exact production setup

This guide configures buyer checkout, builder balances, and manual admin-settled
USDT withdrawals. BuildEx no longer requires a relay VM for payouts.

## 1. Apply the Supabase SQL

1. Sign in at `https://supabase.com/dashboard`.
2. Click the BuildEx project.
3. In the left sidebar click **SQL Editor**.
4. Click **New query**.
5. Open each file below locally, copy the complete file, paste it into the query,
   and click **Run**. Run them in this exact order:
   1. `supabase/migrations/0031_payments.sql`
   2. `supabase/migrations/0033_payouts.sql`
   3. `supabase/migrations/0034_payment_reconciliation_and_fiat_payouts.sql`
   4. `supabase/migrations/0035_builder_withdrawals.sql`
   5. `supabase/migrations/0036_manual_payout_settlement.sql`
   6. `supabase/migrations/0037_payment_webhook_fail_closed.sql`
7. If the project already has `0031` to `0036`, run only
   `0037_payment_webhook_fail_closed.sql`.
8. Create a final new query and run:

```sql
select to_regclass('public.payments') as payments,
       to_regclass('public.payouts') as payouts;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_my_payout_summary',
    'request_withdrawal',
    'admin_approve_withdrawal',
    'admin_reject_withdrawal',
    'admin_mark_withdrawal_sent',
    'admin_mark_withdrawal_failed'
  )
order by routine_name;
```

Both tables and all six routines must be returned.

## 2. Configure incoming payments in NOWPayments

Dashboard labels occasionally move. If a named item is absent, use the dashboard
search before continuing.

1. Sign in to NOWPayments with an email/password account.
2. Open **Settings -> API keys** and click **Generate new key**. Copy the API key.
3. Open **Settings -> Payment settings -> IPN settings**.
4. Enable IPN and copy the IPN secret.
5. Set the callback URL to:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`
6. Open **Settings -> Coins settings**.
7. Enable **USDT (TRC-20)**. Its API currency code is `usdttrc20`.
8. Enable **USDT (ERC-20)** only if you intend to support its higher network fees.
   Its API currency code is `usdterc20`.
9. Open **Custody** and complete activation only if you want to send withdrawals
   from the NOWPayments dashboard itself.
10. Keep enough balance on whichever network you will actually use for manual
    withdrawals.

Important:

- BuildEx uses NOWPayments automatically only for buyer checkout.
- Builder payouts are manual now. No payout API, relay IP, or provider 2FA flow
  is required by the app.

## 3. Add Supabase Edge Function secrets

1. In Supabase open **Edge Functions**.
2. Click **Secrets**.
3. Add:

| Name | Value |
|---|---|
| `NOWPAYMENTS_API_KEY` | API key from section 2 |
| `NOWPAYMENTS_IPN_SECRET` | IPN secret from section 2 |

4. Do not add `PAYOUT_RELAY_URL` or `PAYOUT_RELAY_SHARED_SECRET`. Manual payout
   mode does not use them.

Deploy from the repository root:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy create-invoice
npx supabase functions deploy payment-webhook --no-verify-jwt
```

In Supabase **Edge Functions**, verify at least these two exist:

- `create-invoice`
- `payment-webhook`

`payment-webhook` must have JWT verification off.

## 4. Configure GitHub Pages

1. Open the GitHub repository.
2. Click **Settings -> Secrets and variables -> Actions**.
3. Under **Repository secrets**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` =
     `https://YOUR_PROJECT_REF.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the Supabase publishable/anon key from
     **Supabase -> Project Settings -> API**
4. Under **Variables**, add `NEXT_PUBLIC_PAYMENTS_ENABLED` with value `true`.
5. In GitHub click **Actions -> Deploy to GitHub Pages -> Run workflow**.
6. Select branch `main`, click **Run workflow**, and wait for both build and
   deploy jobs to turn green.
7. Only after a successful real checkout test, run migration
   `0032_revoke_mock_payment.sql`.

## 5. How to operate manual withdrawals

### Builder side

1. Sign in as a builder.
2. Open **Account -> Payouts**.
3. In the payout method section click **Edit**.
4. Choose **USDT TRC-20** for the cheapest network in most cases. Choose
   **USDT ERC-20** only if you intend to pay higher Ethereum network fees.
5. Paste the destination address.
6. Click **Save**.
7. In **Withdraw funds**, type the amount in USD.
8. Click **Request withdrawal**.

Rules enforced by BuildEx:

- minimum withdrawal is `$20.00`
- request cannot exceed available balance
- requested funds move from **Available** to **Pending** immediately

### Admin side

1. Sign in as an admin.
2. Open **Admin -> Payouts**.
3. Review the builder wallet and network carefully.
4. If the wallet is acceptable, click **Approve**.
5. In the prompt, enter the fee in USD that you will deduct from the requested
   amount. Example: enter `1.00` for a one-dollar TRC-20 fee.
6. After approval, send the payout manually from your wallet, exchange, or the
   NOWPayments dashboard.
7. Return to **Admin -> Payouts**.
8. Click **Mark sent**.
9. Paste the transaction hash, exchange payout ID, or leave it blank.
10. Add an optional private note.
11. Confirm.

If the payout was not sent successfully:

1. Click **Mark failed**.
2. Enter the reason shown to the builder.
3. Add an optional private note.
4. Confirm.

Effect of failure:

- the withdrawal changes to `failed`
- the builder's balance is released back into **Available**

## 6. Test the complete flow

1. Use a builder account and complete a real paid order.
2. Open **Account -> Payouts**. The builder earnings must appear under
   **Available**.
3. Save a test wallet on the correct network.
4. Request exactly `$20.00`.
5. Confirm **Available** drops by `$20.00` and **Pending** rises by `$20.00`.
6. Sign in as admin and open **Admin -> Payouts**.
7. Click **Approve** and enter the fee in USD.
8. Confirm the row becomes **Approved**.
9. Send the payout manually outside BuildEx.
10. Click **Mark sent** and enter the real payout reference or TXID.
11. Confirm the request becomes **Sent**, **Pending** drops, and **Lifetime paid**
    increases.
12. Test **Reject** and **Mark failed** as well. Both must release funds back to
    **Available**.

## 7. EUR SEPA status

BuildEx still shows EUR SEPA as unavailable.

Do not enable it just because NOWPayments offers merchant off-ramp screens.
BuildEx does not yet support marketplace beneficiary bank payouts through the app.

## Troubleshooting and rollback

- Builder cannot request a withdrawal: check that a valid `USDT TRC-20` or
  `USDT ERC-20` address is saved in **Account -> Payouts**.
- Amount is blocked: confirm it is at least `$20.00` and not above **Available**.
- Admin cannot approve: fee must be a non-negative amount lower than the gross
  withdrawal amount.
- Admin marked the wrong request as sent: correct it directly in Supabase before
  sending another payout for the same balance.
- To pause all withdrawals without losing balances, simply stop approving them.
  Builders can still request and cancel withdrawals safely.
