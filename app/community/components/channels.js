// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Community channels
//
// The community is laid out like a Discord server: categories of channels.
// A channel is a `?s=` key (the site is a static export, so query params play
// the part of routes); its name, slug and one-line description live in the
// dictionaries under `community.channels.<key>`. Two channels are plain links
// (the rules, the updates thread in chats). The phone rail groups channels
// into "spaces" (home, Showcase, Looking for a builder, Discussions, Mine).
//
// Old links keep working: `?s=discussions` is the all-discussions channel and
// `?s=showcase` the Showcase, exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

export const CHANNELS = {
  rules: { key: "rules", icon: "shield", category: "important", href: "/legal/community" },
  updates: { key: "updates", icon: "verified", category: "important", href: "/chats?c=updates", auth: true },
  showcase: { key: "showcase", icon: "grid", category: "community", space: "showcase", kind: "showcase" },
  requests: { key: "requests", icon: "briefcase", category: "community", space: "requests" },
  questions: { key: "questions", icon: "help", category: "discussions", space: "discussions", kind: "question" },
  guides: { key: "guides", icon: "book", category: "discussions", space: "discussions", kind: "guide" },
  ideas: { key: "ideas", icon: "bulb", category: "discussions", space: "discussions", kind: "idea" },
  discussions: { key: "discussions", icon: "chat", category: "discussions", space: "discussions", kind: null },
  saved: { key: "saved", icon: "bookmark", category: "mine", space: "mine", auth: true },
  mytopics: { key: "mytopics", icon: "pencil", category: "mine", space: "mine", auth: true },
};

// Labels: `community.categories.<key>`.
export const CATEGORIES = [
  { key: "important", channels: ["rules", "updates"] },
  { key: "community", channels: ["showcase", "requests"] },
  { key: "discussions", channels: ["questions", "guides", "ideas", "discussions"] },
  { key: "mine", channels: ["saved", "mytopics"], auth: true },
];

// The phone rail. Labels: `community.spaces.<key>`. `home` lists every
// category; the others list one.
export const SPACES = [
  { key: "home", icon: "home" },
  { key: "showcase", icon: "grid", categories: ["community"], only: ["showcase"] },
  { key: "requests", icon: "briefcase", categories: ["community"], only: ["requests"] },
  { key: "discussions", icon: "chat", categories: ["discussions"] },
  { key: "mine", icon: "user", categories: ["mine"], auth: true },
];

export const DEFAULT_CHANNEL = "showcase";

// Channels whose feed is forum topics (a Showcase post is one of kind
// 'showcase'): a topic (`&t=`) can be open in them.
export function hasTopics(key) {
  const c = CHANNELS[key];
  return Boolean(c) && (c.kind !== undefined || key === "mytopics" || key === "saved");
}

// The channel a topic of this kind belongs to (used by the right column).
export function channelForKind(kind) {
  return Object.values(CHANNELS).find((c) => c.kind === kind)?.key || "discussions";
}

export function channelHref(key, topic = null) {
  const c = CHANNELS[key];
  if (c?.href) return c.href;
  if (!key) return "/community";
  return topic ? `/community?s=${key}&t=${topic}` : `/community?s=${key}`;
}

// Categories with the channels the viewer may see, for one space (or all).
export function categoriesFor(space, signedIn) {
  const spec = SPACES.find((s) => s.key === space) || SPACES[0];
  return CATEGORIES.filter((cat) => (!cat.auth || signedIn) && (!spec.categories || spec.categories.includes(cat.key)))
    .map((cat) => ({
      ...cat,
      channels: cat.channels
        .filter((k) => !CHANNELS[k].auth || signedIn)
        .filter((k) => !spec.only || spec.only.includes(k)),
    }))
    .filter((cat) => cat.channels.length > 0);
}

// `?s=` and `&t=` from the address. channel is null when there is no `?s=`
// (the phone shows its navigation screen, the desktop the default channel).
export function readLocation() {
  if (typeof window === "undefined") return { channel: null, topic: null };
  const params = new URLSearchParams(window.location.search);
  const s = params.get("s");
  const channel = s && CHANNELS[s] && !CHANNELS[s].href ? s : null;
  const topic = params.get("t");
  return { channel, topic: channel && hasTopics(channel) && topic ? topic : null };
}

// ─── Collapsed categories (a per-viewer convenience, kept in localStorage) ──

const COLLAPSED_KEY = "buildex-community-collapsed";

function readCollapsed() {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function useCollapsedCategories() {
  const [collapsed, setCollapsed] = useState([]);
  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);
  const toggle = useCallback((key) => {
    setCollapsed((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // no storage: the choice lasts for this visit only
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}

// ─── Desktop or phone ────────────────────────────────────────────────────────

// Whether a media query matches: true / false, or null until mounted.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return matches;
}

// ≥1024px (Tailwind's `lg`): the sidebar + channel layout instead of the
// phone's two screens.
export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}
