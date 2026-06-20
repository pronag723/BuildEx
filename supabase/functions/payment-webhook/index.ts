// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — payment-webhook Edge Function (signature-verified, no JWT)
//
// NOWPayments POSTs here (IPN) when a payment changes state. This is the security
// boundary: we recompute the request signature from the body + our IPN secret and
// reject anything that doesn't match before touching the order. On a verified
// "finished" callback we call the service-role RPC mark_order_paid_internal(),
// which flips the order to 'paid' (idempotently — the gateway may retry).
//
// verify_jwt is OFF for this function (see supabase/config.toml) because the
// caller is the gateway, not a logged-in user; the signature IS the auth.
//
// Secrets: NOWPAYMENTS_IPN_SECRET (signature). SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyWebhook } from "../_shared/nowpayments.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  // NOWPayments delivers the HMAC-SHA512 signature in this header.
  const signature = req.headers.get("x-nowpayments-sig");

  let verdict;
  try {
    verdict = await verifyWebhook(rawBody, signature);
  } catch (e) {
    // A missing secret / config error — fail closed, don't ack.
    console.error("verifyWebhook threw:", e);
    return new Response("error", { status: 500 });
  }

  if (!verdict.valid) {
    // Bad/forged signature → 400 so it's visibly rejected (and not retried as a
    // transient failure). NEVER mark anything paid on this path.
    return new Response("invalid signature", { status: 400 });
  }

  // Verified but not the terminal paid state (e.g. 'waiting', 'confirming',
  // 'partially_paid', 'expired') — acknowledge so the gateway stops retrying;
  // nothing to do yet.
  if (!verdict.isPaid || !verdict.orderId) {
    return new Response("ok", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asService = createClient(supabaseUrl, serviceKey);

  const { error } = await asService.rpc("mark_order_paid_internal", {
    p_order: verdict.orderId,
    p_invoice: verdict.invoiceId,
    p_amount_cents: verdict.amountCents,
    p_method: verdict.method,
    p_raw: JSON.parse(rawBody),
  });

  if (error) {
    // Let the gateway retry on a transient DB error.
    console.error("mark_order_paid_internal failed:", error);
    return new Response("retry", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
