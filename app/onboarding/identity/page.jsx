"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/auth/AuthContext";
import { saveIdentity } from "../../../lib/onboarding/api";
import { STEPS } from "../../../lib/onboarding/state";
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
} from "../../../lib/onboarding/constants";
import { withBase } from "../../home/utils";
import OnboardingShell from "../components/OnboardingShell";
import OnboardingGate from "../components/OnboardingGate";
import OnboardingFooter from "../components/OnboardingFooter";
import HandleInput from "../components/HandleInput";

export default function IdentityPage() {
  return (
    <OnboardingShell currentStep={STEPS.identity} role={null} maxWidth="max-w-xl">
      <OnboardingGate expectedStep={STEPS.identity}>
        {(state) => <IdentityStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function IdentityStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const role = state.profile?.role;

  const [displayName, setDisplayName] = useState(state.profile?.display_name || "");
  const [handle, setHandle] = useState(state.profile?.username || "");
  const [handleValid, setHandleValid] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Smart default: if the user hasn't typed a handle yet, derive one from
  // their display name so they don't have to think about it.
  useEffect(() => {
    if (handle) return;
    const seed = String(displayName || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "")
      .slice(0, 24);
    if (seed.length >= 3) setHandle(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const trimmedName = displayName.trim();
  const nameValid =
    trimmedName.length >= DISPLAY_NAME_MIN && trimmedName.length <= DISPLAY_NAME_MAX;
  const canContinue = nameValid && handleValid && !!handle;

  async function handleContinue() {
    if (!canContinue) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setError(null);
    setSaving(true);
    const { error: saveError } = await saveIdentity(supabase, user.id, {
      displayName: trimmedName,
      handle,
    });
    setSaving(false);
    if (saveError) {
      // Common case: handle stolen between the check and the save
      if (saveError.code === "23505" || /duplicate|unique/i.test(saveError.message || "")) {
        setError("That handle was just taken. Try another one.");
        setHandleValid(false);
      } else {
        setError(saveError.message || "Couldn't save your identity. Try again.");
      }
      return;
    }
    await refresh?.();
    const next =
      role === "client"
        ? STEPS.clientProfile
        : role === "builder" || role === "both"
        ? STEPS.builderIdentity
        : STEPS.role;
    router.push(next);
  }

  return (
    <div>
      <div className="text-center mb-10 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Make it yours</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          A name people see and a unique handle for your profile, mentions and DMs.
        </p>
      </div>

      <div className="glass onb-card onb-fade-in onb-fade-in-2 space-y-7">
        {/* Display name */}
        <div>
          <label htmlFor="displayName" className="onb-label block mb-2">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
            placeholder="Pixel Forge Studio"
            className={`onb-input ${
              displayName && !nameValid ? "is-error" : nameValid ? "is-success" : ""
            }`}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="off"
          />
          <div className="mt-2 flex items-start justify-between text-xs">
            <p className="text-gray-500 leading-snug">
              Shown on your profile, in chats and on builds.
            </p>
            <span className="text-gray-500">
              {trimmedName.length}/{DISPLAY_NAME_MAX}
            </span>
          </div>
        </div>

        {/* Handle */}
        <HandleInput
          value={handle}
          onChange={setHandle}
          currentUserId={user?.id}
          onValidityChange={setHandleValid}
        />

        {/* Live preview card */}
        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl overflow-hidden bg-[#4ade80]/15 border border-[#4ade80]/40 flex items-center justify-center text-[#4ade80] font-bold">
            {trimmedName.charAt(0).toUpperCase() || "B"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {trimmedName || "Your display name"}
            </div>
            <div className="text-xs text-gray-400 truncate">
              @{handle || "yourhandle"} ·{" "}
              <span className="text-[#4ade80]">
                {role === "builder" ? "Builder" : role === "client" ? "Client" : "Builder & client"}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="auth-banner auth-banner-error">
            {error}
          </div>
        )}
      </div>

      <OnboardingFooter
        onBack={() => router.push(`${STEPS.role}?revisit=1`)}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
      />
    </div>
  );
}
