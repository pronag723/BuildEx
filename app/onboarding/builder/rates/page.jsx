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
  RATE_TIERS,
  RateEditor,
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
          Give clients a price range for each build scale based on its block area. These show as
          estimated ranges — final quotes always stay negotiable, and you can change them anytime.
        </p>
      </div>

      <div className="glass onb-card onb-fade-in onb-fade-in-2 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {RATE_TIERS.map((tier) => (
            <RateEditor
              key={tier.key}
              tier={tier}
              value={rates[tier.key]}
              onChange={(v) => setRates((prev) => ({ ...prev, [tier.key]: v }))}
            />
          ))}
        </div>

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
        helper={canContinue ? null : "Fill in a block area and price range for each build scale"}
      />
    </div>
  );
}
