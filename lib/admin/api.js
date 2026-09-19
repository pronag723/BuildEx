"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator data layer
// Thin wrappers over the admin-only RPCs added in migration
// 0023_admin_moderation.sql. Every function tolerates a missing/offline
// Supabase by resolving to an empty result instead of throwing. The RPCs
// self-check profiles.is_admin, so a non-admin caller just gets empty data.
//
// The order/delivery/payout readers were removed with the payment layer.
// admin_get_messages is kept for the Stage 7 chat-moderation console.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteUrlsDeep } from "../supabase/storageUrl";

// A conversation, read-only, for moderation. Returns { messages, error }.
export async function getAdminMessages(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !orderId) return { messages: [], error: null };

  const { data, error } = await supabase.rpc("admin_get_messages", {
    p_order: orderId,
  });
  if (error) return { messages: [], error };
  return { messages: rewriteUrlsDeep(data || []), error: null };
}
