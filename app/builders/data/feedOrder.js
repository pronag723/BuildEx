// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Catalog feed ordering
//
// The /builders catalog defaults to a *randomised* order so every builder gets
// equal exposure instead of being ranked by registration date (which always
// buried experienced builders who joined early). The one rule: the order must
// stay put when a visitor opens a builder's profile and comes back — otherwise
// the list would reshuffle out from under them.
//
// Mechanism — a per-visit seed plus a "keep order" flag, both in sessionStorage:
//   • <RouteTracker> watches navigation. Opening a builder profile sets the
//     keep-order flag; navigating to any page that isn't the feed or a profile
//     clears it (that ends the round-trip — the next feed visit is fresh).
//   • When the catalog mounts it resolves a seed: if the keep-order flag is set
//     (we came back from a profile) it reuses the stored seed → identical order;
//     otherwise it rolls a fresh seed → a new order.
//
// resolveFeedSeed() is deliberately idempotent — it never clears the flag — so
// it survives React StrictMode's dev double-mount and any incidental remount.
// Clearing is RouteTracker's job, driven purely by where the visitor goes.
// sessionStorage (rather than module memory) keeps this correct regardless of
// React render/effect ordering and survives a profile-page reload, while still
// resetting between browser sessions.
// ─────────────────────────────────────────────────────────────────────────────

const KEEP_KEY = "buildex:feed-keep-order";
const SEED_KEY = "buildex:feed-seed";
const FEED_PATH = "/builders";
const PROFILE_PREFIX = "/builders/profile";

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
// Tiny, fast, deterministic 32-bit generator. Same seed ⇒ same sequence.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates shuffle driven by the seeded PRNG. Pure — returns a new array
// and never mutates the input.
export function seededShuffle(list, seed) {
  const arr = (list || []).slice();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ── Navigation tracking (sets/clears the keep-order flag) ───────────────────
// Called by <RouteTracker> on every navigation. `pathname` is basePath-relative
// (what next/navigation's usePathname returns) and may carry a trailing slash.
export function recordNav(pathname) {
  if (typeof pathname !== "string") return;
  try {
    if (pathname.startsWith(PROFILE_PREFIX)) {
      // Visitor is on a builder profile — if they head back to the feed, keep
      // the current order.
      sessionStorage.setItem(KEEP_KEY, "1");
    } else if (pathname === FEED_PATH || pathname === FEED_PATH + "/") {
      // The feed itself — leave the flag alone; the catalog consumes it on mount.
    } else {
      // Any other destination ends the profile round-trip; next feed visit is
      // fresh and should reshuffle.
      sessionStorage.removeItem(KEEP_KEY);
    }
  } catch {
    /* sessionStorage unavailable — fall back to reshuffling each mount. */
  }
}

// ── Per-visit seed ──────────────────────────────────────────────────────────
function randomSeed() {
  // A 32-bit unsigned seed. Prefer crypto for a good spread; Math.random is a
  // perfectly adequate fallback for "shuffle a list".
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

// Resolve the seed for the current catalog mount. Reuses the stored seed when
// the keep-order flag is set (returning from a profile); otherwise rolls a new
// one. Persists the seed but never touches the flag (see note above). Call once
// per mount, e.g. from a useState initializer.
export function resolveFeedSeed() {
  let keep = false;
  let stored = null;
  try {
    keep = sessionStorage.getItem(KEEP_KEY) === "1";
    const raw = sessionStorage.getItem(SEED_KEY);
    if (raw !== null) stored = Number(raw);
  } catch {
    /* ignore — treated as a fresh visit below */
  }

  const seed =
    keep && stored !== null && Number.isFinite(stored) ? stored : randomSeed();

  try {
    sessionStorage.setItem(SEED_KEY, String(seed));
  } catch {
    /* ignore */
  }

  return seed;
}
