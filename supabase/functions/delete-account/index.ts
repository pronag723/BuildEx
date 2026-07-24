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

async function deleteAccountWithAdmin(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const operations = [
    admin
      .from("studios")
      .update({ status: "suspended", accepting_orders: false, moderator_id: null })
      .eq("moderator_id", userId),
    admin.from("studio_moderator_invites").delete().eq("created_by", userId),
    admin.from("orders").update({ assigned_builder_id: null }).eq("assigned_builder_id", userId),
    admin.from("studio_order_assignments").delete().eq("builder_id", userId),
    admin.from("studio_employee_earnings").delete().eq("builder_id", userId),
    admin.from("studio_memberships").delete().eq("builder_id", userId),
  ];
  const results = await Promise.all(operations);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(`Could not detach account references: ${failed.error.message}`);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Could not delete auth account: ${error.message}`);
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
    // Storage cleanup above must use the Storage API; Supabase deliberately
    // blocks direct deletes from storage.objects. The RPC only handles the
    // relational transaction: detach retained studio references, then remove
    // the auth user and its cascading profile data.
    const { error: deleteError } = await asUser.rpc("delete_own_account");
    if (deleteError) {
      // Migration 0029 used a direct storage.objects DELETE, which newer
      // Supabase projects reject. Keep production deletion working while 0055
      // rolls out, but do not hide any unrelated database failure.
      if (/direct deletion from storage tables is not allowed/i.test(deleteError.message)) {
        await deleteAccountWithAdmin(admin, userId);
      } else {
        throw new Error(deleteError.message);
      }
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not delete account" }, 500);
  }

  return json({ deleted: true });
});
