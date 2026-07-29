import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getPaymentRailOptions } from "../_shared/paymentRails.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Missing authorization" }, 401);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data } = await client.auth.getUser();
  if (!data.user) return json({ error: "Invalid session" }, 401);

  let amountCents: number;
  try {
    amountCents = Number((await req.json())?.amountCents);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!Number.isSafeInteger(amountCents) || amountCents < 500) {
    return json({ error: "Order total must be at least $5.00" }, 422);
  }

  try {
    const options = await getPaymentRailOptions(amountCents);
    const available = options.filter((option) => option.available);
    return json({
      options: available,
      unavailable: available.length === 0,
      message: available.length
        ? null
        : "Stablecoin checkout is temporarily unavailable for this order total. Please try again later.",
    });
  } catch (error) {
    console.error("Payment options lookup failed:", error);
    return json(
      { error: "Stablecoin checkout is temporarily unavailable. Please try again later." },
      503,
    );
  }
});
