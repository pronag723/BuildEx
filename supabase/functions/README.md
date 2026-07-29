# BuildEx Supabase Edge Functions

| Function | Authentication | Purpose |
|---|---|---|
| `create-invoice` | user JWT | Creates a NOWPayments buyer checkout. |
| `payment-options` | user JWT | Returns live eligible USDT networks and minimums. |
| `delete-account` | user JWT | Removes a user's Storage files through the Storage API, then permanently deletes their auth account. |
| `payment-webhook` | NOWPayments HMAC; JWT off | Reconciles finished buyer payments. |

Incoming payment provider code is in `_shared/nowpayments.ts`.

Approved withdrawals are sent in a weekly USDT-BSC custody batch through the
fixed-IP relay. `create-payout` creates an idempotent batch, `verify-payout`
confirms it with provider 2FA, and `reconcile-payout` records settlement or
failure.

See [`docs/payments-supabase-setup.md`](../../docs/payments-supabase-setup.md) for
the exact production setup, deployment, custody payout process, and rollback
procedure.

Deploy account deletion after linking the project:

```powershell
npx supabase functions deploy delete-account
```
