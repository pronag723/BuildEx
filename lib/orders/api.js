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

// ─── Escrow file delivery (Stage 6) ─────────────────────────────────────────

const DELIVERY_BUCKET = "deliverables";

// Strip anything that isn't safe to drop into a URL path. Storage names can
// technically hold most characters, but keeping the path conservative (no
// spaces, no leading dots, capped at 80 chars) makes signed URLs and CLI
// debugging much easier.
function sanitizeFileName(name) {
  const trimmed = String(name || "").trim();
  const noPath = trimmed.replace(/[\\/]/g, "_");
  const ascii = noPath.replace(/[^A-Za-z0-9._-]/g, "_");
  const stripped = ascii.replace(/^\.+/, "");
  return stripped.slice(0, 80) || "file.bin";
}

// Upload the builder's world file to the private `deliverables` bucket.
// The first path segment MUST equal the order id — storage RLS keys on it.
// Returns { path, error }. Progress is reported only as start/finish because
// the Supabase JS client doesn't surface fetch upload progress (same caveat
// as uploadImage in lib/onboarding/api.js).
export async function uploadDeliverable(orderId, file, onProgress) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { path: null, error: new Error("Supabase not configured") };
  }
  if (!orderId || !file) {
    return { path: null, error: new Error("Missing order or file") };
  }

  const safeName = sanitizeFileName(file.name);
  const path = `${orderId}/${Date.now()}-${safeName}`;

  onProgress?.(0.05);
  const { error } = await supabase.storage
    .from(DELIVERY_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      // Allow re-upload — storage RLS still gates each call against the
      // order's current builder + 'in_progress' status.
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
  if (error) {
    onProgress?.(0);
    return { path: null, error };
  }
  onProgress?.(1);
  return { path, error: null };
}

// After the upload succeeds, call the RPC to record the delivery row and
// transition the order to 'delivered'. Stage 7: an optional voxel preview
// (previewPath + previewMeta) is recorded in the same call; passing neither
// keeps the Stage 6 behaviour. Returns { deliveryId, error }.
export async function attachDelivery({
  orderId,
  path,
  fileName,
  size,
  note,
  previewPath = null,
  previewMeta = null,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { deliveryId: null, error: new Error("Supabase not configured") };
  }

  const { data, error } = await supabase.rpc("builder_attach_delivery", {
    p_order: orderId,
    p_path: path,
    p_file_name: fileName,
    p_size: size,
    p_note: note || null,
    p_preview_path: previewPath,
    p_preview_meta: previewMeta,
  });
  if (error) return { deliveryId: null, error };
  return { deliveryId: data, error: null };
}

// ─── World preview artifact (Stage 7) ────────────────────────────────────────

const PREVIEW_BUCKET = "order_previews";

// Upload the gzipped voxel artifact produced in the builder's browser. Like the
// deliverable, the first path segment MUST equal the order id (storage RLS keys
// on it). Returns { path, error }.
export async function uploadPreview(orderId, bytes) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { path: null, error: new Error("Supabase not configured") };
  }
  if (!orderId || !bytes) {
    return { path: null, error: new Error("Missing order or preview data") };
  }

  const path = `${orderId}/${Date.now()}-preview.bxv`;
  const { error } = await supabase.storage
    .from(PREVIEW_BUCKET)
    .upload(path, bytes, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/gzip",
    });
  if (error) return { path: null, error };
  return { path, error: null };
}

// Short-lived signed URL for the preview artifact. Unlike the locked world file
// this is readable by both parties at any status (the storage SELECT policy in
// migration 0012 is the gatekeeper), so there's no `locked` concept here.
// Returns { url, meta, error }; url is null when no preview exists.
export async function getPreviewUrl(orderId, expiresInSec = 300) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { url: null, meta: null, error: new Error("Supabase not configured") };
  }

  const { delivery, error: fetchError } = await fetchDelivery(orderId);
  if (fetchError) return { url: null, meta: null, error: fetchError };
  if (!delivery || !delivery.preview_path) {
    return { url: null, meta: null, error: null };
  }

  const { data, error } = await supabase.storage
    .from(PREVIEW_BUCKET)
    .createSignedUrl(delivery.preview_path, expiresInSec);
  if (error) return { url: null, meta: null, error };
  return {
    url: data?.signedUrl || null,
    meta: delivery.preview_meta || null,
    error: null,
  };
}

// Fetch the delivery row + an `unlocked` flag describing whether the caller
// may download right now. Returns { delivery, error } — delivery is null when
// the builder hasn't uploaded yet.
export async function fetchDelivery(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !orderId) return { delivery: null, error: null };

  const { data, error } = await supabase.rpc("get_delivery_info", {
    p_order: orderId,
  });
  if (error) return { delivery: null, error };
  // RPC returns a set (zero or one row).
  const row = Array.isArray(data) ? data[0] : data;
  return { delivery: row || null, error: null };
}

// Generate a short-lived signed URL for the buyer/builder to actually
// download the file. Returns { url, locked, error }:
//   • locked=true means the DB knows the caller isn't entitled yet
//     (buyer pre-completion) — surface this as a friendly "confirm to unlock"
//     message instead of an error.
//   • error means everything else (no delivery yet, storage rejected, etc.).
export async function getDeliveryDownloadUrl(orderId, expiresInSec = 300) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { url: null, locked: false, error: new Error("Supabase not configured") };
  }

  const { delivery, error: fetchError } = await fetchDelivery(orderId);
  if (fetchError) return { url: null, locked: false, error: fetchError };
  if (!delivery) {
    return { url: null, locked: false, error: new Error("No delivery yet") };
  }
  if (!delivery.unlocked) {
    return { url: null, locked: true, error: null };
  }

  const { data, error } = await supabase.storage
    .from(DELIVERY_BUCKET)
    .createSignedUrl(delivery.storage_path, expiresInSec, {
      download: delivery.file_name,
    });
  if (error) return { url: null, locked: false, error };
  return { url: data?.signedUrl || null, locked: false, error: null };
}
