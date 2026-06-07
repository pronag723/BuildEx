"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { saveBuilderRates } from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import { withBase } from "../../../home/utils";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import {
  RatesEditor,
  mergeRates,
  normalizeRates,
  validateRates,
} from "../../components/RatesFields";

export default function BuilderRatesPage() {
  return (
    <OnboardingShell currentStep={STEPS.builderRates} role="builder" maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.builderRates}>
        {(state) => <BuilderRatesStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderRatesStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const bp = state.builderProfile || {};

  const [rates, setRates] = useState(() => mergeRates(bp.rates));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const validationError = validateRates(rates);
  const canContinue = !validationError;

  async function handleContinue() {
    if (!canContinue) {
      setError(validationError);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setError(null);
    setSaving(true);
    const { error: saveErr } = await saveBuilderRates(supabase, user.id, normalizeRates(rates));
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message || "Couldn't save your rates. Try again.");
      return;
    }
    await refresh?.();
    router.push(STEPS.builderPortfolio);
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Set your rates</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          Set an exact price for each build scale. Toggle off any sizes you don&apos;t offer — you can
          change this anytime from your account settings.
        </p>
      </div>

      <div className="glass onb-card onb-fade-in onb-fade-in-2 space-y-4">
        <RatesEditor rates={rates} onChange={setRates} />

        {error && (
          <div role="alert" className="auth-banner auth-banner-error">
            {error}
          </div>
        )}
      </div>

      <OnboardingFooter
        onBack={() => router.push(`${STEPS.builderStyles}?revisit=1`)}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
        helper={canContinue ? null : "Enable at least one size and fill in a block area and price"}
      />
    </div>
  );
}
