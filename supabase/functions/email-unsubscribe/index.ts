// email-unsubscribe — turns message-notification emails off (or back on)
// without signing in. The signed token in every email is the only credential.
//
// Three ways in:
//   • POST, JSON { token, action? } — the static /unsubscribe/ page. action
//     "resubscribe" turns emails back on (the page's undo button); anything
//     else turns them off.
//   • POST ?token=… with the form body "List-Unsubscribe=One-Click" — RFC 8058
//     one-click, sent by Gmail/Yahoo/Apple Mail from their own Unsubscribe
//     button. Always an unsubscribe.
//   • GET ?token=… — a mail client that opens the List-Unsubscribe URL in a
//     browser. Changes nothing (link scanners prefetch GETs; RFC 8058 forbids
//     acting on them) and redirects to the /unsubscribe/ page, which does the
//     POST. (Supabase serves function HTML as plain text, so a page here is
//     not an option anyway.)
//
// Deployed with --no-verify-jwt: a mail client's one-click POST carries no
// Supabase key.
//
// Secrets: UNSUBSCRIBE_SECRET, SITE_URL. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyUnsubscribeToken } from "../_shared/unsubscribeToken.ts";

const DEFAULT_SITE_URL = "https://buildex.builders";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const siteUrl = (Deno.env.get("SITE_URL") || DEFAULT_SITE_URL).replace(/\/+$/, "");

  if (req.method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    return Response.redirect(`${siteUrl}/unsubscribe/?token=${encodeURIComponent(token)}`, 302);
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("UNSUBSCRIBE_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!secret || !supabaseUrl || !serviceKey) {
    console.error("email-unsubscribe: UNSUBSCRIBE_SECRET or platform secrets are missing");
    return json({ error: "Server is not configured" }, 500);
  }

  let token: unknown = url.searchParams.get("token");
  let enable = false;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await req.json().catch(() => null) as { token?: unknown; action?: unknown } | null;
    if (body && typeof body.token === "string") token = body.token;
    enable = body?.action === "resubscribe";
  }

  const userId = await verifyUnsubscribeToken(token, secret);
  if (!userId) return json({ error: "invalid_token" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin
    .from("profiles")
    .update({ email_on_message: enable })
    .eq("id", userId);
  if (error) {
    console.error("email-unsubscribe: update failed:", error.message);
    return json({ error: "update_failed" }, 500);
  }

  // A deleted account matches no row; there is nothing left to email, so that
  // is a success too.
  return json({ ok: true, email_on_message: enable });
});
