import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { relayRequest } from "../_shared/payoutRelay.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);
  const parsed = await req.json().catch(() => null);
  const batchId = parsed?.batchId != null ? String(parsed.batchId) : "";
  if (!batchId) return json({ error: "batchId is required" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return json({ error: "Invalid session" }, 401);
  const { data: profile } = await asUser
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) return json({ error: "Admin only" }, 403);

  let provider;
  try {
    provider = await relayRequest("GET", `/payouts/${encodeURIComponent(batchId)}`);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }

  const status = String(provider.status || "").toLowerCase();
  const asService = createClient(url, service);
  if (["finished", "sent", "success", "completed"].includes(status)) {
    const { error } = await asService.rpc("mark_payouts_sent", {
      p_batch_id: batchId,
      p_raw: provider,
    });
    if (error) return json({ error: "Could not record settled payout" }, 500);
  } else if (["failed", "rejected", "expired", "cancelled"].includes(status)) {
    const { error } = await asService.rpc("mark_payouts_failed", {
      p_batch_id: batchId,
      p_note: `NOWPayments terminal status: ${status}`,
    });
    if (error) return json({ error: "Could not record failed payout" }, 500);
  }

  return json({ status: status || "processing" });
});
