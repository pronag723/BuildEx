"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/auth/AuthContext";
import { ensureProfile } from "../../../lib/auth/profile";
import { fetchOnboardingState } from "../../../lib/onboarding/api";
import { resolveNextStep, STEP_ORDER } from "../../../lib/onboarding/state";
import { withBase } from "../../home/utils";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { translate } from "../../../lib/i18n/translate.mjs";

/**
 * Client-side gate for the BUILDER onboarding steps.
 *
 * This used to be the router for four different role paths and the landing
 * page for every OAuth round-trip. It is neither any more: sign-in is one
 * click, lands on /auth/callback, and leaves the user wherever they were. The
 * gate now has exactly one job — guard the builder setup steps and resume a
 * half-finished builder signup at the right step.
 *
 * It never redirects a visitor anywhere. A signed-in user with no
 * builder_profiles row who opens a builder step is someone who just started
 * building a profile, so they land on step one and continue.
 *
 * Props:
 *   - expectedStep: the route path of the page using the gate
 *   - allowFutureSteps: when true the gate forwards the user to the step they
 *     actually belong on; when false it only pulls them back from a step they
 *     have not reached yet.
 *   - children: render prop receiving the loaded onboarding state
 */
export default function OnboardingGate({ expectedStep, children, allowFutureSteps = true }) {
  const router = useRouter();
  const { status, user, configured, profile: authProfile, profileLoaded } = useAuth();
  const t = useT();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("loading");

  // Watchdog: if AuthContext's `status` stays on "loading" too long the initial
  // getSession() is hanging. Surface something useful instead of spinning.
  useEffect(() => {
    if (status !== "loading") return undefined;
    const t = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error(
        "[onboarding-gate] auth status stuck on 'loading' — the initial session " +
          "lookup never resolved."
      );
      setError(translate("onboarding.gate.sessionStuck"));
      setPhase("error");
    }, 8000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (!configured) {
      setPhase("unconfigured");
      return;
    }
    if (status === "loading") return;
    if (status === "unauthenticated") {
      // Builder setup is for signed-in users only. Everyone else gets the login
      // screen with this step preserved as the return target.
      router.replace(`/login?redirect=${encodeURIComponent(expectedStep)}`);
      return;
    }

    let cancelled = false;
    // Watchdog: up to 8 s ensureProfile + up to 12 s fetchOnboardingState (each
    // query uses withTimeout(12000)) + 5 s buffer.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.error(
        "[onboarding-gate] profile load timed out — Supabase queries never returned. " +
          "Verify the migrations in supabase/migrations/ have been applied."
      );
      setError(translate("onboarding.gate.timeout"));
      setPhase("error");
    }, 25000);

    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase || !user?.id) {
        if (!cancelled) {
          setError(translate("onboarding.gate.unreachable"));
          setPhase("error");
        }
        return;
      }
      // Guarantee the profiles row exists before any step tries to read or
      // write it. Skipped when AuthContext has already settled one.
      if (!(profileLoaded && authProfile)) {
        await Promise.race([
          ensureProfile(supabase, user),
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ]);
      }

      let result = await fetchOnboardingState(supabase, user.id);
      clearTimeout(watchdog);
      if (cancelled) return;
      if (result.error) {
        // Fall back to AuthContext's already-loaded profile when possible. The
        // profile row is the only piece of state the gate strictly needs;
        // builder_profiles and portfolio_images can be treated as "not started
        // yet" on a transient fetch failure.
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
            ? translate("onboarding.gate.migrationsHint")
            : "";
          setError(
            (result.error.message || translate("onboarding.gate.loadFailed")) + code + hint
          );
          setPhase("error");
          return;
        }
      }
      setState(result);

      // Already a finished builder → nothing to set up. Send them to the
      // profile they came to edit.
      if (result.profile?.onboarding_completed_at) {
        router.replace("/account");
        return;
      }

      const target = resolveNextStep(
        result.profile,
        result.builderProfile,
        result.portfolioCount
      );

      if (!target) {
        router.replace("/account");
        return;
      }

      // A user who clicks "Back" to revisit an earlier step lands here with
      // ?revisit=1. Forward-routing would instantly bounce them away from the
      // step they meant to return to, making Back look broken.
      const intentionalRevisit =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("revisit");

      if (target !== expectedStep) {
        // Let the user move backwards on their own — only forward-route when
        // allowFutureSteps is on, or when they landed on a step ahead of where
        // they actually are.
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
      <div className="card p-6 text-center sm:p-8">
        <h1 className="text-lg font-semibold">{t("auth.callback.notConfiguredTitle")}</h1>
        <p className="mt-2 text-sm text-ink-2">
          {t.rich("onboarding.gate.notConfiguredBody", {
            file: <code className="text-ink">.env.local</code>,
          })}
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="card p-6 text-center sm:p-8">
        <h1 className="text-lg font-semibold">{t("onboarding.gate.errorTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{error}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <a href={withBase("/account")} className="btn btn-primary">
            {t("onboarding.gate.backToAccount")}
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-secondary"
          >
            {t("common.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  if (phase !== "ready" || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
        <p className="mt-4 text-sm text-ink-3">{t("onboarding.gate.loading")}</p>
      </div>
    );
  }

  return children(state);
}
