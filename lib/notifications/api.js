"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — In-app notifications data layer
// Thin wrappers over the public.notifications table + Realtime added in
// migration 0016_notifications.sql. Mirrors lib/chat/api.js: every function
// tolerates a missing/offline Supabase by resolving to an empty result instead
// of throwing.
//
// The feed carries ONE kind of notification now: a new chat message, written by
// the messages trigger in migration 0100. Every other type ('paid', 'delivered',
// 'review', 'disputed', …) came from the order lifecycle, which is gone.
//
// Those old rows are still in the table and still belong to their owners — this
// module simply scopes every query to type = 'message', so the bell shows what
// is live and "Clear all" clears what the user can actually see. Nothing reaches
// back and deletes history the user never asked to lose.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// The only notification type with a living producer. Every query below filters
// on it, so a decommissioned order notification can never surface in the bell.
const NOTIFICATION_TYPE = "message";

// The signed-in user's most recent notifications, newest first. RLS guarantees
// only the caller's own rows come back. Returns { notifications, error }.
export async function listNotifications(limit = 30) {
  const supabase = getSupabaseClient();
  if (!supabase) return { notifications: [], error: null };

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("type", NOTIFICATION_TYPE)
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
    .eq("type", NOTIFICATION_TYPE)
    .is("read_at", null);

  return { error: error || null };
}

// Delete the caller's message notifications ("Clear all"). RLS + the owner-delete
// policy in migration 0017 guarantee a user can only ever remove their own rows;
// the type filter is also what keeps Supabase from rejecting an unfiltered
// DELETE, and keeps dormant order history out of it. Returns { error }.
export async function clearNotifications() {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: null };

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("type", NOTIFICATION_TYPE);

  return { error: error || null };
}

// Subscribe to the caller's notifications. Realtime enforces RLS, so this only
// fires for the user's own rows. `onChange` receives the row.
//
// INSERT *and* UPDATE, because the 0100 trigger folds a burst of messages in one
// thread into a single row: the second message UPDATEs the unread notification
// rather than stacking a new one, and an INSERT-only listener would leave the
// dropdown showing the first message until the next refresh. UPDATE also carries
// a read in another tab, which correctly drops the row out of the list here.
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
      { event: "*", schema: "public", table: "notifications" },
      (payload) => {
        if (payload.new?.type !== NOTIFICATION_TYPE) return;
        onChange?.(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
