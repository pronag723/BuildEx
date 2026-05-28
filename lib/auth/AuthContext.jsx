"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../supabase/client";
import { displayInfoFromUser, ensureProfile } from "./profile";
import { withBase } from "../../app/home/utils";

const AuthContext = createContext({
  status: "loading",
  user: null,
  profile: null,
  profileLoaded: false,
  displayUser: null,
  configured: false,
  signInWithDiscord: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refresh: async () => {},
  updateProfile: () => {}
});

function buildOAuthRedirect(redirectPath) {
  if (typeof window === "undefined") return undefined;
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  // OAuth providers send the user straight to /onboarding. The AuthProvider
  // mounted in the root layout creates the Supabase client with
  // `detectSessionInUrl: true`, which auto-exchanges the `?code=` on the URL.
  // The /onboarding gate handles loading, fan-out to the right step, OAuth
  // errors, and post-completion redirect — so no intermediate callback page
  // is needed.
  const search = redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : "";
  return `${window.location.origin}${base}/onboarding${search}`;
}

// ─── Profile cache ───────────────────────────────────────────────────────────
// Profiles change rarely; the user's display_name / username / avatar_url
// flicker noticeably between page loads while loadProfile is in flight,
// because `displayInfoFromUser` falls back to the OAuth provider metadata
// (Discord nickname / Google name / email) when `profile` is null. We
// cache the last-known-good row keyed by user id so the navbar can hydrate
// instantly and a background refresh updates it.
const PROFILE_CACHE_KEY = "buildex-profile-cache";

function readCachedProfile(userId) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userId !== userId) return null;
    return parsed.profile || null;
  } catch {
    return null;
  }
}

function writeCachedProfile(userId, profile) {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (!profile) {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
      return;
    }
    window.localStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ userId, profile })
    );
  } catch {}
}

function clearCachedProfile() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}

