// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — verify-payout Edge Function (JWT-verified, admin-only)
//
// Second half of the payout flow: after create-payout makes a batch, NOWPayments
// emails a 2FA code. The admin enters it in the Payouts console and this function
// confirms the batch — only then do the withdrawals actually send. On success it
// flips the batch's payout rows to 'sent'.
//
// Secrets: NOWPAYMENTS_API_KEY / NOWPAYMENTS_EMAIL / NOWPAYMENTS_PASSWORD.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyPayout } from "../_shared/nowpayments.ts";

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

  let batchId: string | undefined;
  let code: string | undefined;
  try {
    const parsed = await req.json();
    batchId = parsed?.batchId != null ? String(parsed.batchId) : undefined;
    code = parsed?.code != null ? String(parsed.code) : undefined;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!batchId || !code) {
    return json({ error: "batchId and code are required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify caller + confirm admin.
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

  const asService = createClient(supabaseUrl, serviceKey);

  let result;
  try {
    result = await verifyPayout(batchId, code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("verifyPayout failed:", msg);
    // Leave the rows 'processing' so the operator can retry the code; don't fail
    // them on a wrong-code attempt.
    return json({ error: `Payout verification failed: ${msg}` }, 502);
  }

  const { error: markErr } = await asService.rpc("mark_payouts_sent", {
    p_batch_id: batchId,
    p_raw: result.raw ?? null,
  });
  if (markErr) {
    console.error("mark_payouts_sent failed:", markErr);
    return json({ error: "Verified, but failed to record status" }, 500);
  }

  return json({ ok: true });
});
