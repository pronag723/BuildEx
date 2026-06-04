"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — In-app notifications data layer
// Thin wrappers over the public.notifications table + Realtime added in
// migration 0016_notifications.sql. Mirrors lib/chat/api.js: every function
// tolerates a missing/offline Supabase by resolving to an empty result instead
// of throwing. Inserts happen server-side inside the order/review/dispute RPCs
// (via _notify); the client only ever reads its own rows and marks them read.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// The signed-in user's most recent notifications, newest first. RLS guarantees
// only the caller's own rows come back. Returns { notifications, error }.
export async function listNotifications(limit = 30) {
  const supabase = getSupabaseClient();
  if (!supabase) return { notifications: [], error: null };

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { notifications: [], error };
  return { notifications: data || [], error: null };
}

// Mark a single notification read. No-op if already read. Returns { error }.
export async function markNotificationRead(id) {
  const supabase = getSupabaseClient();
  if (!supabase || !id) return { error: null };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);

  return { error: error || null };
}

// Mark every unread notification read in one round-trip. Returns { error }.
export async function markAllNotificationsRead() {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: null };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  return { error: error || null };
}

// Subscribe to the caller's incoming notifications. Realtime enforces RLS, so
// this only fires for the user's own rows. `onChange` receives the new row.
// Returns an unsubscribe function. Mirrors subscribeToInbox in lib/chat/api.js.
export function subscribeToNotifications(onChange) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  // Unique topic per subscriber so multiple listeners on one client don't
  // clobber each other (same reasoning as subscribeToInbox).
  const channel = supabase
    .channel(`notifications:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => onChange?.(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
