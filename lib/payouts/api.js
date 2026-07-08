"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Payouts data layer (Stage 12, outgoing)
// Reads the payout queue and drives the two payout Edge Functions
// (create-payout / verify-payout). Same { ..., error } convention as
// lib/payments/api.js / lib/studios/api.js — never throws; resolves to a
// null/empty result on a missing or misconfigured client.
//
// Reads are RLS-gated: builders see only their own payouts; admins see all
// (migration 0033). All writes go through the service-role Edge Functions / RPCs,
// never directly from the client.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

const PAYOUT_COLUMNS =
  "id, order_id, builder_id, amount_cents, currency, destination, status, provider_batch_id, created_at, sent_at";

// ─── Admin reads ─────────────────────────────────────────────────────────────

// Every payout row (admin only, enforced by RLS). Returns { payouts, error }.
export async function listPayouts() {
  const supabase = getSupabaseClient();
  if (!supabase) return { payouts: [], error: null };

  const { data, error } = await supabase
    .from("payouts")
    .select(
      `${PAYOUT_COLUMNS}, builder:profiles!builder_id(username, display_name)`
    )
    .order("created_at", { ascending: false });

  if (error) return { payouts: [], error };
  return { payouts: data || [], error: null };
}

// ─── Builder reads ───────────────────────────────────────────────────────────

// The signed-in builder's own payouts, keyed by order id for easy lookup in the
// orders UI. Returns { byOrder: { [orderId]: payout }, error }.
export async function listMyPayouts() {
  const supabase = getSupabaseClient();
  if (!supabase) return { byOrder: {}, error: null };

  const { data, error } = await supabase
    .from("payouts")
    .select(PAYOUT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) return { byOrder: {}, error };
  const byOrder = {};
  for (const row of data || []) byOrder[row.order_id] = row;
  return { byOrder, error: null };
}

// ─── Admin actions (Edge Functions + RPC) ────────────────────────────────────

// Create a NOWPayments Mass Payout batch for the given pending payout ids. The
// batch isn't sent until confirmPayoutBatch supplies the 2FA code. Returns
// { batchId, count, error }.
export async function startPayoutBatch(payoutIds) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { batchId: null, count: 0, error: new Error("Supabase not configured") };
  }
  if (!Array.isArray(payoutIds) || payoutIds.length === 0) {
    return { batchId: null, count: 0, error: new Error("No payouts selected") };
  }

  const { data, error } = await supabase.functions.invoke("create-payout", {
    body: { payoutIds },
  });
  if (error) return { batchId: null, count: 0, error };
  if (!data?.batchId) {
    return { batchId: null, count: 0, error: new Error("No batch id returned") };
  }
  return { batchId: data.batchId, count: data.count || payoutIds.length, error: null };
}

// Confirm a created batch with the emailed/authenticator 2FA code. On success the
// withdrawals send and the rows flip to 'sent'. Returns { ok, error }.
export async function confirmPayoutBatch(batchId, code) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: new Error("Supabase not configured") };
  if (!batchId || !code) {
    return { ok: false, error: new Error("Batch id and code are required") };
  }

  const { data, error } = await supabase.functions.invoke("verify-payout", {
    body: { batchId, code: String(code).trim() },
  });
  if (error) return { ok: false, error };
  return { ok: data?.ok === true, error: null };
}

// Re-queue a blocked (no wallet at completion) or failed payout once the builder
// has a wallet on file. Returns { error }.
export async function requeuePayout(payoutId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_requeue_payout", { p_payout: payoutId });
  return { error: error || null };
}

export async function markFiatPayoutSent(payoutId, note = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_mark_fiat_payout_sent", {
    p_payout: payoutId,
    p_note: note || null,
  });
  return { error: error || null };
}
