"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator data layer
// Thin wrappers over the admin-only RPCs added in migration
// 0101_moderation_tools.sql, plus the two reads that need no RPC at all
// (profiles and portfolio_images are already readable under RLS, and the
// 0101 policies let an admin through to hidden rows).
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

// ─── Users ──────────────────────────────────────────────────────────────────

// A flat account list, newest first, for looking someone up by @handle. No RPC:
// profiles has always been publicly readable under RLS and 0028 already limits
// which columns any client may select, so an admin-only wrapper would add a
// gate without adding a guarantee. The embedded builder_profiles row is what
// answers "do they have a builder profile?" — and the 0101 policy means an
// admin sees it even when it is hidden.
const USERS_PAGE_SIZE = 200;

export async function listAdminUsers(search = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { users: [], error: null };

  let query = supabase
    .from("profiles")
    // The FK is named for the same reason as in fetchBuilders.js: 0101's
    // `hidden_by` column gave profiles and builder_profiles a second
    // relationship, and an unqualified embed is ambiguous (300 / PGRST201).
    .select("id, username, display_name, avatar_url, created_at, is_admin, builder:builder_profiles!builder_profiles_id_fkey(id, is_hidden)")
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

  const { data, error } = await query;
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
  }));

  return { users: rewriteUrlsDeep(users), error: null };
}
