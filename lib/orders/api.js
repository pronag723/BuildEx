"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Orders data layer
// Thin wrappers over the orders RPCs added in supabase/migrations/0009_orders.sql.
// Same { data, error } convention as lib/chat/api.js — never throws on a missing
// or misconfigured Supabase client; resolves to a null/empty result instead.
// Stages 4+ extend this module (list functions, delivery upload, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

const ORDER_COLUMNS =
  "id, buyer_id, builder_id, building_size, style, brief, " +
  "price_kopecks, commission_kopecks, builder_earnings_kopecks, " +
  "status, conversation_id, created_at, updated_at, " +
  "paid_at, started_at, delivered_at, completed_at, cancelled_at";

// Same as ORDER_COLUMNS but embeds both counterparts' public identity in one
// shot. PostgREST disambiguates the two FK paths to public.profiles by the
// column name (buyer_id / builder_id). RLS still only returns rows where the
// caller is buyer or builder, so the embed never leaks third-party data.
const ORDER_WITH_PARTIES_COLUMNS =
  ORDER_COLUMNS +
  ", buyer:buyer_id (id, username, display_name, avatar_url)" +
  ", builder:builder_id (id, username, display_name, avatar_url)";

// ─── Mutations (RPCs) ───────────────────────────────────────────────────────

// Create a pending_payment order against the given builder. The RPC snapshots
// the price from builder_profiles.rates and computes commission server-side.
// Returns { orderId, error }.
export async function placeOrder({ builderId, size, style, brief }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { orderId: null, error: new Error("Supabase not configured") };
  }

  const { data, error } = await supabase.rpc("place_order", {
    p_builder: builderId,
    p_size: size,
    p_style: style,
    p_brief: brief,
  });
  if (error) return { orderId: null, error };
  return { orderId: data, error: null };
}

// MOCK PAYMENT: moves an order from pending_payment to paid. Stage 12 replaces
// this with the real SBP webhook path; the client will no longer call it
// directly. Returns { error }.
export async function markOrderPaid(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("mark_order_paid", { p_order: orderId });
  return { error: error || null };
}

// Stage 4 lifecycle transitions — exposed now so the rest of the app can
// import a single module. The RPCs already enforce role + status server-side.
export async function builderStartWork(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.rpc("builder_start_work", { p_order: orderId });
  return { error: error || null };
}

export async function builderDeliver(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.rpc("builder_deliver", { p_order: orderId });
  return { error: error || null };
}

export async function buyerConfirmComplete(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.rpc("buyer_confirm_complete", { p_order: orderId });
  return { error: error || null };
}

export async function cancelOrder(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.rpc("cancel_order", { p_order: orderId });
  return { error: error || null };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

// Fetch a single order with both parties' public identity embedded.
// RLS only returns it to its buyer or builder. Returns { order, error }.
export async function fetchOrder(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !orderId) return { order: null, error: null };

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_WITH_PARTIES_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();

  if (error) return { order: null, error };
  return { order: data || null, error: null };
}

// All orders the caller is party to, with both counterparts embedded so a
// single fetch hydrates the role-split dashboards. RLS restricts to the
// caller's rows; the page filters by buyer_id vs builder_id against meId.
// Returns { orders, error }.
export async function listMyOrders() {
  const supabase = getSupabaseClient();
  if (!supabase) return { orders: [], error: null };

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_WITH_PARTIES_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) return { orders: [], error };
  return { orders: data || [], error: null };
}

// Backwards-compat aliases kept for callers that hit the old names.
// Both return every order the caller is party to — the page splits them.
export async function listMyOrdersAsBuyer() {
  return listMyOrders();
}
export async function listMyOrdersAsBuilder() {
  return listMyOrders();
}
