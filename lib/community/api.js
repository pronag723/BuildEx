"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Community data layer (migration 0116)
// Showcase (every public work), saved works, the "Looking for a builder"
// board of public briefs, responses, and reports on public content. The
// board and the showcase are readable by guests; everything else needs a
// signed-in user. Every function resolves to { …, error } instead of throwing.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteUrlsDeep, rewriteStorageUrl } from "../supabase/storageUrl";

const NOT_CONFIGURED = new Error("Supabase not configured");

export const SHOWCASE_PAGE = 24;
export const REQUESTS_PAGE = 30;

function mapWorkRow(r) {
  return {
    id: r.work_id,
    title: r.title || "",
    cover: rewriteStorageUrl(r.cover_url) || null,
    photos: r.photos || 0,
    likes: r.likes || 0,
    createdAt: r.created_at,
    liked: Boolean(r.liked),
    saved: Boolean(r.saved),
    builder: {
      id: r.builder_id,
      username: r.username,
      displayName: r.display_name || r.username,
      avatarUrl: rewriteStorageUrl(r.avatar_url) || null,
    },
  };
}

// sort: 'new' | 'popular'; style: a style key or null. Returns { works, error }.
export async function fetchShowcase({ sort = "new", style = null, offset = 0 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { works: [], error: null };
  const { data, error } = await supabase.rpc("list_showcase", {
    p_sort: sort,
    p_style: style,
    p_limit: SHOWCASE_PAGE,
    p_offset: offset,
  });
  if (error) return { works: [], error };
  return { works: (data || []).map(mapWorkRow), error: null };
}

export async function fetchSavedWorks() {
  const supabase = getSupabaseClient();
  if (!supabase) return { works: [], error: null };
  const { data, error } = await supabase.rpc("list_saved_works", { p_limit: 200, p_offset: 0 });
  if (error) return { works: [], error };
  return { works: (data || []).map(mapWorkRow), error: null };
}

// Returns { saved, error }.
export async function toggleWorkSave(workId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { saved: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc("toggle_work_save", { p_work: workId });
  if (error) return { saved: null, error };
  return { saved: Boolean(data), error: null };
}

// ─── "Looking for a builder" ─────────────────────────────────────────────────

// status: 'open' | 'all'; mine: only the caller's. Returns { briefs, error }.
export async function fetchPublicBriefs({ status = "open", type = null, mine = false, offset = 0 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { briefs: [], error: null };
  const { data, error } = await supabase.rpc("list_public_briefs", {
    p_status: status,
    p_type: type,
    p_mine: mine,
    p_limit: REQUESTS_PAGE,
    p_offset: offset,
  });
  if (error) return { briefs: [], error };
  return { briefs: rewriteUrlsDeep(data || []), error: null };
}

// Returns { briefId, error }.
export async function publishBrief(payload) {
  const supabase = getSupabaseClient();
  if (!supabase) return { briefId: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc("publish_brief", { p_brief: payload });
  return { briefId: data || null, error: error || null };
}

export async function closePublicBrief(briefId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("close_public_brief", { p_brief: briefId });
  return { error: error || null };
}

// A builder responds. Returns { conversationId, error }.
export async function respondToBrief(briefId, message, workIds = []) {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversationId: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc("respond_to_brief", {
    p_brief: briefId,
    p_message: message,
    p_work_ids: workIds,
  });
  return { conversationId: data || null, error: error || null };
}

// ─── Reports and moderation ──────────────────────────────────────────────────

// type: 'brief' | 'work'. Returns { error }.
export async function reportContent(type, id, reason) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("report_content", { p_type: type, p_id: id, p_reason: reason });
  return { error: error || null };
}

export async function setBriefHidden(briefId, hidden) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("admin_set_brief_hidden", { p_brief: briefId, p_hidden: Boolean(hidden) });
  return { error: error || null };
}

export async function listCommunityReports(status = "open") {
  const supabase = getSupabaseClient();
  if (!supabase) return { reports: [], error: null };
  const { data, error } = await supabase.rpc("admin_list_community_reports", { p_status: status });
  if (error) return { reports: [], error };
  return { reports: data || [], error: null };
}

export async function resolveCommunityReport(reportId, status) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("admin_resolve_community_report", { p_report: reportId, p_status: status });
  return { error: error || null };
}
