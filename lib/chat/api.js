"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Chat data layer
// Thin wrappers over the Supabase tables + RPCs added in migration 0007_chat.sql.
// Every function tolerates a missing/offline Supabase by resolving to an empty
// result instead of throwing, mirroring fetchBuilders.js. Realtime is used to
// stream new messages into the open thread and refresh the inbox.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteUrlsDeep } from "../supabase/storageUrl";
import { uploadImage } from "../onboarding/api";
import { BUCKETS } from "../onboarding/constants";
import { IMAGE_PRESETS } from "../images/compress";

// Resolve a public @handle to the lightweight identity the chat UI needs.
// Returns null when Supabase is unavailable or no such user exists.
export async function resolveProfileByUsername(username) {
  const supabase = getSupabaseClient();
  if (!supabase || !username) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    // Escaped: _ is a LIKE wildcard and handles may contain it.
    .ilike("username", String(username).replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();

  if (error || !data) return null;
  return rewriteUrlsDeep(data);
}

// Find (or create) the canonical 1:1 thread with another user.
// Returns { conversationId, error }.
export async function getOrCreateConversation(otherId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversationId: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("get_or_create_conversation", {
    other: otherId,
  });
  if (error) return { conversationId: null, error };
  return { conversationId: data, error: null };
}

// A conversation the current inbox knows how to render: a direct thread between
// two people, with a counterpart to show, or the user's own support thread
// (migration 0112), which has no counterpart and is pinned by the list.
//
// `conversation_type = 'studio_client'` rows still exist in the database — the
// studios feature was decommissioned, not deleted — but there is no longer any
// UI that can render a moderator-brokered, multi-party thread. Those rows (and
// anything else the RPC returns without a counterpart) are skipped here rather
// than being handed to a list item that would render a blank peer or throw.
function isRenderableConversation(c) {
  if (!c || !c.conversation_id) return false;
  if (c.conversation_type === "support") return true;
  if (c.conversation_type && c.conversation_type !== "direct") return false;
  return Boolean(c.other_id);
}

export const isSupportConversation = (c) => c?.conversation_type === "support";

// The public address of a chat photo. Built from meta.path — the file's place
// in the chat-media bucket — rather than trusted from meta.url: before 0112 a
// client could store any url there, and a photo should never make the reader's
// browser fetch from someone else's server. Rows without a path (none are
// written any more) fall back to the stored url.
export function chatImageUrl(meta) {
  if (!meta) return null;
  const path = typeof meta.path === "string" ? meta.path : "";
  if (path && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path)) {
    const supabase = getSupabaseClient();
    const url = supabase?.storage.from(BUCKETS.chatMedia).getPublicUrl(path)?.data?.publicUrl;
    if (url) return url;
  }
  return typeof meta.url === "string" ? meta.url : null;
}

// PostgREST's "no such function" — the database has not had a migration yet.
// Callers use it to hide a feature instead of showing a broken one.
export function isMissingFunction(error) {
  return error?.code === "PGRST202" || error?.code === "42883";
}

// Does this person have a public builder profile?
//
// Chat is not builders-only: the other side of a thread is just as often
// someone hiring, who has a name and an @handle but no builder profile and so
// no page at /builders/profile. The thread header uses this to decide whether
// their @handle should be a link or plain text. Returns false on any error —
// a failed lookup should cost a link, not break the thread.
export async function isPublicBuilder(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return false;
  const { data, error } = await supabase
    .from("builder_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// The signed-in user's inbox, newest activity first. Returns { conversations, error }.
export async function listConversations() {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversations: [], error: null };

  const { data, error } = await supabase.rpc("list_my_conversations");
  if (error) return { conversations: [], error };
  const rows = (data || []).filter(isRenderableConversation);
  return { conversations: rewriteUrlsDeep(rows), error: null };
}

// Full message history for a thread, oldest first. Returns { messages, error }.
export async function fetchMessages(conversationId) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId) return { messages: [], error: null };

  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, read_at, msg_type, meta")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return { messages: [], error };
  return { messages: data || [], error: null };
}

