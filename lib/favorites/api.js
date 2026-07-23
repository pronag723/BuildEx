"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Favorites data layer
// Thin wrappers over the public.favorites table added in migration
// 0018_favorites.sql. Mirrors lib/notifications/api.js: every function tolerates
// a missing/offline Supabase by resolving to an empty/no-op result instead of
// throwing. RLS guarantees a user can only ever read or mutate their own rows,
// so the client adds/removes/lists directly — no RPC needed.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// Every builder id the signed-in user has favorited. RLS scopes the result to
// the caller's own rows. Returns { builderIds, error } where builderIds is an
// array of profile uuids.
export async function listFavorites() {
  const supabase = getSupabaseClient();
  if (!supabase) return { builderIds: [], favoriteKeys: [], error: null };

  const { data, error } = await supabase
    .from("favorites")
    .select("builder_id, studio_id")
    .order("created_at", { ascending: false });

  if (error) return { builderIds: [], favoriteKeys: [], error };
  const favoriteKeys = (data || []).map((row) =>
    row.studio_id ? `studio:${row.studio_id}` : `builder:${row.builder_id}`
  );
  return {
    builderIds: (data || []).map((row) => row.builder_id).filter(Boolean),
    favoriteKeys,
    error: null,
  };
}

// Bookmark a builder. `userId` is the caller's own profile id (required to
// satisfy the RLS `with check (user_id = auth.uid())`). Idempotent: a duplicate
// insert hits the unique constraint, which we treat as success. Returns { error }.
export async function addFavorite(userId, targetId, providerType = "builder") {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || !targetId) return { error: null };

  const { error } = await supabase
    .from("favorites")
    .insert({
      user_id: userId,
      builder_id: providerType === "studio" ? null : targetId,
      studio_id: providerType === "studio" ? targetId : null,
    });

  // 23505 = unique_violation → already favorited, not a real error.
  if (error && error.code !== "23505") return { error };
  return { error: null };
}

// Remove a bookmark. RLS scopes the delete to the caller's own rows, but we also
// filter explicitly so the intent is clear. Returns { error }.
export async function removeFavorite(userId, targetId, providerType = "builder") {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || !targetId) return { error: null };

  let query = supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId);
  query =
    providerType === "studio"
      ? query.eq("studio_id", targetId)
      : query.eq("builder_id", targetId);
  const { error } = await query;

  return { error: error || null };
}
