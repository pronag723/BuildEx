"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Likes, views and public stats for works
// Thin wrappers over the RPCs in migration 0107_work_engagement.sql. Every
// counter moves only inside those SECURITY DEFINER functions: the browser can
// ask to like a work or report that it viewed one, never set a number.
//
// Like lib/favorites/api.js, nothing here throws; a missing Supabase client or
// a failed call resolves to an empty result plus `error`.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// Works already reported as viewed in this tab session. The server dedups per
// viewer per day anyway; this only saves a round trip every time the same work
// is reopened. sessionStorage can be missing or throw (private mode, blocked
// storage), in which case every open simply makes the call.
const VIEWED_KEY = "buildex:viewed-works";
const VIEWED_MAX = 500;

function readViewed() {
  try {
    const raw = window.sessionStorage.getItem(VIEWED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function rememberViewed(workId) {
  try {
    const list = readViewed().filter((id) => id !== workId);
    list.push(workId);
    window.sessionStorage.setItem(VIEWED_KEY, JSON.stringify(list.slice(-VIEWED_MAX)));
  } catch {
    // Storage unavailable — nothing to remember, nothing lost.
  }
}

// Likes or unlikes a work for the signed-in user. Resolves to the server's
// state: { liked, likes, error }. The RPC refuses anonymous callers, the
// builder's own works and more than 60 new likes an hour, with a plain-English
// message in error.message.
export async function toggleWorkLike(workId) {
  const supabase = getSupabaseClient();
  if (!supabase || !workId) return { liked: null, likes: null, error: null };

  const { data, error } = await supabase.rpc("toggle_work_like", { p_work: workId });
  if (error) return { liked: null, likes: null, error };
  return { liked: !!data?.liked, likes: data?.likes_count ?? null, error: null };
}

// Which of these works the signed-in user has liked. work_likes is readable
// only by its owner (and not by anon at all), so callers pass their user id and
// get an empty set when signed out.
export async function fetchMyLikes(userId, workIds) {
  const supabase = getSupabaseClient();
  const ids = (workIds || []).filter(Boolean);
  if (!supabase || !userId || ids.length === 0) return { likedIds: new Set(), error: null };

  const { data, error } = await supabase
    .from("work_likes")
    .select("work_id")
    .eq("user_id", userId)
    .in("work_id", ids);

  if (error) return { likedIds: new Set(), error };
  return { likedIds: new Set((data || []).map((row) => row.work_id)), error: null };
}

// Reports that the visitor opened a work. Fire-and-forget: a failed or
// refused view is not worth surfacing. The server ignores the builder's own
// views and counts each viewer once per work per day.
export function recordWorkView(workId) {
  const supabase = getSupabaseClient();
  if (!supabase || !workId) return;
  if (readViewed().includes(workId)) return;
  rememberViewed(workId);
  supabase
    .rpc("record_work_view", { p_work: workId })
    .then(() => {}, () => {});
}

// Header and sidebar numbers for one builder. Null when the builder is not
// visible to the caller (hidden by a moderator, or not a builder).
export async function fetchBuilderStats(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { stats: null, error: null };

  const { data, error } = await supabase.rpc("get_builder_public_stats", { p_builder: builderId });
  if (error) return { stats: null, error };
  if (!data) return { stats: null, error: null };
  return {
    stats: {
      worksCount: data.works_count ?? 0,
      likesTotal: Number(data.likes_total ?? 0),
      viewsTotal: Number(data.views_total ?? 0),
      // Null until the builder has answered enough threads to make it fair.
      responseMinutes: data.response_median_minutes ?? null,
      responseSamples: data.response_samples ?? 0,
    },
    error: null,
  };
}
