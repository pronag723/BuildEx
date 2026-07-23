"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/auth/AuthContext";
import { ensureProfile } from "../../../lib/auth/profile";
import { fetchOnboardingState } from "../../../lib/onboarding/api";
import { resolveNextStep, STEPS } from "../../../lib/onboarding/state";
import { sanitizeRedirect } from "../../../lib/auth/redirects";
import { withBase } from "../../home/utils";

const POST_LOGIN_REDIRECT_KEY = "buildex-post-login-redirect";

// `/onboarding` is the OAuth redirect target. On first mount we capture any
// `?redirect=` parameter (the page the user was trying to reach before logging
// in) into sessionStorage so it survives in-app navigation through the
// onboarding flow. After onboarding finishes we send them there.
function readAndPersistRedirect() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("redirect");
  if (fromUrl) {
    const safe = sanitizeRedirect(fromUrl);
    try {
      window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, safe);
    } catch {}
    return safe;
  }
  try {
    return window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  } catch {
    return null;
  }
}

function consumePersistedRedirect() {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return v && v !== "/" ? sanitizeRedirect(v) : null;
  } catch {
    return null;
  }
}

// OAuth providers append `?error=…&error_description=…` when sign-in fails.
// We bounce to `/login` with those params preserved — the existing AuthCard
// error banner already renders them nicely.
function detectOAuthErrorRedirect() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const errKey = params.get("error");
  const errDesc = params.get("error_description");
  if (!errKey && !errDesc) return null;
  const qs = new URLSearchParams();
  if (errDesc) qs.set("error_description", errDesc);
  if (errKey) qs.set("error", errKey);
  return `/login?${qs.toString()}`;
}

/**
 * Client-side gate used by every onboarding step page.
 *
 * Fetches the user's profile + builder profile + portfolio count, decides what
 * step they should be on, and either:
 *   - renders the page content (with `state` injected) if they're on the right step
 *   - redirects them to the correct step otherwise.
 *
 * Props:
 *   - expectedStep: the route path of the page using the gate
 *   - allowFutureSteps: when true (used by the root page) the gate forwards
 *     the user forward through the flow; when false it'll also forward
 *     completed users back out to /account.
 *   - children: render prop receiving the loaded onboarding state
 */
