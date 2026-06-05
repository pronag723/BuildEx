"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Presence (real online/offline)
// A lightweight heartbeat stamps profiles.last_seen_at while a signed-in user
// has the tab open (wired from AuthContext). Viewers then derive a real online
// indicator from that timestamp instead of the old fake "availability ===
// available" mirror. Owner-scoped by RLS (profiles UPDATE policy auth.uid() =
// id), so the client writes its own row directly — no RPC needed, same pattern
// as lib/favorites/api.js. Requires migration 0019_presence.sql.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// A user counts as "online" if their last heartbeat landed within this window.
// The heartbeat fires every 60s, so a 5-minute window comfortably absorbs a few
// missed pings (tab briefly backgrounded, a slow request) without flickering.
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// True when `lastSeenAt` (an ISO string / Date / null from profiles.last_seen_at)
// falls inside the online window. Null / unparseable / stale all read as offline.
export function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}

// Stamp profiles.last_seen_at = now() for the signed-in user. `userId` is the
// caller's own profile id (the RLS UPDATE policy scopes the write to auth.uid()
// = id). Tolerates a missing/offline Supabase by no-opping, and never throws —
// a failed heartbeat just means the user reads as offline a little sooner.
export async function touchPresence(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { error: null };

  const { error } = await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);

  return { error: error || null };
}