// Insert a message. Returns { message, error }.
export async function sendMessage(conversationId, senderId, body) {
  const supabase = getSupabaseClient();
  if (!supabase) return { message: null, error: new Error("Supabase not configured") };

  const trimmed = (body || "").trim();
  if (!trimmed) return { message: null, error: new Error("Message is empty") };

  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body: trimmed })
    .select("id, conversation_id, sender_id, body, created_at, read_at, msg_type, meta")
    .single();

  if (error) return { message: null, error };
  return { message: data, error: null };
}

// Send a photo. Compresses + uploads the image to the chat-media bucket (reusing
// the same browser pipeline as avatars/portfolios), then inserts an
// msg_type='image' message carrying the URL in `meta`. An optional caption goes
// in `body`. Returns { message, error }.
export async function sendImageMessage(conversationId, senderId, file, caption = "") {
  const supabase = getSupabaseClient();
  if (!supabase) return { message: null, error: new Error("Supabase not configured") };
  if (!conversationId || !senderId) return { message: null, error: new Error("Missing conversation") };
  if (!file) return { message: null, error: new Error("No image selected") };

  const { url, path, error: upErr } = await uploadImage(supabase, {
    bucket: BUCKETS.chatMedia,
    userId: senderId,
    file,
    preset: IMAGE_PRESETS.portfolio,
  });
  if (upErr || !url) {
    return { message: null, error: upErr || new Error("Image upload failed") };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: (caption || "").trim(),
      msg_type: "image",
      meta: { url, path },
    })
    .select("id, conversation_id, sender_id, body, created_at, read_at, msg_type, meta")
    .single();

  if (error) return { message: null, error };
  return { message: data, error: null };
}

// Flag a thread for moderator review. Goes through the SECURITY DEFINER RPC in
// migration 0100 — the reports table has no INSERT policy — which checks that
// the caller is in the conversation, rejects a duplicate open report and caps
// reports per day. Returns { reportId, error }; the RPC's own message is written
// for a person, so the UI shows error.message verbatim.
export async function reportConversation(conversationId, reason) {
  const supabase = getSupabaseClient();
  if (!supabase) return { reportId: null, error: new Error("Supabase not configured") };
  if (!conversationId) return { reportId: null, error: new Error("No conversation to report") };

  const { data, error } = await supabase.rpc("report_conversation", {
    p_conversation: conversationId,
    p_reason: (reason || "").trim(),
  });
  if (error) return { reportId: null, error };
  return { reportId: data, error: null };
}

// Does the caller already have an open report on this thread? Used to show
// "Reported" instead of offering the action again. False on any error — a failed
// lookup should cost a label, not block the UI.
export async function haveIReportedConversation(conversationId) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId) return false;
  const { data, error } = await supabase.rpc("have_i_reported_conversation", {
    p_conversation: conversationId,
  });
  if (error) return false;
  return Boolean(data);
}

// Mute or unmute a thread's notifications (bell and email) for the caller. The
// unread badge still counts it. Returns { muted, error }.
export async function setConversationMuted(conversationId, muted) {
  const supabase = getSupabaseClient();
  if (!supabase) return { muted: !muted, error: new Error("Supabase not configured") };
  if (!conversationId) return { muted: !muted, error: new Error("Missing conversation") };
  const { data, error } = await supabase.rpc("set_conversation_muted", {
    p_conversation: conversationId,
    p_muted: Boolean(muted),
  });
  if (error) return { muted: !muted, error };
  return { muted: Boolean(data), error: null };
}

// ─── New chat ────────────────────────────────────────────────────────────────

