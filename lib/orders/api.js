"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Briefs and orders in chat (migration 0114)
// Thin wrappers over the order RPCs. There is no money here: an order is the
// record two people keep in their thread of what was agreed and where it
// stands. Every status change goes through an RPC — clients can read their
// orders but not write them — and each one leaves a system line in the chat.
// Every function resolves to { …, error } instead of throwing; RPC errors are
// written for a person and reach the toast through serverMessage().
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { uploadImage } from "../onboarding/api";
import { BUCKETS } from "../onboarding/constants";
import { IMAGE_PRESETS } from "../images/compress";

const NOT_CONFIGURED = new Error("Supabase not configured");

const BRIEF_COLUMNS =
  "id, author_id, title, build_type, styles, size_w, size_l, size_h, edition, mc_version, deadline, " +
  "budget_min_rub, budget_max_rub, budget_open, delivery, refs, description, extra, created_at, updated_at";

const ORDER_COLUMNS =
  "id, brief_id, conversation_id, client_id, builder_id, status, price_rub, deadline, offered_at, taken_at, " +
  "delivered_at, completed_at, closed_at, closed_by, close_reason, close_note, delivery_note, last_reminded_at, " +
  "created_at, updated_at";

async function rpc(name, args) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc(name, args);
  return { data: data ?? null, error: error || null };
}

// Every order in one thread, oldest first, each with its brief.
// Returns { orders, error }.
export async function fetchConversationOrders(conversationId) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId) return { orders: [], error: null };
  const { data, error } = await supabase
    .from("chat_orders")
    .select(`${ORDER_COLUMNS}, brief:briefs!chat_orders_brief_id_fkey(${BRIEF_COLUMNS})`)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) return { orders: [], error };
  return { orders: data || [], error: null };
}

// Send a brief to a builder; opens the thread if needed (0100's limits on new
// conversations apply). Returns { conversationId, orderId, error }.
export async function sendBrief(builderId, payload) {
  const { data, error } = await rpc("send_brief", { p_builder: builderId, p_brief: payload });
  if (error) return { conversationId: null, orderId: null, error };
  return { conversationId: data?.conversation_id || null, orderId: data?.order_id || null, error: null };
}

export async function updateBrief(orderId, payload) {
  const { error } = await rpc("update_brief", { p_order: orderId, p_brief: payload });
  return { error };
}

// Returns { status: 'in_progress' | 'offered', error }.
export async function takeOrder(orderId, priceRub, deadline) {
  const { data, error } = await rpc("take_order", {
    p_order: orderId,
    p_price_rub: priceRub,
    p_deadline: deadline,
  });
  return { status: data, error };
}

export async function answerOffer(orderId, accept) {
  const { data, error } = await rpc("answer_offer", { p_order: orderId, p_accept: Boolean(accept) });
  return { status: data, error };
}

export async function declineOrder(orderId, reason, note = "") {
  const { error } = await rpc("decline_order", { p_order: orderId, p_reason: reason, p_note: note || null });
  return { error };
}

export async function deliverOrder(orderId, note = "") {
  const { error } = await rpc("deliver_order", { p_order: orderId, p_note: note || null });
  return { error };
}

export async function completeOrder(orderId) {
  const { error } = await rpc("complete_order", { p_order: orderId });
  return { error };
}

export async function cancelOrder(orderId, note = "") {
  const { error } = await rpc("cancel_order", { p_order: orderId, p_note: note || null });
  return { error };
}

export async function remindClient(orderId) {
  const { error } = await rpc("remind_client", { p_order: orderId });
  return { error };
}

// The client's review after a completed order. Returns { reviewId, error }.
export async function reviewOrder(orderId, rating, body) {
  const { data, error } = await rpc("review_order", { p_order: orderId, p_rating: rating, p_body: body });
  return { reviewId: data, error };
}

// The caller's existing review of a builder, if any (can_review_builder, 0108
// + 0114's order_id). Returns { review, error }.
export async function fetchMyReview(builderId) {
  const { data, error } = await rpc("can_review_builder", { p_builder: builderId });
  return { review: data?.review || null, error };
}

// A reference photo: compressed and uploaded to the author's own chat-media
// folder, the only place send_brief accepts photo paths from.
// Returns { ref, error }.
export async function uploadBriefPhoto(userId, file) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ref: null, error: NOT_CONFIGURED };
  const { path, error } = await uploadImage(supabase, {
    bucket: BUCKETS.chatMedia,
    userId,
    file,
    preset: IMAGE_PRESETS.portfolio,
  });
  if (error || !path) return { ref: null, error: error || new Error("Image upload failed") };
  return { ref: { kind: "photo", path }, error: null };
}
