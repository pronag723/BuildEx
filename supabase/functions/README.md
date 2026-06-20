# BuildEx — Supabase Edge Functions (payments)

BuildEx ships as a static export with **no server of its own**, so the two
operations that must hold a secret key or verify a gateway signature live here as
Supabase Edge Functions (Deno):

| Function | Auth | Purpose |
|---|---|---|
| `create-invoice` | JWT (buyer) | Creates a Cryptomus hosted checkout for a `pending_payment` order and returns the checkout URL. RLS proves the caller owns the order. |
| `payment-webhook` | **none** (signature) | Cryptomus calls this on payment events. Verifies the request signature, then flips the order to `paid` via the service-role RPC `mark_order_paid_internal`. |

`_shared/cryptomus.ts` is the only Cryptomus-specific code (sign / create / verify);
swapping providers later means rewriting that one file.

> **Dormant by default.** The web app only calls `create-invoice` when
> `NEXT_PUBLIC_PAYMENTS_ENABLED=true`. Until then the checkout page uses the mock
> `mark_order_paid` path, so nothing here needs to be deployed for the app to work.

---

## 1. Get a Cryptomus account (operator action items)

You don't have an account yet — here's exactly what to do, then hand the three
values in step 4 to whoever sets the secrets.

1. **Register** at <https://cryptomus.com>, verify your email, and complete
   **identity KYC** (passport-level — this is *identity* verification, **not**
   company registration, so it's fine that there's no company).
2. **Create a Merchant** in the dashboard → copy the **Merchant UUID**.
3. Under API settings, generate a **Payment API key** and a **Payout API key**
   (payout is for the later automated-payout phase; grab it now).
4. In the merchant payment settings:
   - Enable **"client pays the commission"** so the processing fee is added on
     top of the order for the buyer (this keeps the builder / studio / BuildEx
     split exact — the app relies on it).
   - Set the **callback / webhook URL** to your deployed `payment-webhook` URL:
     `https://<project-ref>.supabase.co/functions/v1/payment-webhook`
5. Add a **USDT wallet** for settlement.

**Hand over:** `Merchant UUID`, `Payment API key`, `Payout API key`.

---

## 2. Set the secrets

```bash
supabase secrets set \
  CRYPTOMUS_MERCHANT_ID=<merchant-uuid> \
  CRYPTOMUS_PAYMENT_KEY=<payment-api-key> \
  CRYPTOMUS_PAYOUT_KEY=<payout-api-key>
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
The checkout button drops "(mock)" and Pay now routes through Cryptomus.

After a live card + crypto test pass, run a tiny `0032` migration to revoke the
client mock:

```sql
revoke execute on function public.mark_order_paid(uuid) from authenticated;
```

## 5. Verify (sandbox)

- Place an order, pay once **by card** and once **in crypto** → each fires the
  webhook → the order flips to `paid`, and a `payments` row records the invoice.
- POST a body with a **forged `sign`** to `payment-webhook` → it must return
  `400 invalid signature` and **not** mark anything paid.

> ⚠️ Confirm the exact callback signature algorithm (base64 + slash-escaping
> quirk) against the current Cryptomus docs when you activate — `verifyWebhook`
> accepts both the plain and slash-escaped encodings, but the live format is the
> source of truth.
