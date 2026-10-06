"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/auth/AuthContext";
import { fetchOnboardingState } from "../../../lib/onboarding/api";
import { withBase } from "../../home/utils";
import OnboardingShell from "../components/OnboardingShell";
import { STEPS } from "../../../lib/onboarding/state";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";

export default function OnboardingCompletePage() {
  const router = useRouter();
  const { status, user, configured, displayUser } = useAuth();
  const t = useT();
  const [profile, setProfile] = useState(null);

  // Fetch the now-final profile so the celebration can show the user's name
  // even before AuthContext refreshes its cached row.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!configured) return;
      if (status !== "authenticated" || !user?.id) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { profile: row } = await fetchOnboardingState(supabase, user.id);
      if (cancelled) return;
      setProfile(row);
      // If they landed here without finishing builder setup for some reason,
      // bounce them back to the start of the flow.
      if (row && !row.onboarding_completed_at) {
        router.replace(STEPS.builderIdentity);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [status, user?.id, configured, router]);

  const handle = profile?.username || displayUser?.username;
  const name = profile?.display_name || displayUser?.displayName || t("onboarding.complete.fallbackName");

  return (
    <OnboardingShell currentStep={STEPS.complete} hideStepHeader maxWidth="max-w-lg">
      <div className="card p-6 sm:p-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent-ink" aria-hidden="true">
          <Icon name="check" size={20} strokeWidth={2.5} />
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">
          {t("onboarding.complete.title", { name })}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {t("onboarding.complete.subtitle")}
        </p>

        {handle && (
          <p className="mt-4 text-sm text-ink-2">
            {t("onboarding.complete.handle")}{" "}
            <span className="font-medium text-ink">@{handle}</span>
          </p>
        )}

        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          <a href={withBase("/account")} className="btn btn-primary btn-lg">
            {t("onboarding.complete.goToProfile")}
          </a>
          <a href={withBase("/")} className="btn btn-secondary btn-lg">
            {t("onboarding.complete.backHome")}
          </a>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-ink-3">
          {t("onboarding.complete.manage")}
        </p>
      </div>
    </OnboardingShell>
  );
}
