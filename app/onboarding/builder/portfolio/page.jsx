"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { markOnboardingComplete } from "../../../../lib/onboarding/api";
import {
  navigateAfterOnboarding,
  runOnboardingCompletion,
} from "../../../../lib/onboarding/completion";
import { STEPS } from "../../../../lib/onboarding/state";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import PortfolioUploader from "../../components/PortfolioUploader";
import { useT } from "../../../../lib/i18n/LanguageProvider";

export default function BuilderPortfolioPage() {
  return (
    <OnboardingShell currentStep={STEPS.builderPortfolio} maxWidth="max-w-4xl">
      <OnboardingGate expectedStep={STEPS.builderPortfolio}>
        {(state) => <BuilderPortfolioStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderPortfolioStep({ state }) {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const t = useT();

  const [count, setCount] = useState(state.portfolioCount || 0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const canFinish = count >= 1;

  async function handleFinish() {
    if (!canFinish) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setError(null);
    setSaving(true);
    const { error: doneErr } = await runOnboardingCompletion(() =>
      markOnboardingComplete(supabase, user.id)
    );
    if (doneErr) {
      setSaving(false);
      setError(doneErr.message || t("onboarding.errors.finalizeFailed"));
      return;
    }
    navigateAfterOnboarding({ router, updateProfile });
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">{t("onboarding.portfolio.title")}</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          {t("onboarding.portfolio.subtitle")}
        </p>
      </div>

      <div className="glass onb-card onb-fade-in onb-fade-in-2">
        <PortfolioUploader
          userId={user?.id}
          onCountChange={setCount}
          onError={setError}
        />

        {error && (
          <div role="alert" className="auth-banner auth-banner-error mt-6">
            {error}
          </div>
        )}
      </div>

      <OnboardingFooter
        onBack={() => router.push(`${STEPS.builderStyles}?revisit=1`)}
        onNext={handleFinish}
        nextDisabled={!canFinish}
        isSaving={saving}
        nextLabel={t("onboarding.portfolio.finish")}
        helper={
          canFinish
            ? t("onboarding.portfolio.ready", { count })
            : t("onboarding.portfolio.helper")
        }
      />
    </div>
  );
}
