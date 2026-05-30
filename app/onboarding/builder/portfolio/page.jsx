"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { markOnboardingComplete } from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import { withBase } from "../../../home/utils";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import PortfolioUploader from "../../components/PortfolioUploader";

export default function BuilderPortfolioPage() {
  return (
    <OnboardingShell currentStep={STEPS.builderPortfolio} role="builder" maxWidth="max-w-4xl">
      <OnboardingGate expectedStep={STEPS.builderPortfolio}>
        {(state) => <BuilderPortfolioStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderPortfolioStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();

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
    const { error: doneErr } = await markOnboardingComplete(supabase, user.id);
    setSaving(false);
    if (doneErr) {
      setError(doneErr.message || "Couldn't finalize. Try again.");
      return;
    }
    await refresh?.();
    router.push(STEPS.complete);
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Show your work</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          Drag in your best builds. The first image becomes your cover. You can keep adding,
          reordering, and refining your portfolio later from your dashboard.
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
        onBack={() => router.push(`${STEPS.builderRates}?revisit=1`)}
        onNext={handleFinish}
        nextDisabled={!canFinish}
        isSaving={saving}
        nextLabel="Finish setup"
        helper={
          canFinish
            ? `${count} image${count === 1 ? "" : "s"} ready · you can add more later`
            : "Upload at least one image to finish"
        }
      />
    </div>
  );
}
