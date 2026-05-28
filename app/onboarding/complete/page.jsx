"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/auth/AuthContext";
import { fetchOnboardingState } from "../../../lib/onboarding/api";
import { withBase } from "../../home/utils";
import OnboardingShell from "../components/OnboardingShell";
import { STEPS } from "../../../lib/onboarding/state";

export default function OnboardingCompletePage() {
  const router = useRouter();
  const { status, user, configured, displayUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);

  // Fetch the now-final profile so the celebration can show the user's name
  // even before AuthContext refreshes its cached row.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!configured) return;
      if (status !== "authenticated" || !user?.id) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { profile: row } = await fetchOnboardingState(supabase, user.id);
      if (cancelled) return;
      setProfile(row);
      setRole(row?.role || null);
      // If they landed here without completing onboarding for some reason,
      // bounce them back to the start of the flow.
      if (row && !row.onboarding_completed_at) {
        router.replace(withBase(STEPS.role));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [status, user?.id, configured, router]);

  const handle = profile?.username || displayUser?.username;
  const name = profile?.display_name || displayUser?.displayName || "Builder";

  return (
    <OnboardingShell currentStep={STEPS.complete} role={role} hideStepHeader maxWidth="max-w-xl">
      <div className="glass rounded-3xl p-10 sm:p-14 border border-white/10 text-center relative overflow-hidden onb-fade-in onb-fade-in-1">
        {/* Subtle radial flourish */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, rgba(74,222,128,0.25), transparent 60%)",
          }}
        />

        {/* Big check mark */}
        <div
          className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center bg-[#4ade80] text-black"
          style={{
            boxShadow:
              "0 0 0 8px rgba(74,222,128,0.15), 0 0 32px rgba(74,222,128,0.45)",
          }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full text-xs mb-4">
          <span className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" />
          <span>You&apos;re all set</span>
        </div>

        <h1 className="onb-section-title">Welcome to BuildEx, {name}.</h1>
        <p className="onb-section-sub mt-4 mx-auto">
          {role === "client"
            ? "Your client profile is live. Browse builders, save your favorites, and reach out when you're ready."
            : role === "both"
            ? "Your profile is live as both a builder and a client. Start posting work and exploring the catalog."
            : "Your builder profile is live and discoverable. Share your handle, take on commissions, and watch your rank climb."}
        </p>

        {handle && (
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04]">
            <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
            <span className="text-sm">
              Your handle:&nbsp;
              <span className="text-[#4ade80] font-semibold">@{handle}</span>
            </span>
          </div>
        )}

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          {role === "client" ? (
            <a
              href={withBase("/builders")}
              className="onb-btn-primary justify-center"
            >
              Browse builders
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </a>
          ) : (
            <a
              href={withBase("/account")}
              className="onb-btn-primary justify-center"
            >
              Go to my profile
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </a>
          )}
          <a
            href={withBase("/")}
            className="onb-btn-ghost justify-center"
          >
            Back to BuildEx home
          </a>
        </div>

        <p className="mt-8 text-xs text-gray-500">
          You can always edit your profile, portfolio and availability from your account.
        </p>
      </div>
    </OnboardingShell>
  );
}
