import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function removeUserFiles(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
) {
  const { data, error } = await admin.storage.from(bucket).list(userId, {
    limit: 1000,
    offset: 0,
  });
  if (error) throw new Error(`Could not list ${bucket} files: ${error.message}`);
  const paths = (data || [])
    .filter((item) => item.name)
    .map((item) => `${userId}/${item.name}`);
  if (!paths.length) return;
  const { error: removeError } = await admin.storage.from(bucket).remove(paths);
  if (removeError) throw new Error(`Could not remove ${bucket} files: ${removeError.message}`);
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

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    await Promise.all([
      removeUserFiles(admin, "avatars", userData.user.id),
      removeUserFiles(admin, "banners", userData.user.id),
      removeUserFiles(admin, "portfolios", userData.user.id),
      removeUserFiles(admin, "chat-media", userData.user.id),
    ]);
    const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
    if (deleteError) throw new Error(deleteError.message);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not delete account" }, 500);
  }

  return json({ deleted: true });
});
