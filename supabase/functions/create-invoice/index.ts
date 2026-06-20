// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — create-invoice Edge Function (JWT-verified)
//
// Called by the signed-in buyer's browser (supabase.functions.invoke) when they
// press Pay and real payments are enabled. Flow:
//   1. Verify the order belongs to the caller and is still pending_payment.
//      We use a Supabase client carrying the caller's JWT so ROW-LEVEL SECURITY
//      does the ownership check for us — the function never trusts a client id.
//   2. Ask NOWPayments for a hosted checkout for the EXACT order price.
//   3. Record a 'pending' payments row (service role) and return the checkout URL.
//
// Secrets (set via `supabase secrets set`): NOWPAYMENTS_API_KEY. SUPABASE_URL /
// SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createInvoice } from "../_shared/nowpayments.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing authorization" }, 401);
  }

  let orderId: string | undefined;
  let returnUrl: string | undefined;
  try {
    const parsed = await req.json();
    orderId = parsed?.orderId;
    returnUrl = parsed?.returnUrl;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!orderId) {
    return json({ error: "orderId is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Caller-scoped client: RLS only returns the order to a party of it (buyer or
  // builder). We additionally require the caller to be the BUYER — only the buyer
  // pays — mirroring the mock mark_order_paid's `v_buyer = me` check.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Invalid session" }, 401);
  }

  const { data: order, error: orderErr } = await asUser
    .from("orders")
    .select("id, buyer_id, status, price_kopecks")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    return json({ error: "Could not load the order" }, 500);
  }
  if (!order) {
    // Either it doesn't exist or the caller isn't a party — same answer.
    return json({ error: "Order not found" }, 404);
  }
  if (order.buyer_id !== userData.user.id) {
    return json({ error: "Only the buyer can pay for this order" }, 403);
  }
  if (order.status !== "pending_payment") {
    return json({ error: "Order is not awaiting payment" }, 409);
  }

  const amount = (Number(order.price_kopecks) / 100).toFixed(2);
  const callbackUrl = `${supabaseUrl}/functions/v1/payment-webhook`;
  // Fall back to the Supabase URL origin only as a last resort; the client
  // normally passes its own origin so the buyer returns to the right place.
  const safeReturn = returnUrl && /^https?:\/\//.test(returnUrl)
    ? returnUrl
    : `${supabaseUrl}`;

  let invoice;
  try {
    invoice = await createInvoice({
      amount,
      currency: "USD",
      orderId: order.id,
      callbackUrl,
      returnUrl: safeReturn,
    });
  } catch (e) {
    console.error("createInvoice failed:", e);
    return json({ error: "Payment provider error" }, 502);
  }

  if (!invoice.checkoutUrl) {
    return json({ error: "Provider did not return a checkout URL" }, 502);
  }

  // Record the pending payment with the service role (bypasses RLS; only this
  // trusted function can write to payments).
  const asService = createClient(supabaseUrl, serviceKey);
  const { error: recErr } = await asService.rpc("record_pending_payment", {
    p_order: order.id,
    p_invoice: invoice.invoiceId,
    p_amount_cents: Number(order.price_kopecks),
  });
  if (recErr) {
    // Non-fatal: the webhook can still reconcile by order_id. Log and proceed.
    console.error("record_pending_payment failed:", recErr);
  }

  return json({ checkoutUrl: invoice.checkoutUrl, invoiceId: invoice.invoiceId });
});
