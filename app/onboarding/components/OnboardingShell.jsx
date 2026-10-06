"use client";

import { useState } from "react";
import { useAuth } from "../../../lib/auth/AuthContext";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { cancelOnboarding } from "../../../lib/onboarding/api";
import { withBase } from "../../home/utils";
import StepHeader from "./StepHeader";
import SiteHeader from "../../components/SiteHeader";
import ThemeToggle from "../../components/ThemeToggle";
import { useT } from "../../../lib/i18n/LanguageProvider";
import LanguageSwitcher from "../../../lib/i18n/LanguageSwitcher";

/**
 * Shared shell for every onboarding step: the site header (with Cancel in
 * place of navigation) and a centred column with the step indicator.
 *
 * Auth + routing is handled by `<OnboardingGate>` (rendered as a child).
 * Putting the redirect logic in only one place avoids a race where two
 * `router.replace` calls fight each other and the wrong one wins.
 */
export default function OnboardingShell({
  currentStep,    // string path, e.g. "/onboarding/builder/identity"
  children,
  hideStepHeader = false,
  maxWidth = "max-w-2xl",
}) {
  const t = useT();
  const { user, profile, refresh } = useAuth();
  const [cancelling, setCancelling] = useState(false);

  // Backing out of builder setup is no longer the same thing as abandoning an
  // account. The user signed in with one click and already has a real, usable
  // profile — leaving here only discards the half-built BUILDER profile and
  // returns them to their account page, still signed in.
  async function handleCancel() {
    if (cancelling) return;
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(t("onboarding.shell.cancelConfirm"));
    if (!confirmed) return;

    setCancelling(true);
    const supabase = getSupabaseClient();
    if (supabase && user?.id) {
      await cancelOnboarding(supabase, user.id, profile?.role || null);
    }
    refresh?.();
    if (typeof window !== "undefined") {
      window.location.href = withBase("/account");
    }
  }

  const actions = (
    <>
      <LanguageSwitcher />
      <ThemeToggle />
      <button
        type="button"
        onClick={handleCancel}
        disabled={cancelling}
        className="btn btn-ghost btn-sm"
      >
        {cancelling ? t("onboarding.shell.cancelling") : t("common.cancel")}
      </button>
    </>
  );

  return (
    <div className="min-h-[100dvh]">
      <SiteHeader actions={actions} />
      <main className="flex flex-col items-center px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className={`w-full ${maxWidth}`}>
          {!hideStepHeader && <StepHeader currentStep={currentStep} />}
          {children}
        </div>
      </main>
    </div>
  );
}