// People the caller can start a chat with (search_people, 0112): builders by
// part of a handle or name, anyone already in a chat with them, and anyone at
// all by exact @handle. Before 0112 is applied, falls back to the exact-handle
// lookup the profile link already uses. Returns { people, error }.
export async function searchPeople(query) {
  const supabase = getSupabaseClient();
  const q = String(query || "").trim().replace(/^@/, "");
  if (!supabase || q.length < 2) return { people: [], error: null };

  const { data, error } = await supabase.rpc("search_people", { p_query: q });
  if (error && isMissingFunction(error)) {
    const exact = await resolveProfileByUsername(q);
    return {
      people: exact
        ? [{ ...exact, is_builder: false, last_seen_at: null, conversation_id: null }]
        : [],
      error: null,
    };
  }
  if (error) return { people: [], error };
  return { people: rewriteUrlsDeep(data || []), error: null };
}

// How many new conversations the caller has opened against the 0100 limits.
// Returns null when unknown.
export async function getConversationQuota() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_conversation_quota");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

// ─── Support ─────────────────────────────────────────────────────────────────

// Labels: `chat.support.topics.<key>`.
export const SUPPORT_TOPICS = ["account", "report", "bug", "idea"];

// The caller's support thread, created on first use. A topic (one of
// SUPPORT_TOPICS) is stored on the thread for the moderators' inbox. Returns
// { conversationId, error }.
export async function openSupportThread(topic = null) {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversationId: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("open_support_thread", { p_topic: topic || null });
  if (error) return { conversationId: null, error };
  return { conversationId: data, error: null };
}

// ─── Updates channel ─────────────────────────────────────────────────────────

const ANNOUNCEMENT_COLUMNS =
  "id, kind, title, body, link_url, link_label, event_starts_at, event_ends_at, created_at, hidden_at";

// The pinned "BuildEx Updates" row: unread count, mute switch, newest post.
// `available: false` means the database has no channel yet (0112 not applied),
// so the inbox hides the row — and the support row with it.
export async function fetchAnnouncementsSummary() {
  const supabase = getSupabaseClient();
  if (!supabase) return { summary: null, available: false };
  const { data, error } = await supabase.rpc("my_announcements_summary");
  if (error) return { summary: null, available: !isMissingFunction(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    summary: {
      unread: Number(row?.unread_count) || 0,
      muted: Boolean(row?.muted),
      latestId: row?.latest_id || null,
      latestTitle: row?.latest_title || "",
      latestAt: row?.latest_at || null,
    },
    available: true,
  };
}

// Posts, oldest first, like a chat. RLS hides taken-down posts from everyone
// but moderators; `includeHidden` is for the console. Returns { posts, error }.
export async function fetchAnnouncements({ includeHidden = false, limit = 50 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { posts: [], error: null };
  let query = supabase
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeHidden) query = query.is("hidden_at", null);
  const { data, error } = await query;
  if (error) return { posts: [], error };
  return { posts: (data || []).reverse(), error: null };
}

export async function markAnnouncementsRead() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.rpc("mark_announcements_read");
}

// Returns { muted, error }.
export async function setAnnouncementsMuted(muted) {
  const supabase = getSupabaseClient();
  if (!supabase) return { muted: !muted, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("set_announcements_muted", { p_muted: Boolean(muted) });
  if (error) return { muted: !muted, error };
  return { muted: Boolean(data), error: null };
}

// Clear unread markers on the other party's messages in this thread.
export async function markConversationRead(conversationId) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId) return;
  await supabase.rpc("mark_conversation_read", { conv: conversationId });
}

// Subscribe to new messages in one conversation. `onInsert` receives the new
// message row. Returns an unsubscribe function.
export function subscribeToConversation(conversationId, onInsert) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId) return () => {};

  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert?.(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Subscribe to ALL of the user's incoming messages (Realtime enforces RLS, so
// this only fires for the caller's own threads). Used to live-refresh the inbox
// list. Returns an unsubscribe function.
export function subscribeToInbox(onChange) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  // Unique topic per subscriber: multiple inbox listeners can be live at once
  // (e.g. the global unread badge + the open /chats page), and Supabase channels
  // sharing a topic on one client clobber each other.
  const channel = supabase
    .channel(`messages:inbox:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => onChange?.(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
