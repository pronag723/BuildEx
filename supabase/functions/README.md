# BuildEx Supabase Edge Functions

| Function | Authentication | Purpose |
|---|---|---|
| `create-invoice` | user JWT | Creates a NOWPayments buyer checkout. |
| `delete-account` | user JWT | Removes a user's Storage files through the Storage API, then permanently deletes their auth account. |
| `payment-webhook` | NOWPayments HMAC; JWT off | Reconciles finished buyer payments. |

Incoming payment provider code is in `_shared/nowpayments.ts`.

Manual withdrawal settlement is now the primary production flow. The relay-based
`create-payout`, `verify-payout`, and `reconcile-payout` functions remain in the
repo as legacy automation helpers, but BuildEx no longer depends on them for
builder withdrawals.

See [`docs/payments-supabase-setup.md`](../../docs/payments-supabase-setup.md) for
the exact production setup, deployment, manual payout process, and rollback
procedure.

Deploy account deletion after linking the project:

```powershell
npx supabase functions deploy delete-account
```
