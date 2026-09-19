"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Builder signup, step 2 of 3 — how you work.
//
// This was two steps: "Your expertise" (tools, project types, response time,
// availability) and "Your specialties" (styles, build types). Tools, project
// types and build types are no longer asked for at signup — they are optional
// detail a builder fills in later from their account page — and what was left
// was two half-empty screens, so they are one.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import {
  saveBuilderExpertise,
  saveBuilderStyles,
} from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import {
  AVAILABILITY_STATES,
  RESPONSE_TIMES,
  STYLES,
} from "../../../../lib/onboarding/constants";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import ChipGrid from "../../components/ChipGrid";

export default function BuilderExpertisePage() {
  return (
    <OnboardingShell currentStep={STEPS.builderExpertise} maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.builderExpertise}>
        {(state) => <BuilderExpertiseStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function pickResponseForHours(hours) {
  if (hours == null) return null;
  const match =
    RESPONSE_TIMES.find((r) => r.hours >= hours) ||
    RESPONSE_TIMES[RESPONSE_TIMES.length - 1];
  return match?.key || null;
}

function BuilderExpertiseStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const bp = state.builderProfile || {};

  const [specialties, setSpecialties] = useState(
    Array.isArray(bp.specialties) ? bp.specialties : []
  );
  const [responseKey, setResponseKey] = useState(
    pickResponseForHours(bp.response_time_hours)
  );
  const [availability, setAvailability] = useState(
    bp.availability_status || "available"
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const canContinue = specialties.length >= 1 && !!responseKey;

  async function handleContinue() {
    if (!canContinue) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    const responseTimeHours =
      RESPONSE_TIMES.find((r) => r.key === responseKey)?.hours ?? null;
    setError(null);
    setSaving(true);

    // Styles have their own writer. Neither call passes tools, project types or
    // build types, so an existing builder's stored answers are left alone.
    const { error: stylesErr } = await saveBuilderStyles(supabase, user.id, {
      specialties,
    });
    if (stylesErr) {
      setSaving(false);
      setError(stylesErr.message || "Couldn't save. Try again.");
      return;
    }

    const { error: saveErr } = await saveBuilderExpertise(supabase, user.id, {
      responseTimeHours,
      availabilityStatus: availability,
    });
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message || "Couldn't save. Try again.");
      return;
    }
    await refresh?.();
    router.push(STEPS.builderPortfolio);
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">How you work</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          Your styles drive the catalog filters — clients searching for them will find
          you. Everything here is editable later from your account.
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

        {/* Response time */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <div className="onb-label mb-3">Typical response time</div>
          <p className="text-xs text-gray-500 mb-4">
            How fast do clients usually hear back? This is shown on your profile.
          </p>
          <ChipGrid
            options={RESPONSE_TIMES}
            value={responseKey}
            onChange={setResponseKey}
            multi={false}
            ariaLabel="Response time"
          />
        </div>

        {/* Availability */}
        <div className="glass onb-card onb-fade-in onb-fade-in-4">
          <div className="onb-label mb-3">Right now you&apos;re…</div>
          <div className="flex flex-wrap gap-2">
            {AVAILABILITY_STATES.map((opt) => {
              const active = availability === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAvailability(opt.key)}
                  className={`availability-pill ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                >
                  <span
                    className="availability-dot"
                    style={{ background: opt.dot, boxShadow: `0 0 10px ${opt.dot}` }}
                  />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
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
        helper={canContinue ? null : "Pick at least one style and a response time to continue"}
      />
    </div>
  );
}
