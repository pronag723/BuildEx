"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Builder signup, step 2 of 3 — the styles you build in.
//
// This screen used to also ask for tools, project types, response time and
// availability. None of those are collected any more; the columns keep their
// old values and simply stop being read. Styles stay because they are what the
// /builders catalog filters on.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { saveBuilderStyles } from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import { STYLES } from "../../../../lib/onboarding/constants";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import ChipGrid from "../../components/ChipGrid";
import { useT } from "../../../../lib/i18n/LanguageProvider";

export default function BuilderStylesPage() {
  return (
    <OnboardingShell currentStep={STEPS.builderStyles} maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.builderStyles}>
        {(state) => <BuilderStylesStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderStylesStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const t = useT();
  const bp = state.builderProfile || {};

  const [specialties, setSpecialties] = useState(
    Array.isArray(bp.specialties) ? bp.specialties : []
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const canContinue = specialties.length >= 1;

  async function handleContinue() {
    if (!canContinue) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setError(null);
    setSaving(true);

    // No `buildTypes` here on purpose — an existing builder's stored list is
    // left exactly as it is.
    const { error: saveErr } = await saveBuilderStyles(supabase, user.id, {
      specialties,
    });
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message || t("onboarding.errors.saveFailed"));
      return;
    }
    await refresh?.();
    router.push(STEPS.builderPortfolio);
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">{t("onboarding.styles.title")}</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          {t("onboarding.styles.subtitle")}
        </p>
      </div>

      <div className="space-y-6">
        <div className="glass onb-card onb-fade-in onb-fade-in-2">
          <div className="flex items-baseline justify-between mb-3">
            <div className="onb-label">{t("onboarding.styles.label")}</div>
            <span className="text-[11px] text-gray-500">
              {t("onboarding.styles.selected", { count: specialties.length })}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            {t("onboarding.styles.hint")}
          </p>
          <ChipGrid
            options={STYLES.map((s) => ({ ...s, label: t(`styles.${s.key}`) }))}
            value={specialties}
            onChange={setSpecialties}
            multi
            ariaLabel={t("onboarding.styles.label")}
          />
        </div>

        {error && (
          <div role="alert" className="auth-banner auth-banner-error">
            {error}
          </div>
        )}
      </div>

      <OnboardingFooter
        onBack={() => router.push(`${STEPS.builderIdentity}?revisit=1`)}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
        helper={canContinue ? null : t("onboarding.styles.helper")}
      />
    </div>
  );
}
