"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Community: per-channel unread dots
//
// A per-viewer convenience: when this viewer last opened each channel is kept
// in localStorage, and a channel gets a dot when its newest item (by someone
// else) is newer than that. On a first visit everything counts as seen, so a
// newcomer is not greeted by a wall of dots. Without localStorage (private
// mode, blocked storage) there are simply no dots.
//
// "All discussions" has no clock of its own: it is unread when any of
// questions / guides / ideas is, and opening it marks all three seen.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { categoriesFor } from "./channels";

const KEY = "buildex-community-seen";
// Channels that make up "all discussions" (its dot lights when any of them does).
const KINDS = { questions: "question", guides: "guide", ideas: "idea", team: "team" };
// Other topic channels with their own clock.
const OTHER_KINDS = { contests: "contest" };
// Pinned items sort first in every list, so a few rows are read and the
// newest of them taken.
const PEEK = 6;

export const UnreadContext = createContext({ unread: new Set() });

export function useUnread() {
  return useContext(UnreadContext).unread;
}

// Whether any channel the viewer can see in a phone space is unread.
export function spaceHasUnread(space, signedIn, unread) {
  if (!unread || unread.size === 0) return false;
  return categoriesFor(space, signedIn).some((cat) => cat.channels.some((k) => unread.has(k)));
}

function readStore() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && typeof data === "object" && typeof data.base === "string") {
      return { base: data.base, seen: data.seen && typeof data.seen === "object" ? data.seen : {} };
    }
    const fresh = { base: new Date().toISOString(), seen: {} };
    window.localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return null;
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // no storage: the dots simply stay off
  }
}

// Timestamps are compared as numbers: Postgres writes "+00:00" and
// microseconds, the browser "Z", so the strings do not sort together.
const ms = (iso) => {
  const n = Date.parse(iso || "");
  return Number.isFinite(n) ? n : 0;
};

// Milliseconds of the newest row not written by `me`, or 0.
const newest = (rows, me) =>
  Math.max(0, ...(rows || []).filter((r) => r && (!me || r.author_id !== me)).map((r) => ms(r.created_at)));

// The newest item by someone else in each channel that has a clock.
async function fetchLatest(me) {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  const rpc = (name, args) => supabase.rpc(name, args).then(({ data, error }) => (error ? [] : data || []));
  const topicChannels = { ...KINDS, ...OTHER_KINDS };
  const [chat, showcase, requests, library, ...topics] = await Promise.all([
    rpc("list_community_chat", { p_before: null, p_limit: PEEK }),
    rpc("list_showcase_posts", { p_sort: "new", p_style: null, p_scope: "all", p_limit: PEEK, p_offset: 0 }),
    rpc("list_public_briefs", { p_status: "open", p_type: null, p_mine: false, p_limit: 1, p_offset: 0 }),
    rpc("list_library_items", { p_sort: "new", p_scope: "all", p_limit: PEEK, p_offset: 0 }),
    ...Object.values(topicChannels).map((kind) =>
      rpc("list_forum_topics", { p_kind: kind, p_sort: "new", p_scope: "all", p_limit: PEEK, p_offset: 0 })
    ),
  ]);
  const out = {
    showcase: newest(showcase, me),
    requests: newest(requests.filter((b) => !b.is_mine), null),
    library: newest(library, me),
    chat: newest(chat, me),
  };
  Object.keys(topicChannels).forEach((key, i) => {
    out[key] = newest(topics[i], me);
  });
  return out;
}

/**
 * The unread set for the shell. `channel` is the open channel (null on the
 * phone's navigation screen); it is marked seen when opened and again when
 * left, so items that arrive while it is open do not light it up afterwards.
 */
export function useChannelUnread(channel, me, ready) {
  const [store, setStore] = useState(null);
  const [latest, setLatest] = useState({});

  useEffect(() => {
    setStore(readStore());
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    fetchLatest(me).then((data) => {
      if (!cancelled) setLatest(data);
    });
    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  const mark = useCallback((key) => {
    const keys = key === "discussions" ? Object.keys(KINDS) : [key];
    setStore((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const next = { ...prev, seen: { ...prev.seen } };
      keys.forEach((k) => {
        next.seen[k] = now;
      });
      writeStore(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!channel) return undefined;
    mark(channel);
    return () => mark(channel);
  }, [channel, mark]);

  const unread = useMemo(() => {
    const set = new Set();
    if (!store) return set;
    for (const [key, at] of Object.entries(latest)) {
      if (at > ms(store.seen[key] || store.base) && key !== channel) set.add(key);
    }
    if (Object.keys(KINDS).some((k) => set.has(k)) && channel !== "discussions") set.add("discussions");
    return set;
  }, [store, latest, channel]);

  return unread;
}
