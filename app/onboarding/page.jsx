"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";
import { useAuth } from "../../lib/auth/AuthContext";
import { saveRole } from "../../lib/onboarding/api";
import { STEPS } from "../../lib/onboarding/state";
import { withBase } from "../home/utils";
import OnboardingShell from "./components/OnboardingShell";
import OnboardingGate from "./components/OnboardingGate";
import OnboardingFooter from "./components/OnboardingFooter";
import RoleCard from "./components/RoleCard";

const BUILDER_ICON = "🧱";
const CLIENT_ICON = "🎯";

export default function OnboardingRolePage() {
  return (
    <OnboardingShell currentStep={STEPS.role} role={null}>
      <OnboardingGate expectedStep={STEPS.role}>
        {(state) => <RoleStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function RoleStep({ state }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [selected, setSelected] = useState(state.profile?.role || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleContinue() {
    if (!selected) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setError(null);
    setSaving(true);
    const { error: saveError } = await saveRole(supabase, user.id, selected);
    setSaving(false);
    if (saveError) {
      setError(saveError.message || "Couldn't save your choice. Try again.");
      return;
    }
    await refresh?.();
    router.push(STEPS.identity);
  }

  return (
    <div>
      <div className="text-center mb-6 lg:mb-7 onb-fade-in onb-fade-in-1">
        <span className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full text-xs mb-4">
          <span className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" />
          <span>Let&apos;s get you set up</span>
        </span>
        <h1 className="onb-section-title">What brings you to BuildEx?</h1>
        <p className="onb-section-sub mt-2 mx-auto">
          Pick the role that fits you today. You can always add the other one later.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 sm:gap-5 auto-rows-fr">
        <div className="onb-fade-in onb-fade-in-2 h-full">
          <RoleCard
            role="builder"
            title="I'm a Builder"
            description="I create Minecraft builds and want to showcase my portfolio and work with clients."
            icon={BUILDER_ICON}
            bullets={[
              "Public profile + portfolio at @yourhandle",
              "Get matched with paid commissions",
              "Show your styles, build types, and availability",
            ]}
            selected={selected === "builder"}
            onSelect={() => setSelected("builder")}
          />
        </div>
        <div className="onb-fade-in onb-fade-in-3 h-full">
          <RoleCard
            role="client"
            title="I'm a Client"
            description="I'm looking for talented builders for my Minecraft server or project."
            icon={CLIENT_ICON}
            bullets={[
              "Browse vetted builders across every style",
              "Save favorites, message, and request quotes",
              "Track every commission in one place",
            ]}
            selected={selected === "client"}
            onSelect={() => setSelected("client")}
          />
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-gray-500">
        Looking to do both?{" "}
        <button
          type="button"
          onClick={() => setSelected("both")}
          className={`underline-offset-2 transition-colors ${
            selected === "both"
              ? "text-[#4ade80] underline"
              : "text-gray-400 hover:text-white hover:underline"
          }`}
        >
          Set me up as builder &amp; client
        </button>
      </p>

      {error && (
        <div role="alert" className="auth-banner auth-banner-error mt-6">
          {error}
        </div>
      )}

      <OnboardingFooter
        onNext={handleContinue}
        nextDisabled={!selected}
        isSaving={saving}
        nextLabel="Continue"
        helper={selected ? `Continuing as ${selected}` : "Pick a role to continue"}
      />
    </div>
  );
}
