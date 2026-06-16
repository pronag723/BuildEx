"use client";

import { useState } from "react";
import { useThemedBackground } from "../../auth/components/useThemedBackground";
import { useAuth } from "../../../lib/auth/AuthContext";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { cancelOnboarding } from "../../../lib/onboarding/api";
import { withBase } from "../../home/utils";
import StepHeader from "./StepHeader";
import { Icon } from "../../../lib/icons";
import BxLogo from "../../home/components/BxLogo";

/**
 * Shared shell for every onboarding step.
 *
 * - Renders the animated themed gradient + edge glow (matches login/landing).
 * - Pinned top header with logo + theme toggle + step indicator.
 * - Centered max-width content area.
 *
 * Auth + routing is handled by `<OnboardingGate>` (rendered as a child).
 * Putting the redirect logic in only one place avoids a race where two
 * `router.replace` calls fight each other and the wrong one wins.
 */
export default function OnboardingShell({
  currentStep,    // string path, e.g. "/onboarding/identity"
  role,           // current role from profile (may be null on step 1)
  children,
  hideStepHeader = false,
  maxWidth = "max-w-3xl",
}) {
  const { gradientRef, edgeGlowRef, isLight, setTheme } = useThemedBackground();
  const { user, profile, signOut } = useAuth();
  const [cancelling, setCancelling] = useState(false);

  // Leaving onboarding for the homepage (the logo) counts as abandoning the
  // registration. signOut discards the half-created account (gated server-side
  // on onboarding_completed_at) and lands the user on home. A completed user who
  // somehow reaches the shell just navigates home normally.
  async function handleLeaveToHome(e) {
    if (profile && profile.onboarding_completed_at) return; // let the link proceed
    e.preventDefault();
    if (cancelling) return;
    setCancelling(true);
    if (signOut) {
      await signOut("/");
    } else if (typeof window !== "undefined") {
      window.location.href = withBase("/");
    }
  }

  async function handleCancel() {
    if (cancelling) return;
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(
        "Cancel registration? Everything you've entered will be discarded and you'll be signed out."
      );
    if (!confirmed) return;

    setCancelling(true);
    const supabase = getSupabaseClient();
    if (supabase && user?.id) {
      await cancelOnboarding(supabase, user.id);
    }
    if (signOut) {
      await signOut("/");
    } else if (typeof window !== "undefined") {
      window.location.href = withBase("/");
    }
  }

  return (
    <div className="onboarding-root">
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

      <header className="fixed top-3.5 left-1/2 -translate-x-1/2 z-50 w-full nav-wrapper px-6">
        <div className="glass nav-pill flex items-center justify-between shadow-2xl">
          <a href={withBase("/")} onClick={handleLeaveToHome} className="flex items-center gap-1.5 no-underline">
            <BxLogo className="w-11 h-11 flex-shrink-0" />
            <span className="text-2xl font-bold tracking-tight logo-font nav-logo-text">
              Build<span className="text-[#4ade80] font-extrabold">Ex</span>
            </span>
          </a>

          <div className="flex items-center nav-controls-gap flex-shrink-0">
            <button
              type="button"
              className="theme-switch relative w-14 h-7 flex items-center rounded-full transition-all duration-300 bg-white/10 border border-white/20 hover:border-white/40 flex-shrink-0"
              aria-label="Toggle color theme"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            >
              <span className="theme-switch-thumb absolute left-1 w-5 h-5 rounded-full bg-[#0f172a] shadow-lg transition-all duration-300 flex items-center justify-center">
                <Icon name={isLight ? "sun" : "moon"} size={12} strokeWidth={2} />
              </span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="nav-btn-ghost nav-btn-text font-medium rounded-full border border-white/20 hover:border-white/40 transition-all ghost-btn whitespace-nowrap disabled:opacity-60"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-screen flex flex-col items-center px-4 sm:px-6 pt-24 sm:pt-28 pb-16">
        <div className={`w-full ${maxWidth}`}>
          {!hideStepHeader && (
            <StepHeader currentStep={currentStep} role={role} />
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
