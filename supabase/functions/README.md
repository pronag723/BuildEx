# BuildEx — Supabase Edge Functions (payments)

BuildEx ships as a static export with **no server of its own**, so the two
operations that must hold a secret key or verify a gateway signature live here as
Supabase Edge Functions (Deno):

| Function | Auth | Purpose |
|---|---|---|
| `create-invoice` | JWT (buyer) | Creates a NOWPayments hosted checkout for a `pending_payment` order and returns the checkout URL. RLS proves the caller owns the order. |
| `payment-webhook` | **none** (signature) | NOWPayments calls this (IPN) on payment events. Verifies the HMAC-SHA512 signature, then flips the order to `paid` via the service-role RPC `mark_order_paid_internal`. |

`_shared/nowpayments.ts` is the only provider-specific code (create / verify);
swapping providers later means rewriting that one file.

> **Dormant by default.** The web app only calls `create-invoice` when
> `NEXT_PUBLIC_PAYMENTS_ENABLED=true`. Until then the checkout page uses the mock
> `mark_order_paid` path, so nothing here needs to be deployed for the app to work.

---

## 1. Get a NOWPayments account (operator action items)

NOWPayments is globally available (works fine from Russia/CIS), takes individuals
with light KYC, and settles in **USDT**. Here's exactly what to do, then hand the
two values in step 4 to whoever sets the secrets.

1. **Register** at <https://nowpayments.io>, verify your email.
2. **Add a payout wallet** in *Settings → Coins / Payout wallet* — e.g. a USDT
   (TRC-20) address. NOWPayments auto-converts incoming payments to this coin.
   (Some withdrawal/payout features ask for light identity verification — provide
   it if prompted; accepting payments does not require a company.)
3. **Generate an API key** in *Settings → API keys* → copy the **API key**.
4. Set up the **IPN (callback) secret** in *Settings → IPN*:
   - Toggle IPN on and copy the **IPN secret key**.
   - Set the **IPN callback URL** to your deployed `payment-webhook` URL:
     `https://<project-ref>.supabase.co/functions/v1/payment-webhook`
5. *(Optional, for card payments)* enable the fiat/card on-ramp partners in the
   dashboard if you want buyers to be able to pay by card as well as crypto.

**Hand over:** `API key`, `IPN secret key`.

> NOWPayments charges the **merchant** a small (~0.5%) service fee. We pass it to
> the buyer where the gateway allows (`is_fee_paid_by_user: true` on the invoice);
> any residue simply comes out of BuildEx's platform margin. The builder / studio
> commission split is computed off the order price in `place_order` and is **never**
> affected.

---

## 2. Set the secrets

```bash
supabase secrets set \
  NOWPAYMENTS_API_KEY=<api-key> \
  NOWPAYMENTS_IPN_SECRET=<ipn-secret-key>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into Edge Functions automatically — do **not** set them yourself.

## 3. Deploy

```bash
supabase functions deploy create-invoice
supabase functions deploy payment-webhook   # verify_jwt=false comes from config.toml
```

## 4. Switch payments on

Set `NEXT_PUBLIC_PAYMENTS_ENABLED=true` in the GitHub Actions deploy env (the
same place the `NEXT_PUBLIC_SUPABASE_*` build vars live) and redeploy the site.
The checkout button drops "(mock)" and Pay now routes through NOWPayments.

After a live test pass, run a tiny `0032` migration to revoke the client mock:

```sql
revoke execute on function public.mark_order_paid(uuid) from authenticated;
```

## 5. Verify (sandbox / small live test)

- Place an order and pay it on the NOWPayments checkout → the IPN fires → the order
  flips to `paid` only on the **`finished`** status, and a `payments` row records the
  payment. (`waiting` / `confirming` / `partially_paid` must NOT mark it paid.)
- POST a body with a **forged `x-nowpayments-sig`** header to `payment-webhook` → it
  must return `400 invalid signature` and **not** mark anything paid.

> ⚠️ Confirm the exact IPN signing recipe (HMAC-SHA512 over the JSON with keys
> sorted alphabetically, keyed by the IPN secret) against the current NOWPayments
> docs when you activate — `verifyWebhook` implements that recipe, but the live
> format is the source of truth.
