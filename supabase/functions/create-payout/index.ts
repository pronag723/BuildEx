// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — create-payout Edge Function (JWT-verified, admin-only)
//
// Called by an admin from the Payouts console to send a batch of queued builder
// payouts. Flow:
//   1. Verify the caller is a signed-in admin (profiles.is_admin) — RLS on the
//      caller-scoped client + an explicit is_admin check.
//   2. Load selected admin-approved payout rows (service role) and build a
//      NOWPayments Mass Payout batch (USDT to each builder's wallet).
//   3. Create the batch (status WAITING) and flip the rows to 'processing' with
//      the batch id. The batch is NOT sent until verify-payout confirms the 2FA
//      code (NOWPayments emails it after this call).
//
// Provider credentials live on the fixed-IP relay. This function holds only
// PAYOUT_RELAY_URL / PAYOUT_RELAY_SHARED_SECRET; Supabase keys are injected.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { payoutIdempotencyKey, relayRequest } from "../_shared/payoutRelay.ts";

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

  let payoutIds: string[] = [];
  try {
    const parsed = await req.json();
    payoutIds = Array.isArray(parsed?.payoutIds) ? parsed.payoutIds : [];
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!payoutIds.length) {
    return json({ error: "payoutIds is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Caller-scoped client → identify the caller and confirm they're an admin.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Invalid session" }, 401);
  }
  const { data: prof } = await asUser
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (prof?.is_admin !== true) {
    return json({ error: "Admin only" }, 403);
  }

  // Service-role client: read the queued payouts and write status back.
  const asService = createClient(supabaseUrl, serviceKey);
  const { data: rows, error: rowsErr } = await asService
    .from("payouts")
    .select("id, amount_cents, net_amount_cents, destination, status, currency")
    .in("id", payoutIds)
    .eq("status", "approved");

  if (rowsErr) {
    return json({ error: "Could not load payouts" }, 500);
  }
  if (!rows || rows.length === 0) {
    return json({ error: "No approved withdrawals to send" }, 409);
  }

  // Every selected row must have a destination wallet (enqueue parks wallet-less
  // payouts as 'blocked', so a 'pending' row should always have one — guard anyway).
  const withoutWallet = rows.filter((r) => !r.destination);
  if (withoutWallet.length) {
    return json(
      { error: "Some payouts have no wallet on file; re-queue them after the builder sets one." },
      422,
    );
  }

  const withdrawals = rows.map((r) => ({
    address: String(r.destination),
    amount: Number((Number(r.net_amount_cents ?? r.amount_cents) / 100).toFixed(2)),
    currency: r.currency || "usdttrc20",
  }));

  let batch;
  try {
    batch = await relayRequest("POST", "/payouts", {
      idempotencyKey: await payoutIdempotencyKey(rows.map((r) => r.id)),
      withdrawals,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("createPayout failed:", msg);
    return json({ error: `Payout provider error: ${msg}` }, 502);
  }

  const batchId = batch.id != null ? String(batch.id) : null;
  if (!batchId) {
    return json({ error: "Provider did not return a batch id" }, 502);
  }

  const sentIds = rows.map((r) => r.id);
  const { error: markErr } = await asService.rpc("mark_payouts_processing", {
    p_payouts: sentIds,
    p_batch_id: batchId,
  });
  if (markErr) {
    // The batch exists at the gateway but we couldn't record it — surface loudly
    // so the operator reconciles (the batch id is returned regardless).
    console.error("mark_payouts_processing failed:", markErr);
  }

  return json({ batchId, status: batch.status, count: sentIds.length });
});
