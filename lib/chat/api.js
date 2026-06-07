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

// Resolve a public @handle to the lightweight identity the chat UI needs.
// Returns null when Supabase is unavailable or no such user exists.
export async function resolveProfileByUsername(username) {
  const supabase = getSupabaseClient();
  if (!supabase || !username) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .ilike("username", username)
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

// The signed-in user's inbox, newest activity first. Returns { conversations, error }.
export async function listConversations() {
  const supabase = getSupabaseClient();
  if (!supabase) return { conversations: [], error: null };

  const { data, error } = await supabase.rpc("list_my_conversations");
  if (error) return { conversations: [], error };
  return { conversations: rewriteUrlsDeep(data || []), error: null };
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
