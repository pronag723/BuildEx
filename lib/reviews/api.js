"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder reviews
// Wrappers over public.builder_reviews and its RPCs (migration
// 0108_reviews_and_moderation.sql). A review can be written only by someone
// with a real chat with the builder; the server decides that, and every write
// goes through an RPC — the table grants no INSERT/UPDATE/DELETE at all.
//
// builder_reviews has two foreign keys to profiles (builder_id, reviewer_id),
// so the reviewer embed names its constraint (the 0101 PGRST201 lesson). The
// select lists columns explicitly: hidden_reason is not readable by clients,
// so `select=*` would be refused.
//
// Like lib/favorites/api.js, nothing here throws.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteStorageUrl } from "../supabase/storageUrl";

export const REVIEWS_PAGE_SIZE = 10;

// can_review_builder statuses, as the server returns them.
export const REVIEW_STATUS = {
  ok: "ok",
  notSignedIn: "not_signed_in",
  self: "self",
  notBuilder: "not_builder",
  noConversation: "no_conversation",
  tooSoon: "too_soon",
};

const REVIEW_SELECT =
  "id, builder_id, reviewer_id, price_tier_id, rating, body, created_at, updated_at, hidden_at, " +
  "reviewer:profiles!builder_reviews_reviewer_id_fkey(id, username, display_name, avatar_url), " +
  "tier:builder_price_tiers!builder_reviews_price_tier_id_fkey(id, name)";

export function mapReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    builderId: row.builder_id,
    reviewerId: row.reviewer_id,
    rating: row.rating,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Only ever true for the caller's own review (RLS shows hidden reviews to
    // their author and to admins, nobody else).
    hidden: !!row.hidden_at,
    tier: row.tier ? { id: row.tier.id, name: row.tier.name } : null,
    reviewer: row.reviewer
      ? {
          id: row.reviewer.id,
          username: row.reviewer.username,
          displayName: row.reviewer.display_name || row.reviewer.username,
          avatarUrl: rewriteStorageUrl(row.reviewer.avatar_url) || null,
        }
      : null,
  };
}

// A page of reviews about a builder, newest first, plus the total the caller
// can see. `from`/`to` are inclusive row offsets.
export async function fetchReviews(builderId, { from = 0, to = REVIEWS_PAGE_SIZE - 1 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { reviews: [], count: 0, error: null };

  const { data, count, error } = await supabase
    .from("builder_reviews")
    .select(REVIEW_SELECT, { count: "exact" })
    .eq("builder_id", builderId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return { reviews: [], count: 0, error };
  return { reviews: (data || []).map(mapReview), count: count ?? 0, error: null };
}

// May the signed-in user review this builder, and what did they write before?
// Resolves to { status, review, error }; status is one of REVIEW_STATUS.
export async function canReview(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { status: REVIEW_STATUS.notSignedIn, review: null, error: null };

  const { data, error } = await supabase.rpc("can_review_builder", { p_builder: builderId });
  if (error) return { status: null, review: null, error };

  const review = data?.review
    ? {
        id: data.review.id,
        rating: data.review.rating,
        body: data.review.body,
        tierId: data.review.price_tier_id || null,
        createdAt: data.review.created_at,
        updatedAt: data.review.updated_at,
        hidden: !!data.review.hidden,
      }
    : null;
  return { status: data?.status || null, review, error: null };
}

// Writes or rewrites the caller's review. The server re-checks eligibility,
// the 1–5 rating, the 20–1500 character body, the tier and the daily cap, and
// says why in error.message when it refuses.
export async function upsertReview(builderId, { rating, body, tierId = null }) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { id: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("upsert_builder_review", {
    p_builder: builderId,
    p_rating: rating,
    p_body: body,
    p_tier: tierId || null,
  });
  if (error) return { id: null, error };
  return { id: data || null, error: null };
}

export async function deleteMyReview(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("delete_my_review", { p_builder: builderId });
  return { error: error || null };
}

// Flags a review for the moderators. Not for your own review; one open report
// per review per person.
export async function reportReview(reviewId, reason) {
  const supabase = getSupabaseClient();
  if (!supabase || !reviewId) return { id: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("report_review", {
    p_review: reviewId,
    p_reason: reason,
  });
  if (error) return { id: null, error };
  return { id: data || null, error: null };
}
