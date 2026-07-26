// BuildEx - temporary test-payment endpoint
//
// This function is used only while NEXT_PUBLIC_PAYMENTS_ENABLED is false. It
// lets a signed-in buyer mark their own pending order paid without contacting
// NOWPayments, so marketplace workflows can be tested end-to-end.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

  let orderId: string | undefined;
  try {
    orderId = (await req.json())?.orderId;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!orderId) return json({ error: "orderId is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

  const { data: order, error: orderErr } = await asUser
    .from("orders")
    .select("id, buyer_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return json({ error: "Could not load the order" }, 500);
  if (!order) return json({ error: "Order not found" }, 404);
  if (order.buyer_id !== userData.user.id) {
    return json({ error: "Only the buyer can complete a test payment" }, 403);
  }
  if (order.status !== "pending_payment") {
    return json({ error: "Order is not awaiting payment" }, 409);
  }

  const asService = createClient(supabaseUrl, serviceKey);
  const { error: paymentErr } = await asService.rpc("mark_order_paid", {
    p_order: orderId,
  });
  if (paymentErr) {
    console.error("test payment failed:", paymentErr);
    return json({ error: "Could not complete test payment" }, 500);
  }
  return json({ ok: true });
});
