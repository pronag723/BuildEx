"use client";

import { useCallback, useState } from "react";
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
import WorksManager, { isCompleteWork } from "../../components/WorksManager";
import PriceTiersEditor from "../../components/PriceTiersEditor";
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

  // Complete works — a title and at least one photo. One is enough to finish.
  const [count, setCount] = useState(0);
  const onWorksChange = useCallback((works) => setCount(works.filter(isCompleteWork).length), []);
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
      <div className="mb-6">
        <h1 className="onb-section-title">{t("onboarding.portfolio.title")}</h1>
        <p className="onb-section-sub mt-2">
          {t("onboarding.portfolio.subtitle")}
        </p>
      </div>

      <div className="onb-card">
        <WorksManager userId={user?.id} onChange={onWorksChange} />

        {error && (
          <div role="alert" className="auth-banner auth-banner-error mt-6">
            {error}
          </div>
        )}
      </div>

      <div className="onb-card mt-6">
        <h2 className="text-base font-semibold">{t("onboarding.works.pricesTitle")}</h2>
        <p className="mb-4 mt-1 text-sm text-ink-3">{t("onboarding.works.pricesSubtitle")}</p>
        <PriceTiersEditor userId={user?.id} />
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
