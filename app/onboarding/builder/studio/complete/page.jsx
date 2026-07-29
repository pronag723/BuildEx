"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../../lib/auth/AuthContext";
import {
  navigateAfterOnboarding,
  runOnboardingCompletion,
} from "../../../../../lib/onboarding/completion";
import { completePendingEmployeeRegistration } from "../../../../../lib/studios/api";
import { STEPS } from "../../../../../lib/onboarding/state";
import OnboardingShell from "../../../components/OnboardingShell";
import OnboardingGate from "../../../components/OnboardingGate";
import OnboardingFooter from "../../../components/OnboardingFooter";

export default function StudioEmployeeCompletePage() {
  return (
    <OnboardingShell currentStep={STEPS.builderStudioComplete} role="builder" hideStepHeader maxWidth="max-w-2xl">
      <OnboardingGate expectedStep={STEPS.builderStudioComplete}>
        {() => <StudioEmployeeComplete />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function StudioEmployeeComplete() {
  const router = useRouter();
  const { updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function finish() {
    setSaving(true);
    setError(null);
    const result = await runOnboardingCompletion(() =>
      completePendingEmployeeRegistration()
    );
    if (result.error) {
      setSaving(false);
      setError(result.error.message || "Couldn't join the studio. Try again.");
      return;
    }
    navigateAfterOnboarding({ router, updateProfile });
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="onb-section-title">Ready to join your studio?</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          Your studio profile now includes the builder details you provided.
        </p>
      </div>
      <div className="glass onb-card text-sm text-gray-300 leading-relaxed">
        Studio employees receive assignments through their studio. Your skills,
        styles, tools, and response time help the studio match you to the right
        projects. Client pricing is managed by your studio, and a personal
        portfolio is not required.
        {error && <div role="alert" className="auth-banner auth-banner-error mt-5">{error}</div>}
      </div>
      <OnboardingFooter
        onBack={() => router.push(`${STEPS.builderIdentity}?revisit=1`)}
        onNext={finish}
        isSaving={saving}
        nextLabel="Finish registration"
        helper="You can update your profile details later; a portfolio is never required."
      />
    </div>
  );
}
