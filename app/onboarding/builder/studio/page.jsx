"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { chooseIndependentBuilderPath } from "../../../../lib/onboarding/api";
import {
  completeEmployeeRegistration,
  validateEmployeeCode,
} from "../../../../lib/studios/api";
import { STEPS } from "../../../../lib/onboarding/state";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import AvatarUploader from "../../components/AvatarUploader";

const INPUT =
  "w-full px-4 py-3 rounded-2xl bg-black/25 border border-white/10 text-sm outline-none focus:border-[#4ade80]/60 focus:ring-2 focus:ring-[#4ade80]/15";

export default function BuilderStudioChoicePage() {
  return (
    <OnboardingShell currentStep={STEPS.builderStudio} role="builder" maxWidth="max-w-2xl">
      <OnboardingGate expectedStep={STEPS.builderStudio}>
        {() => <BuilderStudioChoice />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderStudioChoice() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [studio, setStudio] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function validateCode() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const result = await validateEmployeeCode(code.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "That employee code is not valid.");
      return;
    }
    setStudio(result.studio);
  }

  async function skipStudio() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setBusy(true);
    setError(null);
    const { error: saveError } = await chooseIndependentBuilderPath(supabase, user.id);
    setBusy(false);
    if (saveError) {
      setError(saveError.message || "Couldn't save your choice.");
      return;
    }
    await refresh?.();
    router.push(STEPS.builderIdentity);
  }

  async function finishEmployee() {
    if (!studio || !displayName.trim() || !username.trim() || !avatarUrl) return;
    setBusy(true);
    setError(null);
    const result = await completeEmployeeRegistration({
      code: code.trim(),
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      avatarUrl,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't join the studio.");
      return;
    }
    await refresh?.();
    router.push(STEPS.complete);
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="onb-section-title">Are you joining a studio?</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          Enter the employee code from your studio moderator, or skip this step
          to create a full independent builder profile.
        </p>
      </div>

      <div className="glass onb-card space-y-5">
        {!studio ? (
          <>
            <label className="block">
              <span className="onb-label block mb-2">Studio employee code</span>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className={INPUT}
                  placeholder="Enter your studio code"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={validateCode}
                  disabled={busy || code.trim().length < 6}
                  className="px-5 rounded-2xl bg-[#4ade80] text-black text-sm font-bold disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </label>
            <button
              type="button"
              onClick={skipStudio}
              disabled={busy}
              className="w-full py-3 rounded-2xl border border-white/10 text-sm text-gray-300 hover:border-[#4ade80]/40 hover:bg-white/5"
            >
              I&apos;m an independent builder — skip
            </button>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-[#4ade80]/30 bg-[#4ade80]/10 p-4">
              <p className="text-xs uppercase tracking-widest text-[#4ade80]">Joining studio</p>
              <p className="font-bold mt-1">{studio.name}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <AvatarUploader
                userId={user?.id}
                value={avatarUrl}
                onChange={setAvatarUrl}
                onError={setError}
                fallbackInitial={(displayName || "B")[0]}
              />
              <div className="flex-1 w-full space-y-4">
                <label className="block">
                  <span className="onb-label block mb-2">Nickname</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className={INPUT}
                    maxLength={32}
                    placeholder="How the studio knows you"
                  />
                </label>
                <label className="block">
                  <span className="onb-label block mb-2">Username</span>
                  <input
                    value={username}
                    onChange={(event) =>
                      setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                    }
                    className={INPUT}
                    maxLength={24}
                    placeholder="minecraft_builder"
                  />
                </label>
              </div>
            </div>
          </>
        )}

        {error && <div className="auth-banner auth-banner-error">{error}</div>}
      </div>

      {studio && (
        <OnboardingFooter
          onBack={() => setStudio(null)}
          onNext={finishEmployee}
          nextDisabled={
            busy ||
            displayName.trim().length < 2 ||
            username.trim().length < 3 ||
            !avatarUrl
          }
          isSaving={busy}
          nextLabel="Join studio"
          helper="Employees are private and do not create a public portfolio."
        />
      )}
    </div>
  );
}