export default function OnboardingGate({ expectedStep, children, allowFutureSteps = true }) {
  const router = useRouter();
  const { status, user, configured, profile: authProfile, profileLoaded } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("loading");

  // Separate watchdog: if the AuthContext's `status` stays on "loading" too
  // long, the code exchange or initial getSession() is hanging. Most common
  // cause: a stale `?code=` that's already been redeemed (page was refreshed).
  // Surface a sensible error instead of spinning indefinitely.
  //
  // When a fresh ?code= is in the URL, the wait is the OAuth exchange itself,
  // which can legitimately take 10–15 s on a Supabase cold start. Firing the
  // watchdog at 8 s in that case shows a scary "Sign-in didn't finish" error
  // even though sign-in IS finishing — the effect just re-renders once the
  // exchange completes a moment later. Give it real headroom in that case.
  useEffect(() => {
    if (status !== "loading") return undefined;
    const hasFreshOAuthCode =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("code");
    const timeoutMs = hasFreshOAuthCode ? 20000 : 8000;
    const t = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error(
        "[onboarding-gate] auth status stuck on 'loading' — the OAuth code " +
          "exchange or initial session lookup never resolved. If `?code=` is " +
          "still in the URL, the code may have already been redeemed; sign in " +
          "again from /login."
      );
      setError(
        "Sign-in didn't finish. If you refreshed this page, the one-time login code in the URL is no longer valid — please sign in again."
      );
      setPhase("error");
    }, timeoutMs);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    // OAuth error in the URL? Punt to /login where the error UI lives.
    const errorRedirect = detectOAuthErrorRedirect();
    if (errorRedirect) {
      router.replace(errorRedirect);
      return;
    }

    // Capture (or recall) the page the user was trying to reach before signing in.
    readAndPersistRedirect();

    if (!configured) {
      setPhase("unconfigured");
      return;
    }
    if (status === "loading") {
      // eslint-disable-next-line no-console
      console.debug("[onboarding-gate] waiting for auth status to settle");
      return;
    }
    if (status === "unauthenticated") {
      router.replace("/login?redirect=/onboarding");
      return;
    }

    let cancelled = false;
    // Watchdog: if the profile load isn't done in time, surface a useful
    // error instead of spinning forever. The most common cause is missing SQL
    // migrations in Supabase (new columns / tables not created).
    // Budget: up to 8 s ensureProfile + up to 12 s fetchOnboardingState (each
    // query uses withTimeout(12000)) + 5 s buffer = 25 s total — tuned to
    // tolerate Supabase free-tier cold starts.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.error(
        "[onboarding-gate] profile load timed out — Supabase queries never returned. " +
          "Verify the migrations in supabase/migrations/ have been applied."
      );
      setError(
        "Couldn't load your profile in time. The most likely cause is that the database migrations haven't been applied to Supabase yet — see supabase/migrations/README.md."
      );
      setPhase("error");
    }, 25000);

    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase || !user?.id) {
        if (!cancelled) {
          setError("Couldn't reach BuildEx. Try refreshing in a moment.");
          setPhase("error");
        }
        return;
      }
      // Guarantee the profiles row exists before any step tries to read or write
      // it. This recovers from the case where the auth-time insert failed (e.g.
      // the Supabase project was paused when the user first signed up) so the
      // user landed in auth.users but never got a profiles row.
      //
      // Skip the duplicate SELECT/INSERT if AuthContext has already settled
      // a profile row for this user — that's the common case and saves
      // ~1 round trip on every onboarding-gate mount.
      if (!(profileLoaded && authProfile)) {
        // eslint-disable-next-line no-console
        console.debug("[onboarding-gate] ensuring profile row for", user.id);
        await Promise.race([
          ensureProfile(supabase, user),
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ]);
      } else {
        // eslint-disable-next-line no-console
        console.debug("[onboarding-gate] reusing AuthContext profile row");
      }

      // eslint-disable-next-line no-console
      console.debug("[onboarding-gate] fetching onboarding state for", user.id);
      let result = await fetchOnboardingState(supabase, user.id);
      clearTimeout(watchdog);
      if (cancelled) return;
      if (result.error) {
        // Fall back to AuthContext's already-loaded profile when possible.
        // The profile row is the only piece of state the gate strictly needs
        // to route the user; builder_profiles and portfolio_images are only
        // used to pick a deeper step in the flow and can be treated as
        // "not started yet" on a transient fetch failure. This keeps
        // onboarding-completed users from getting stuck on a scary error
        // page just because one of the three parallel queries hiccupped.
        //
        // When we *can* recover, log at warn level (informational); only
        // escalate to error when we have no fallback. Print as a plain
        // enumerable copy so DevTools shows the code/message rather than
        // `{}` (Error properties are non-enumerable).
        if (authProfile) {
          // eslint-disable-next-line no-console
          console.warn(
            "[onboarding-gate] fetchOnboardingState failed; using cached profile:",
            { ...result.error }
          );
          result = {
            profile: authProfile,
            builderProfile: null,
            portfolioCount: 0,
            error: null,
          };
        } else {
          // eslint-disable-next-line no-console
          console.error("[onboarding-gate] fetchOnboardingState error:", {
            ...result.error,
          });
          const code = result.error.code ? ` (${result.error.code})` : "";
          const hint = /column .* does not exist|relation .* does not exist/i.test(
            result.error.message || ""
          )
            ? " — looks like the SQL migrations in supabase/migrations/ haven't been applied to Supabase yet."
            : "";
          setError(
            (result.error.message || "Couldn't load your profile.") + code + hint
          );
          setPhase("error");
          return;
        }
      }
      // eslint-disable-next-line no-console
      console.debug("[onboarding-gate] loaded:", {
        hasProfile: !!result.profile,
        role: result.profile?.role,
        completed: !!result.profile?.onboarding_completed_at,
        hasBuilderProfile: !!result.builderProfile,
        portfolioCount: result.portfolioCount,
      });
      setState(result);

      // Completed onboarding → honor original redirect target (if any),
      // otherwise drop them onto their profile.
      if (result.profile?.onboarding_completed_at) {
        const target = consumePersistedRedirect() || "/account";
        router.replace(target);
        return;
      }

      const target = resolveNextStep(
        result.profile,
        result.builderProfile,
        result.portfolioCount
      );

      // If onboarding is fully complete (resolveNextStep returns null after we
      // already short-circuited above, but just in case)
      if (!target) {
        router.replace("/account");
        return;
      }

      // A user who clicks "Back" to revisit an earlier step lands here with
      // ?revisit=1. The root /onboarding gate keeps allowFutureSteps=true so a
      // fresh OAuth login fans out to the user's current step — but that same
      // forwarding would instantly bounce a back-navigating user away from the
      // step they meant to return to, making the Back button look broken.
      const intentionalRevisit =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("revisit");

      if (target !== expectedStep) {
        // Allow user to navigate backwards on their own — only forward-route
        // when allowFutureSteps is on (used by /onboarding root) OR they
        // landed on a step ahead of where they actually are.
        const expectedIdx = STEP_ORDER.indexOf(expectedStep);
        const targetIdx = STEP_ORDER.indexOf(target);
        const forwardRoute = allowFutureSteps && !intentionalRevisit;
        if (forwardRoute || targetIdx < expectedIdx) {
          router.replace(target);
          return;
        }
      }

      setPhase("ready");
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, [status, user?.id, configured, router, expectedStep, allowFutureSteps, profileLoaded, authProfile]);

  if (phase === "unconfigured") {
    return (
      <div className="glass rounded-3xl p-8 sm:p-10 border border-white/10 text-center">
        <div className="text-xl font-semibold mb-2">Authentication not configured</div>
        <p className="text-gray-400 text-sm">
          Add Supabase keys to <code className="text-[#4ade80]">.env.local</code> to enable onboarding.
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="glass rounded-3xl p-8 sm:p-10 border border-red-400/30 text-center">
        <div className="w-12 h-12 mx-auto mb-5 rounded-2xl bg-red-500/15 border border-red-400/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="text-xl font-semibold mb-2">We hit a snag</div>
        <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">{error}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={withBase("/login")}
            className="inline-block px-6 py-3 bg-[#4ade80] text-black font-semibold rounded-full green-glow hover:scale-105 transition-all"
          >
            Back to login
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="onb-btn-ghost justify-center"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (phase !== "ready" || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        <p className="mt-4 text-sm text-gray-500">Loading your profile…</p>
      </div>
    );
  }

  return children(state);
}

// Order used to decide whether to forward-route or let the user revisit a step.
const STEP_ORDER = [
  STEPS.role,
  STEPS.clientProfile,
  STEPS.studioSetup,
  STEPS.builderStudio,
  STEPS.builderIdentity,
  STEPS.builderExpertise,
  STEPS.builderStyles,
  STEPS.builderRates,
  STEPS.builderPortfolio,
  STEPS.complete,
];
