"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator data layer
// Thin wrappers over the admin-only RPCs added in migrations
// 0101_moderation_tools.sql, 0108_reviews_and_moderation.sql and
// 0111_traffic_sources_and_chat_oversight.sql, plus the
// reads that need no RPC at all (profiles, portfolio_images and works are
// already readable under RLS, and the 0101/0106 policies let an admin through
// to hidden and removed rows).
//
// Every function tolerates a missing/offline Supabase by resolving to an empty
// result instead of throwing. The RPCs call _require_admin() server-side and
// raise "Admin only" for everyone else, so the /admin gate in the UI is
// convenience, not security.
//
// The order, delivery, payout and dispute readers were removed with the
// payment layer. admin_get_messages (0023) went with them in spirit — it is
// keyed on an order id, and a reported chat thread never had one — so the
// report queue reads through admin_get_conversation_messages instead.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteUrlsDeep } from "../supabase/storageUrl";

// ─── Builders ───────────────────────────────────────────────────────────────

// Every builder profile, hidden ones first. Returns { builders, error }.
export async function listAdminBuilders(search = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { builders: [], error: null };

  const { data, error } = await supabase.rpc("admin_list_builders", {
    p_search: search || null,
  });
  if (error) return { builders: [], error };
  return { builders: rewriteUrlsDeep(data || []), error: null };
}

// Hide or unhide a builder. Returns { hidden, error } — `hidden` is the state
// the row ended up in, straight from the RPC.
export async function setBuilderHidden(builderId, hidden, reason = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { hidden: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("admin_set_builder_hidden", {
    p_builder: builderId,
    p_hidden: hidden,
    p_reason: reason || null,
  });
  if (error) return { hidden: null, error };
  return { hidden: data === true, error: null };
}

// A builder's portfolio, in display order. Read straight from the table: the
// 0101 SELECT policy lets an admin see images belonging to hidden builders,
// which is exactly the case this list exists for.
export async function listBuilderPortfolio(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { images: [], error: null };

  const { data, error } = await supabase
    .from("portfolio_images")
    .select("id, url, position, alt")
    .eq("builder_id", builderId)
    .order("position", { ascending: true });

  if (error) return { images: [], error };
  return { images: rewriteUrlsDeep(data || []), error: null };
}

// Delete one portfolio image (row + storage object). Irreversible.
export async function removePortfolioImage(imageId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { removed: false, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("admin_remove_portfolio_image", {
    p_image: imageId,
  });
  if (error) return { removed: false, error };
  return { removed: data === true, error: null };
}

// A builder's works, taken-down ones included, each with its photos. Read
// straight from the tables: the 0106 policies let an admin see removed works
// and hidden builders' works and photos. The photos embed names its FK —
// portfolio_images references both works and profiles.
export async function listBuilderWorks(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { works: [], error: null };

  const { data, error } = await supabase
    .from("works")
    .select(
      "id, title, position, likes_count, views_count, created_at, removed_at, removed_reason, " +
        "photos:portfolio_images!portfolio_images_work_id_fkey(id, url, position, alt)"
    )
    .eq("builder_id", builderId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return { works: [], error };
  const works = (data || []).map((w) => ({
    ...w,
    photos: (w.photos || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }));
  return { works: rewriteUrlsDeep(works), error: null };
}

// Take one work down, or put it back (migration 0108). Reversible: nothing is
// deleted, RLS just hides the work and its photos from visitors. Returns
// { removed, error } — the state the work ended up in.
export async function setWorkRemoved(workId, removed, reason = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { removed: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("admin_set_work_removed", {
    p_work: workId,
    p_removed: removed,
    p_reason: reason || null,
  });
  if (error) return { removed: null, error };
  return { removed: data === true, error: null };
}

// ─── Reviews ────────────────────────────────────────────────────────────────

// The review_reports queue (migration 0108).
// status: "open" | "reviewed" | "dismissed" | "all".
export async function listReviewReports(status = "open") {
  const supabase = getSupabaseClient();
  if (!supabase) return { reports: [], error: null };

  const { data, error } = await supabase.rpc("admin_list_review_reports", {
    p_status: status || "open",
  });
  if (error) return { reports: [], error };
  return { reports: rewriteUrlsDeep(data || []), error: null };
}

// The newest reviews, hidden ones included, optionally filtered by the
// author's or the builder's @handle / display name.
export async function listAdminReviews(search = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { reviews: [], error: null };

  const { data, error } = await supabase.rpc("admin_list_reviews", {
    p_search: search || null,
  });
  if (error) return { reviews: [], error };
  return { reviews: rewriteUrlsDeep(data || []), error: null };
}

// Hide or unhide one review. Returns { hidden, error }.
export async function setReviewHidden(reviewId, hidden, reason = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { hidden: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("admin_set_review_hidden", {
    p_review: reviewId,
    p_hidden: hidden,
    p_reason: reason || null,
  });
  if (error) return { hidden: null, error };
  return { hidden: data === true, error: null };
}

// Close a review report. status must be "reviewed" or "dismissed".
export async function resolveReviewReport(reportId, status, note = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_resolve_review_report", {
    p_report: reportId,
    p_status: status,
    p_note: note || null,
  });
  return { error: error || null };
}

// ─── Reports ────────────────────────────────────────────────────────────────

// The conversation_reports queue. status: "open" | "reviewed" | "dismissed" | "all".
export async function listConversationReports(status = "open") {
  const supabase = getSupabaseClient();
  if (!supabase) return { reports: [], error: null };

  const { data, error } = await supabase.rpc("admin_list_conversation_reports", {
    p_status: status || "open",
  });
  if (error) return { reports: [], error };
  return { reports: rewriteUrlsDeep(data || []), error: null };
}

// Close a report. status must be "reviewed" or "dismissed".
export async function resolveConversationReport(reportId, status, note = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_resolve_conversation_report", {
    p_report: reportId,
    p_status: status,
    p_note: note || null,
  });
  return { error: error || null };
}

// A reported thread, read-only, oldest first. Returns { messages, error }.
export async function getAdminConversationMessages(conversationId) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId) return { messages: [], error: null };

  const { data, error } = await supabase.rpc("admin_get_conversation_messages", {
    p_conversation: conversationId,
  });
  if (error) return { messages: [], error };
  return { messages: rewriteUrlsDeep(data || []), error: null };
}

