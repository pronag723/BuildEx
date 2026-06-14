"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator data layer
// Thin wrappers over the admin-only RPCs + storage reads added in migration
// 0023_admin_moderation.sql. Every function tolerates a missing/offline
// Supabase by resolving to an empty result instead of throwing (mirrors
// lib/disputes/api.js). The RPCs self-check profiles.is_admin, so a non-admin
// caller just gets empty data.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteUrlsDeep } from "../supabase/storageUrl";

const DELIVERY_BUCKET = "deliverables";
const PREVIEW_BUCKET = "order_previews";

// List orders for moderation. filter: 'open_disputes' (default) | 'rejected' |
// 'all'. Returns { orders, error }.
export async function listAdminOrders(filter = "open_disputes") {
  const supabase = getSupabaseClient();
  if (!supabase) return { orders: [], error: null };

  const { data, error } = await supabase.rpc("admin_list_orders", {
    p_filter: filter,
  });
  if (error) return { orders: [], error };
  return { orders: rewriteUrlsDeep(data || []), error: null };
}

// An order's full conversation, read-only. Returns { messages, error }.
export async function getAdminMessages(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !orderId) return { messages: [], error: null };

  const { data, error } = await supabase.rpc("admin_get_messages", {
    p_order: orderId,
  });
  if (error) return { messages: [], error };
  return { messages: rewriteUrlsDeep(data || []), error: null };
}

// Signed URL for the locked world file (admin bypasses escrow via the storage
// SELECT policy in 0023). Returns { url, error }.
export async function getAdminDeliveryUrl(storagePath, fileName, expiresInSec = 300) {
  const supabase = getSupabaseClient();
  if (!supabase) return { url: null, error: new Error("Supabase not configured") };
  if (!storagePath) return { url: null, error: new Error("No delivery file") };

  const { data, error } = await supabase.storage
    .from(DELIVERY_BUCKET)
    .createSignedUrl(storagePath, expiresInSec, fileName ? { download: fileName } : undefined);
  if (error) return { url: null, error };
  return { url: data?.signedUrl || null, error: null };
}

// Signed URL for the gzipped voxel preview artifact. Returns { url, error }.
export async function getAdminPreviewUrl(previewPath, expiresInSec = 300) {
  const supabase = getSupabaseClient();
  if (!supabase) return { url: null, error: new Error("Supabase not configured") };
  if (!previewPath) return { url: null, error: null };

  const { data, error } = await supabase.storage
    .from(PREVIEW_BUCKET)
    .createSignedUrl(previewPath, expiresInSec);
  if (error) return { url: null, error };
  return { url: data?.signedUrl || null, error: null };
}
