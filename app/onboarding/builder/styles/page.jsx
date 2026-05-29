"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { saveBuilderStyles } from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import { BUILD_TYPES, STYLES } from "../../../../lib/onboarding/constants";
import { withBase } from "../../../home/utils";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import ChipGrid from "../../components/ChipGrid";

export default function BuilderStylesPage() {
  return (
    <OnboardingShell currentStep={STEPS.builderStyles} role="builder" maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.builderStyles}>
        {(state) => <BuilderStylesStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderStylesStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const bp = state.builderProfile || {};

  const [specialties, setSpecialties] = useState(
    Array.isArray(bp.specialties) ? bp.specialties : []
  );
  const [buildTypes, setBuildTypes] = useState(
    Array.isArray(bp.build_types) ? bp.build_types : []
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const canContinue = specialties.length >= 1 && buildTypes.length >= 1;

  async function handleContinue() {
    if (!canContinue) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setError(null);
    setSaving(true);
    const { error: saveErr } = await saveBuilderStyles(supabase, user.id, {
      specialties,
      buildTypes,
    });
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message || "Couldn't save. Try again.");
      return;
    }
    await refresh?.();
    router.push(withBase(STEPS.builderRates));
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Your specialties</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          These connect directly to the BuildEx catalog filters — clients searching for these
          styles and build types will find you.
        </p>
      </div>

      <div className="space-y-6">
        {/* Styles */}
        <div className="glass onb-card onb-fade-in onb-fade-in-2">
          <div className="flex items-baseline justify-between mb-3">
            <div className="onb-label">Building styles</div>
            <span className="text-[11px] text-gray-500">
              {specialties.length} selected
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Pick everything you&apos;re great at. At least one is required.
          </p>
          <ChipGrid
            options={STYLES}
            value={specialties}
            onChange={setSpecialties}
            multi
            ariaLabel="Building styles"
          />
        </div>

        {/* Build types */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <div className="flex items-baseline justify-between mb-3">
            <div className="onb-label">Build types</div>
            <span className="text-[11px] text-gray-500">
              {buildTypes.length} selected
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            What kinds of builds do you take on?
          </p>
          <ChipGrid
            options={BUILD_TYPES}
            value={buildTypes}
            onChange={setBuildTypes}
            multi
            ariaLabel="Build types"
          />
        </div>

        {error && (
          <div role="alert" className="auth-banner auth-banner-error">
            {error}
          </div>
        )}
      </div>

      <OnboardingFooter
        onBack={() => router.push(`${withBase(STEPS.builderExpertise)}?revisit=1`)}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
        helper={canContinue ? null : "Pick at least one style and one build type"}
      />
    </div>
  );
}