export function AuthProvider({ children }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const configured = isSupabaseConfigured;

  const [status, setStatus] = useState(configured ? "loading" : "unconfigured");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // True once loadProfile has settled (even if the result is null).
  // Consumers that need to know "did we finish loading?" use this instead of
  // checking `profile !== null`, which conflates "still loading" with "loaded,
  // but no row exists".
  const [profileLoaded, setProfileLoaded] = useState(false);
  const lastUserIdRef = useRef(null);

  const loadProfile = useCallback(
    async (nextUser) => {
      if (!supabase || !nextUser) {
        setProfile(null);
        setProfileLoaded(true);
        return;
      }
      // Hydrate from cache immediately so consumers (e.g. the navbar and
      // /account) can render the user's CHOSEN display name / handle / avatar /
      // bio / banner without flashing the OAuth provider metadata while we
      // re-fetch.
      const cached = readCachedProfile(nextUser.id);
      if (cached) setProfile(cached);

      // Single attempt, no Promise.race-based timeout. The previous retry
      // loop created duplicate concurrent ensureProfile requests when
      // Supabase was slow — Promise.race only resolves the wait, it doesn't
      // abort the underlying request, so each "retry" piled another query on
      // top of the still-in-flight one. On a cold-start Supabase free-tier
      // project that was enough contention to make every request time out.
      // The localStorage cache already gives an instant first paint, so the
      // background refresh can take as long as it needs to.
      const result = await ensureProfile(supabase, nextUser);
      const row = result?.profile || null;
      // Only overwrite the cache when we have a fresh row — otherwise keep
      // the cached value visible so the navbar doesn't fall back to OAuth
      // metadata. We still flip profileLoaded so consumers that need to
      // distinguish "loaded but no row" from "still loading" can.
      if (row) {
        setProfile(row);
        writeCachedProfile(nextUser.id, row);
      } else if (!cached) {
        setProfile(null);
      }
      setProfileLoaded(true);
    },
    [supabase]
  );

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;

    // After an OAuth round-trip the URL carries `?code=` (or, for the legacy
    // implicit flow, `#access_token=`). The client-side code exchange is
    // async, so `getSession()` resolves null BEFORE Supabase finishes the
    // exchange. If we naively set status="unauthenticated" on that null we
    // race the soon-to-fire SIGNED_IN event and bounce the user to /login
    // even though they're about to be authenticated. While such an exchange
    // is pending we deliberately stay in "loading".
    const hasPendingOAuthExchange =
      typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("code") ||
        /access_token=/.test(window.location.hash || ""));

    // Subscribe first so we never miss the INITIAL_SESSION event the Supabase
    // client fires synchronously after subscription. Auth state is driven
    // exclusively from this stream — there's no separate getSession() race
    // path.
    // The callback MUST stay synchronous (no `await` on Supabase calls).
    // Supabase invokes onAuthStateChange while holding the GoTrue auth lock;
    // any Supabase query awaited in here needs that same (non-reentrant) lock
    // to attach the access token, which deadlocks the query intermittently —
    // the profile fetch then hangs, profileLoaded never flips, and the profile
    // fails to load (worst on reload with a cold cache). So we defer the fetch
    // out of the callback with setTimeout, letting it release the lock first.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const sessionUser = session?.user || null;
      setUser(sessionUser);

      if (!sessionUser) {
        lastUserIdRef.current = null;
        setProfile(null);
        setProfileLoaded(true);
        // The very first INITIAL_SESSION arrives BEFORE Supabase has had a
        // chance to exchange a `?code=` in the URL. If we have one, keep
        // status="loading" and wait for the SIGNED_IN event that follows.
        if (hasPendingOAuthExchange && event === "INITIAL_SESSION") return;
        setStatus("unauthenticated");
        return;
      }

      setStatus("authenticated");
      if (sessionUser.id !== lastUserIdRef.current) {
        // Hydrate the navbar instantly from the cached profile so the user
        // sees their CHOSEN display name / @handle / avatar on first paint,
        // not the OAuth provider's metadata while loadProfile is in flight.
        const cached = readCachedProfile(sessionUser.id);
        if (cached) setProfile(cached);
        lastUserIdRef.current = sessionUser.id;
        setProfileLoaded(false); // reset while loading for the new user
        setTimeout(() => {
          if (active) loadProfile(sessionUser);
        }, 0);
      }
    });

    // Safety net: if neither INITIAL_SESSION nor SIGNED_IN settles in a
    // reasonable window (e.g. the OAuth code is invalid / already redeemed),
    // unstick the UI. Without this, the navbar/account skeletons spin
    // forever while OnboardingGate waits on its own watchdog. When a fresh
    // ?code= is in the URL we give the exchange more headroom — Supabase
    // cold starts and slow networks can push it past the usual budget,
    // and bailing prematurely bounces an actually-logging-in user back to
    // /login.
    const safety = setTimeout(() => {
      if (!active) return;
      setStatus((s) => (s === "loading" ? "unauthenticated" : s));
    }, hasPendingOAuthExchange ? 20000 : 6000);

    return () => {
      active = false;
      clearTimeout(safety);
      sub?.subscription?.unsubscribe();
    };
  }, [supabase, loadProfile]);

  // Re-sync auth state on browser back/forward navigation (alt+arrow).
  //
  // The browser's bfcache may restore the page mid-mount: any in-flight
  // `getSession()` promise from the initial useEffect is cancelled, and React
  // state is frozen to whatever it was at cache time — typically `status:
  // "loading"`. Without this handler the navbar's auth controls stay stuck on
  // their skeleton placeholders and the page appears frozen.
  //
  // - `popstate` fires for in-SPA history navigation (Next.js client back/forward).
  // - `pageshow` covers bfcache restore on full-document back navigation.
  //
  // We must re-run the *whole* session check (user + status), not just
  // `loadProfile`, because `loadProfile` only touches profile state.
  useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;

    async function resync() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setStatus("unauthenticated");
          return;
        }
        const sessionUser = data?.session?.user || null;
        setUser(sessionUser);
        lastUserIdRef.current = sessionUser?.id || null;
        setStatus(sessionUser ? "authenticated" : "unauthenticated");
        if (sessionUser) {
          await loadProfile(sessionUser);
        } else {
          setProfile(null);
          setProfileLoaded(true);
        }
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    }

    function onPopState() {
      resync();
    }
    // `pageshow` fires on every page load. `event.persisted === true` means it
    // came from bfcache — that's the case we actually need to re-sync for.
    function onPageShow(event) {
      if (event.persisted) resync();
    }

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [supabase, loadProfile]);

  const signInWithProvider = useCallback(
    async (provider, opts = {}) => {
      if (!supabase) {
        return { error: { message: "Auth is not configured. Add Supabase keys to .env.local." } };
      }
      const redirectTo = buildOAuthRedirect(opts.redirect || null);
      const scopes = provider === "discord" ? "identify email" : undefined;
      const queryParams = provider === "google" ? { prompt: "select_account" } : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, scopes, queryParams }
      });
      return { error };
    },
    [supabase]
  );

  const signInWithDiscord = useCallback((opts) => signInWithProvider("discord", opts), [signInWithProvider]);
  const signInWithGoogle = useCallback((opts) => signInWithProvider("google", opts), [signInWithProvider]);

  const signOut = useCallback(
    async (redirectTo) => {
      if (!supabase) return;
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setProfileLoaded(false);
      lastUserIdRef.current = null;
      setStatus("unauthenticated");
      // Drop the cached profile so the next user (or the same user re-signing
      // in with different metadata) doesn't briefly see the previous one.
      clearCachedProfile();
      if (typeof window !== "undefined") {
        window.location.href = withBase(redirectTo || "/");
      }
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    await loadProfile(user);
  }, [supabase, user, loadProfile]);

  // Optimistically merge known-good fields into the cached profile. Used right
  // after a successful save (e.g. the user uploads a new avatar) so the navbar
  // and every other consumer reflect the change IMMEDIATELY — without waiting
  // on a re-fetch that can silently time out on a slow/cold Supabase and leave
  // the stale (e.g. provider/Discord) avatar showing. The background refresh
  // still runs and reconciles, but the UI no longer depends on it succeeding.
  const updateProfile = useCallback(
    (patch) => {
      if (!patch || typeof patch !== "object") return;
      setProfile((prev) => {
        const next = { ...(prev || {}), ...patch };
        const id = prev?.id || user?.id;
        if (id) writeCachedProfile(id, next);
        return next;
      });
    },
    [user?.id]
  );

  const displayUser = useMemo(() => displayInfoFromUser(user, profile), [user, profile]);

  const value = useMemo(
    () => ({
      status,
      user,
      profile,
      profileLoaded,
      displayUser,
      configured,
      signInWithDiscord,
      signInWithGoogle,
      signOut,
      refresh,
      updateProfile
    }),
    [status, user, profile, profileLoaded, displayUser, configured, signInWithDiscord, signInWithGoogle, signOut, refresh, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
