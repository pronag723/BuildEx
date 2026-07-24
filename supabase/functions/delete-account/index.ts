import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function removeFilesAtPrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
) {
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset: 0,
    });
    if (error) throw new Error(`Could not list ${bucket} files: ${error.message}`);
    const paths = (data || [])
      .filter((item) => item.name)
      .map((item) => `${prefix}/${item.name}`);
    if (!paths.length) return;
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw new Error(`Could not remove ${bucket} files: ${removeError.message}`);
    if (paths.length < 1000) return;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server is not configured" }, 500);

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const userId = userData.user.id;
    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id")
      .or(`buyer_id.eq.${userId},builder_id.eq.${userId}`);
    if (ordersError) throw new Error(`Could not list account orders: ${ordersError.message}`);

    await Promise.all([
      removeFilesAtPrefix(admin, "avatars", userId),
      removeFilesAtPrefix(admin, "banners", userId),
      removeFilesAtPrefix(admin, "portfolios", userId),
      removeFilesAtPrefix(admin, "chat-media", userId),
      ...(orders || []).flatMap((order) => [
        removeFilesAtPrefix(admin, "deliverables", order.id),
        removeFilesAtPrefix(admin, "order_previews", order.id),
      ]),
    ]);
    // Keep deletion inside the database transaction. In particular,
    // delete_own_account suspends and releases a managed studio before removing
    // its moderator profile, avoiding the studios.moderator_id RESTRICT FK.
    const { error: deleteError } = await asUser.rpc("delete_own_account");
    if (deleteError) throw new Error(deleteError.message);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not delete account" }, 500);
  }

  return json({ deleted: true });
});
