"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — the Community's global chat (migration 0120)
// One shared room. Anyone reads (list_community_chat, plus Realtime INSERTs,
// which RLS limits to visible messages); signed-in members send through
// send_community_chat (rate-limited). Every function resolves to
// { …, error } instead of throwing.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteStorageUrl } from "../supabase/storageUrl";

const NOT_CONFIGURED = new Error("Supabase not configured");

export const CHAT_PAGE = 50;
export const CHAT_MAX = 1000;

function mapRow(r) {
  return {
    id: r.id,
    body: r.body || "",
    createdAt: r.created_at,
    replyToId: r.reply_to_id || null,
    replyBody: r.reply_body ?? null,
    replyAuthor: r.reply_author ?? null,
    author: {
      id: r.author_id,
      username: r.author_username || null,
      displayName: r.author_display_name || r.author_username || null,
      avatarUrl: rewriteStorageUrl(r.author_avatar_url) || null,
      isBuilder: Boolean(r.author_is_builder),
    },
  };
}

/** A page of messages, oldest first. `before`: ISO time of the oldest loaded. */
export async function fetchChat({ before = null } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { messages: [], error: null };
  const { data, error } = await supabase.rpc("list_community_chat", { p_before: before, p_limit: CHAT_PAGE });
  if (error) return { messages: [], error };
  return { messages: (data || []).map(mapRow), error: null };
}

export async function sendChat(body, replyTo = null) {
  const supabase = getSupabaseClient();
  if (!supabase) return { id: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc("send_community_chat", { p_body: body, p_reply_to: replyTo });
  return { id: data ?? null, error: error || null };
}

export async function setChatHidden(messageId, hidden) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("admin_set_chat_hidden", { p_message: messageId, p_hidden: Boolean(hidden) });
  return { error: error || null };
}

export async function muteChatUser(userId, hours) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.rpc("admin_mute_chat_user", { p_user: userId, p_hours: hours });
  return { error: error || null };
}

/** Public profile fields for authors a live message brought in. */
export async function fetchAuthors(ids) {
  const supabase = getSupabaseClient();
  if (!supabase || ids.length === 0) return {};
  const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
  return Object.fromEntries(
    (data || []).map((p) => [
      p.id,
      {
        id: p.id,
        username: p.username || null,
        displayName: p.display_name || p.username || null,
        avatarUrl: rewriteStorageUrl(p.avatar_url) || null,
        isBuilder: false,
      },
    ])
  );
}

/** Live new messages (raw rows). Returns an unsubscribe function. */
export function subscribeChat(onInsert) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`community-chat:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_chat_messages" }, (payload) =>
      onInsert?.(payload.new)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** The newest message time (ms) by someone other than `me`, for the unread dot. */
export async function latestChatAt(me) {
  const { messages } = await fetchChat();
  const times = messages.filter((m) => !me || m.author.id !== me).map((m) => Date.parse(m.createdAt) || 0);
  return Math.max(0, ...times);
}
