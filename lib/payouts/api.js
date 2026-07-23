"use client";

import { getSupabaseClient } from "../supabase/client";

const PAYOUT_COLUMNS =
  "id, order_id, builder_id, studio_id, amount_cents, fee_amount_cents, net_amount_cents, " +
  "currency, destination, payout_method, status, provider_batch_id, " +
  "reviewed_at, rejection_reason, payout_reference, admin_note, created_at, sent_at";

export async function listPayouts() {
  const supabase = getSupabaseClient();
  if (!supabase) return { payouts: [], error: null };

  const { data, error } = await supabase
    .from("payouts")
    .select(
      `${PAYOUT_COLUMNS}, builder:profiles!builder_id(username, display_name), studio:studios!studio_id(name, slug)`,
    )
    .order("created_at", { ascending: false });

  if (error) return { payouts: [], error };
  return { payouts: data || [], error: null };
}

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

export async function listMyPayoutHistory() {
  const supabase = getSupabaseClient();
  if (!supabase) return { payouts: [], error: null };

  const { data, error } = await supabase
    .from("payouts")
    .select(PAYOUT_COLUMNS)
    .order("created_at", { ascending: false });

  return { payouts: error ? [] : data || [], error: error || null };
}

export async function getMyPayoutSummary() {
  const supabase = getSupabaseClient();
  const empty = {
    available_cents: 0,
    pending_cents: 0,
    paid_cents: 0,
    minimum_cents: 2000,
    sepa_enabled: false,
  };
  if (!supabase) return { summary: empty, error: null };

  const { data, error } = await supabase.rpc("get_my_payout_summary");
  return { summary: data || empty, error: error || null };
}

export async function requestWithdrawal(amountCents) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { payoutId: null, error: new Error("Supabase not configured") };
  }

  const { data, error } = await supabase.rpc("request_withdrawal", {
    p_amount_cents: Number(amountCents),
  });
  return { payoutId: data || null, error: error || null };
}

export async function cancelWithdrawal(payoutId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("cancel_withdrawal", { p_payout: payoutId });
  return { error: error || null };
}

export async function approveWithdrawal(payoutId, feeAmountCents) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_approve_withdrawal", {
    p_payout: payoutId,
    p_fee_amount_cents: Number(feeAmountCents),
  });
  return { error: error || null };
}

export async function rejectWithdrawal(payoutId, reason = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_reject_withdrawal", {
    p_payout: payoutId,
    p_reason: reason || null,
  });
  return { error: error || null };
}

export async function markWithdrawalSent(payoutId, reference = "", note = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_mark_withdrawal_sent", {
    p_payout: payoutId,
    p_reference: reference || null,
    p_note: note || null,
  });
  return { error: error || null };
}

export async function markWithdrawalFailed(payoutId, reason = "", note = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_mark_withdrawal_failed", {
    p_payout: payoutId,
    p_reason: reason || null,
    p_note: note || null,
  });
  return { error: error || null };
}