// ─── Conversations ──────────────────────────────────────────────────────────

// Every conversation with at least one message, newest activity first
// (migration 0111). `search`: "@handle" matches a participant's handle only;
// anything else also matches display names and message text. `before` is the
// previous page's last `last_message_at`. Returns { conversations, error }.
export const CONVERSATIONS_PAGE_SIZE = 40;

export async function listAdminConversations({ search = "", before = null } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversations: [], error: null };

  const { data, error } = await supabase.rpc("admin_list_conversations", {
    p_search: search || null,
    p_before: before || null,
    p_limit: CONVERSATIONS_PAGE_SIZE,
  });
  if (error) return { conversations: [], error };
  return { conversations: rewriteUrlsDeep(data || []), error: null };
}

// ─── Traffic ────────────────────────────────────────────────────────────────

// The Traffic tab's numbers in one call (migration 0111). `days` is the window
// ending today; 0 means all time. Buckets follow the moderator's time zone.
export async function getTrafficSummary(days = 30) {
  const supabase = getSupabaseClient();
  if (!supabase) return { summary: null, error: null };

  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // keep UTC
  }

  const { data, error } = await supabase.rpc("admin_traffic_summary", {
    p_days: days,
    p_tz: tz,
  });
  if (error) return { summary: null, error };
  return { summary: rewriteUrlsDeep(data || null), error: null };
}

// ─── Users ──────────────────────────────────────────────────────────────────

// A flat account list, newest first, for looking someone up by @handle. No RPC:
// profiles has always been publicly readable under RLS and 0028 already limits
// which columns any client may select, so an admin-only wrapper would add a
// gate without adding a guarantee. The embedded builder_profiles row is what
// answers "do they have a builder profile?" — and the 0101 policy means an
// admin sees it even when it is hidden.
const USERS_PAGE_SIZE = 200;

// The FK is named for the same reason as in fetchBuilders.js: 0101's
// `hidden_by` column gave profiles and builder_profiles a second relationship,
// and an unqualified embed is ambiguous (300 / PGRST201). signup_sources
// (0111) is readable by admins only; before 0111 is applied the embed fails,
// and the list is fetched again without it.
const USER_COLUMNS =
  "id, username, display_name, avatar_url, created_at, is_admin, builder:builder_profiles!builder_profiles_id_fkey(id, is_hidden)";
const USER_SOURCE_EMBED =
  ", signup:signup_sources!signup_sources_user_id_fkey(channel, source, referrer_host, campaign)";

export async function listAdminUsers(search = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { users: [], error: null };

  const run = (columns) => {
    let query = supabase
      .from("profiles")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(USERS_PAGE_SIZE);

    const term = (search || "").trim();
    if (term) {
      // PostgREST `or` takes a comma-separated filter list; commas inside the
      // pattern would split it, so they are dropped rather than escaped.
      const safe = term.replace(/[,()]/g, "");
      if (safe) {
        query = query.or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`);
      }
    }
    return query;
  };

  let { data, error } = await run(USER_COLUMNS + USER_SOURCE_EMBED);
  if (error) ({ data, error } = await run(USER_COLUMNS));
  if (error) return { users: [], error };

  const users = (data || []).map((row) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    created_at: row.created_at,
    is_admin: row.is_admin === true,
    is_builder: Boolean(row.builder),
    is_hidden: row.builder?.is_hidden === true,
    // One-to-one embeds come back as an object on current PostgREST and as a
    // one-element array on older ones.
    signup: (Array.isArray(row.signup) ? row.signup[0] : row.signup) || null,
  }));

  return { users: rewriteUrlsDeep(users), error: null };
}
