// send-message-emails — emails people about chat messages they have not read.
//
// Called every couple of minutes by pg_cron through pg_net (migration 0104),
// and only when a burst is actually due. It never decides on its own who gets
// an email: claim_message_emails() does that in the database, re-checking the
// read cursor, the opt-out, reports, moderation and the caps, and hands back
// only what should go out — with the recipient's address read from auth.users,
// which never reaches a client.
//
// Deployed with --no-verify-jwt (cron has no user JWT). The caller proves
// itself with the x-cron-secret header instead, checked against CRON_SECRET.
//
// Secrets: RESEND_API_KEY, EMAIL_FROM, SITE_URL, CRON_SECRET,
// UNSUBSCRIBE_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
// by the platform.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderMessageEmail } from "./email.ts";
import { safeEqual } from "../_shared/safeEqual.ts";
import { signUnsubscribeToken } from "../_shared/unsubscribeToken.ts";

const RESEND_URL = "https://api.resend.com/emails";
// Per run. At the default cron cadence that is far more than the daily caps
// allow anyway; the rest waits for the next run.
const BATCH_SIZE = 20;
// Resend's default rate limit is 2 requests per second.
const SEND_GAP_MS = 600;

interface ClaimedEmail {
  email_id: string;
  attempt: number;
  recipient_id: string;
  recipient_email: string;
  locale: string | null;
  conversation_id: string;
  sender_name: string | null;
  preview_kind: string | null;
  preview_text: string | null;
  unread_count: number | null;
}

interface Outcome {
  sent: boolean;
  providerId?: string;
  error?: string;
  retryable?: boolean;
}

interface Config {
  supabaseUrl: string;
  serviceKey: string;
  resendKey: string;
  from: string;
  siteUrl: string;
  cronSecret: string;
  unsubscribeSecret: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readConfig(): { config?: Config; missing: string[] } {
  const values = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    resendKey: Deno.env.get("RESEND_API_KEY") ?? "",
    from: Deno.env.get("EMAIL_FROM") ?? "",
    siteUrl: (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, ""),
    cronSecret: Deno.env.get("CRON_SECRET") ?? "",
    unsubscribeSecret: Deno.env.get("UNSUBSCRIBE_SECRET") ?? "",
  };
  const names: Record<keyof Config, string> = {
    supabaseUrl: "SUPABASE_URL",
    serviceKey: "SUPABASE_SERVICE_ROLE_KEY",
    resendKey: "RESEND_API_KEY",
    from: "EMAIL_FROM",
    siteUrl: "SITE_URL",
    cronSecret: "CRON_SECRET",
    unsubscribeSecret: "UNSUBSCRIBE_SECRET",
  };
  const missing = (Object.keys(values) as (keyof Config)[])
    .filter((key) => !values[key])
    .map((key) => names[key]);
  return missing.length ? { missing } : { config: values, missing };
}

async function deliver(row: ClaimedEmail, config: Config): Promise<Outcome> {
  let token: string;
  try {
    token = await signUnsubscribeToken(row.recipient_id, config.unsubscribeSecret);
  } catch (error) {
    return { sent: false, error: `Could not sign unsubscribe token: ${String(error)}`, retryable: false };
  }

  const chatUrl = `${config.siteUrl}/chats/?c=${encodeURIComponent(row.conversation_id)}`;
  const unsubscribeUrl = `${config.siteUrl}/unsubscribe/?token=${encodeURIComponent(token)}`;
  const settingsUrl = `${config.siteUrl}/account/?section=danger`;
  // RFC 8058 one-click target: mail clients POST here directly, so it has to be
  // the function itself, not the static page.
  const oneClickUrl =
    `${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/email-unsubscribe?token=${encodeURIComponent(token)}`;

  const email = renderMessageEmail({
    locale: row.locale,
    senderName: row.sender_name,
    previewKind: row.preview_kind,
    previewText: row.preview_text,
    unreadCount: row.unread_count,
    chatUrl,
    unsubscribeUrl,
    settingsUrl,
  });

  let response: Response;
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendKey}`,
        "Content-Type": "application/json",
        // One key per burst, reused by every retry of it (the claim keeps the
        // payload identical), so a retry after a lost response is a no-op.
        "Idempotency-Key": `message-email/${row.email_id}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [row.recipient_email],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          "List-Unsubscribe": `<${oneClickUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [{ name: "category", value: "message_notification" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { sent: false, error: `Network error calling Resend: ${String(error)}`, retryable: true };
  }

  const body = await response.json().catch(() => ({})) as { id?: string; name?: string; message?: string };
  if (response.ok && body.id) return { sent: true, providerId: body.id };

  const detail = `Resend ${response.status}${body.name ? ` ${body.name}` : ""}: ${body.message ?? response.statusText}`;
  // Worth another go: rate limiting, provider outages, and "the same key is
  // still in flight". Not: validation errors, a bad key, an unverified domain,
  // or a key reused with a different payload — retrying cannot fix those.
  const retryable =
    response.status === 429 ||
    response.status >= 500 ||
    (response.status === 409 && body.name === "concurrent_idempotent_requests");
  return { sent: false, error: detail, retryable };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { config, missing } = readConfig();
  if (!config) {
    console.error("send-message-emails: missing secrets:", missing.join(", "));
    return json({ error: "Server is not configured", missing }, 500);
  }

  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", config.cronSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(config.supabaseUrl, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.rpc("claim_message_emails", { p_limit: BATCH_SIZE });
  if (error) {
    console.error("send-message-emails: claim failed:", error.message);
    return json({ error: `Could not claim emails: ${error.message}` }, 500);
  }

  const rows = (data ?? []) as ClaimedEmail[];
  const summary = { claimed: rows.length, sent: 0, retrying: 0, failed: 0 };

  for (const [index, row] of rows.entries()) {
    if (index > 0) await sleep(SEND_GAP_MS);
    const outcome = await deliver(row, config);
    const { data: status, error: completeError } = await admin.rpc("complete_message_email", {
      p_id: row.email_id,
      p_sent: outcome.sent,
      p_provider_id: outcome.providerId ?? null,
      p_error: outcome.error ?? null,
      p_retryable: outcome.retryable ?? true,
    });
    if (completeError) {
      // The row stays 'sending' and is reclaimed in 15 minutes; the
      // Idempotency-Key stops that from sending twice.
      console.error(`send-message-emails: could not record ${row.email_id}:`, completeError.message);
    }
    if (outcome.sent) summary.sent += 1;
    else if (status === "pending") summary.retrying += 1;
    else summary.failed += 1;
    if (!outcome.sent) console.warn(`send-message-emails: ${row.email_id} attempt ${row.attempt}: ${outcome.error}`);
  }

  return json(summary);
});
