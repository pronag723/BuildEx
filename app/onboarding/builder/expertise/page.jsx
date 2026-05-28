"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { saveBuilderExpertise } from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import {
  AVAILABILITY_STATES,
  BUILDER_TOOLS,
  PROJECT_TYPES,
  RESPONSE_TIMES,
} from "../../../../lib/onboarding/constants";
import { withBase } from "../../../home/utils";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import ChipGrid from "../../components/ChipGrid";

export default function BuilderExpertisePage() {
  return (
    <OnboardingShell currentStep={STEPS.builderExpertise} role="builder" maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.builderExpertise}>
        {(state) => <BuilderExpertiseStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function pickResponseForHours(hours) {
  if (hours == null) return null;
  const match = RESPONSE_TIMES.find((r) => r.hours >= hours) || RESPONSE_TIMES[RESPONSE_TIMES.length - 1];
  return match?.key || null;
}

function BuilderExpertiseStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const bp = state.builderProfile || {};

  const [tools, setTools] = useState(Array.isArray(bp.tools) ? bp.tools : []);
  const [projectTypes, setProjectTypes] = useState(
    Array.isArray(bp.project_types) ? bp.project_types : []
  );
  const [responseKey, setResponseKey] = useState(pickResponseForHours(bp.response_time_hours));
  const [availability, setAvailability] = useState(bp.availability_status || "available");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const canContinue = tools.length >= 1 && !!responseKey;

  async function handleContinue() {
    if (!canContinue) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    const responseTimeHours = RESPONSE_TIMES.find((r) => r.key === responseKey)?.hours ?? null;
    setError(null);
    setSaving(true);
    const { error: saveErr } = await saveBuilderExpertise(supabase, user.id, {
      tools,
      projectTypes,
      responseTimeHours,
      availabilityStatus: availability,
    });
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message || "Couldn't save. Try again.");
      return;
    }
    await refresh?.();
    router.push(withBase(STEPS.builderStyles));
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Your expertise</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          Tell clients how you work. These signals power matching, sort order and rank progression.
        </p>
      </div>

      <div className="space-y-6">
        {/* Tools */}
        <div className="glass onb-card onb-fade-in onb-fade-in-2">
          <div className="onb-label mb-3">Which tools do you build with?</div>
          <p className="text-xs text-gray-500 mb-4">
            Pick everything in your kit — this shows up as &ldquo;Tools used&rdquo; on your profile.
          </p>
          <ChipGrid
            options={BUILDER_TOOLS}
            value={tools}
            onChange={setTools}
            multi
            ariaLabel="Tools used"
          />
        </div>

        {/* Project types */}
        <div className="glass onb-card onb-fade-in onb-fade-in-2">
          <div className="onb-label mb-3">What kind of work are you open to?</div>
          <p className="text-xs text-gray-500 mb-4">Pick as many as you want.</p>
          <ChipGrid
            options={PROJECT_TYPES}
            value={projectTypes}
            onChange={setProjectTypes}
            multi
            ariaLabel="Project types"
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
        onBack={() => router.push(`${withBase(STEPS.builderIdentity)}?revisit=1`)}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
        helper={canContinue ? null : "Pick at least one tool and a response time to continue"}
      />
    </div>
  );
}
