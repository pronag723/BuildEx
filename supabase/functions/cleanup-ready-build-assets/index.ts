import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200) {
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

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Server is not configured" }, 500);

  const asUser = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json({ error: "Invalid session" }, 401);

  let jobId = "";
  try {
    jobId = String((await req.json())?.jobId || "");
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!jobId) return json({ error: "Missing cleanup job" }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: job, error: jobError } = await admin
    .from("ready_build_asset_cleanup_jobs")
    .select("id,owner_user_id,image_paths,world_paths,preview_paths,status")
    .eq("id", jobId)
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (jobError) return json({ error: jobError.message }, 500);
  if (!job) return json({ error: "Cleanup job not found" }, 404);
  if (job.status === "complete") return json({ cleaned: true });

  try {
    for (const [bucket, paths] of [
      ["ready_build_images", job.image_paths || []],
      ["ready_build_worlds", job.world_paths || []],
      ["ready_build_previews", job.preview_paths || []],
    ] as const) {
      if (!paths.length) continue;
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) throw error;
    }
    await admin.from("ready_build_asset_cleanup_jobs").update({
      status: "complete",
      error: null,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ cleaned: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Asset cleanup failed";
    await admin.from("ready_build_asset_cleanup_jobs").update({ status: "failed", error: message }).eq("id", job.id);
    return json({ error: message, retryable: true }, 500);
  }
});
