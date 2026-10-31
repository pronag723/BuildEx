"use client";

// Storage and messages for 3D previews in chat (migration 0115). The preview
// (BXV1, already gzipped) and its picture go to the chat-previews bucket under
// the sender's own folder; send_preview_message() then posts the card.

import { getSupabaseClient } from "../supabase/client";

export const PREVIEW_BUCKET = "chat-previews";

const NOT_CONFIGURED = new Error("Supabase not configured");

function randomName() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The public address of a preview file, from its stored path. Null for a path
// that is not someone's own folder (only those are ever written).
export function previewFileUrl(path) {
  if (typeof path !== "string" || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path)) return null;
  const supabase = getSupabaseClient();
  return supabase?.storage.from(PREVIEW_BUCKET).getPublicUrl(path)?.data?.publicUrl || null;
}

// Upload the preview and its picture. Returns { path, thumb, error }.
export async function uploadPreview(userId, bytes, thumbBlob) {
  const supabase = getSupabaseClient();
  if (!supabase) return { path: null, thumb: null, error: NOT_CONFIGURED };
  const name = randomName();
  const path = `${userId}/${name}.bxv`;
  const ext = thumbBlob?.type === "image/png" ? "png" : "webp";
  const thumb = `${userId}/${name}.${ext}`;
  const store = supabase.storage.from(PREVIEW_BUCKET);
  const a = await store.upload(path, new Blob([bytes], { type: "application/octet-stream" }), {
    cacheControl: "2592000",
    upsert: false,
    contentType: "application/octet-stream",
  });
  if (a.error) return { path: null, thumb: null, error: a.error };
  const b = await store.upload(thumb, thumbBlob, {
    cacheControl: "2592000",
    upsert: false,
    contentType: thumbBlob.type || "image/webp",
  });
  if (b.error) {
    await store.remove([path]);
    return { path: null, thumb: null, error: b.error };
  }
  return { path, thumb, error: null };
}

// Post the card. Returns { message, error } with the inserted row.
export async function sendPreviewMessage(conversationId, { path, thumb, meta, caption }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { message: null, error: NOT_CONFIGURED };
  const { data: id, error } = await supabase.rpc("send_preview_message", {
    p_conversation: conversationId,
    p_path: path,
    p_thumb: thumb,
    p_meta: { format: meta.format, size: meta.size, voxels: meta.voxels, blocks: meta.blocks },
    p_caption: caption || null,
  });
  if (error) return { message: null, error };
  const { data, error: e2 } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, read_at, msg_type, meta")
    .eq("id", id)
    .single();
  return { message: data || null, error: e2 || null };
}

// Download and decode a preview for the viewer.
export async function loadPreviewModel(path) {
  const url = previewFileUrl(path);
  if (!url) throw new Error("No preview");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Preview not available (${res.status})`);
  const gz = new Uint8Array(await res.arrayBuffer());
  const [{ gunzipSync }, { decodePreview }] = await Promise.all([import("fflate"), import("./voxels")]);
  return decodePreview(gz, gunzipSync);
}
