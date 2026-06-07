"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Reviews data layer (Stage 8)
// Thin wrappers over the reviews RPC + table added in
// supabase/migrations/0013_reviews.sql. Same { data, error } convention as
// lib/chat/api.js and lib/orders/api.js — never throws on a missing or
// misconfigured Supabase client; resolves to a null/empty result instead.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// Embeds the reviewer's public identity so a single fetch hydrates the profile
// Reviews tab. profiles is publicly readable under RLS, so the embed is safe.
const REVIEW_COLUMNS =
  "id, order_id, reviewer_id, builder_id, rating, body, created_at, " +
  "reviewer:reviewer_id (username, display_name, avatar_url)";

// ─── Mutations (RPC) ─────────────────────────────────────────────────────────

// Leave a review on a completed order. The RPC enforces buyer-only, completed,
// once-per-order server-side. Returns { reviewId, error }.
export async function leaveReview({ orderId, rating, body }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { reviewId: null, error: new Error("Supabase not configured") };
  }

  const { data, error } = await supabase.rpc("leave_review", {
    p_order: orderId,
    p_rating: rating,
    p_body: body || null,
  });
  if (error) return { reviewId: null, error };
  return { reviewId: data, error: null };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

// All reviews for a builder, newest first, with each reviewer's identity
// embedded. Returns { reviews, error } — empty array when none / no client.
export async function listBuilderReviews(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { reviews: [], error: null };

  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("builder_id", builderId)
    .order("created_at", { ascending: false });

  if (error) return { reviews: [], error };
  return { reviews: data || [], error: null };
}

// The review attached to a single order (if any). Lets the order detail page
// decide whether to show the "Leave a review" form or the submitted review.
// Returns { review, error } — review is null when the order isn't reviewed yet.
export async function fetchOrderReview(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !orderId) return { review: null, error: null };

  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) return { review: null, error };
  return { review: data || null, error: null };
}
