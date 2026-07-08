# BuildEx Supabase Edge Functions

| Function | Authentication | Purpose |
|---|---|---|
| `create-invoice` | user JWT | Creates a NOWPayments buyer checkout. |
| `payment-webhook` | NOWPayments HMAC; JWT off | Reconciles finished buyer payments. |
| `create-payout` | admin JWT | Sends approved withdrawal batches through the static-IP relay. |
| `verify-payout` | admin JWT | Submits the NOWPayments 2FA code; does not mark settlement complete. |
| `reconcile-payout` | admin JWT | Reads provider batch status and records terminal sent/failed state. |

Incoming payment provider code is in `_shared/nowpayments.ts`. Outgoing payout
calls use `_shared/payoutRelay.ts`; NOWPayments payout credentials live only on
the fixed-IP relay.

See [`docs/payments-supabase-setup.md`](../../docs/payments-supabase-setup.md) for
the exact production setup, deployment, whitelist, test, and rollback procedure.
