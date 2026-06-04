"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Disputes data layer (Stage 10)
// Thin wrappers over the dispute RPCs + table added in
// supabase/migrations/0015_disputes.sql. Same { data, error } convention as
// lib/orders/api.js and lib/reviews/api.js — never throws on a missing or
// misconfigured Supabase client; resolves to a null/empty result instead.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

const DISPUTE_COLUMNS =
  "id, order_id, opened_by, reason, status, resolution_note, " +
  "resolved_by, created_at, resolved_at";

// ─── Mutations (RPCs) ───────────────────────────────────────────────────────

// Open a dispute on a delivered order. The RPC enforces buyer-only / delivered
// / once-per-order server-side. Returns { disputeId, error }.
export async function openDispute({ orderId, reason }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { disputeId: null, error: new Error("Supabase not configured") };
  }

  const { data, error } = await supabase.rpc("open_dispute", {
    p_order: orderId,
    p_reason: reason,
  });
  if (error) return { disputeId: null, error };
  return { disputeId: data, error: null };
}

// Admin-only resolution. outcome is "release" (→ completed) or "refund"
// (→ cancelled). The RPC re-checks profiles.is_admin server-side. Returns
// { error }.
export async function resolveDispute({ orderId, outcome, note }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("resolve_dispute", {
    p_order: orderId,
    p_outcome: outcome,
    p_note: note || null,
  });
  return { error: error || null };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

// The dispute attached to a single order (if any). RLS returns it only to the
// order's buyer/builder or an admin. Returns { dispute, error } — dispute is
// null when the order hasn't been disputed.
export async function fetchOrderDispute(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !orderId) return { dispute: null, error: null };

  const { data, error } = await supabase
    .from("disputes")
    .select(DISPUTE_COLUMNS)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) return { dispute: null, error };
  return { dispute: data || null, error: null };
}

// Admin queue: every OPEN dispute with order + party context, oldest first.
// Goes through the SECURITY DEFINER RPC because the orders RLS hides non-party
// rows from admins. Returns { disputes, error } — empty array for non-admins.
export async function listOpenDisputes() {
  const supabase = getSupabaseClient();
  if (!supabase) return { disputes: [], error: null };

  const { data, error } = await supabase.rpc("list_open_disputes");
  if (error) return { disputes: [], error };
  return { disputes: data || [], error: null };
}
