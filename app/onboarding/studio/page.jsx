"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import {
  completeStudioRegistration,
  validateModeratorCode,
} from "../../../lib/studios/api";
import { STEPS } from "../../../lib/onboarding/state";
import OnboardingShell from "../components/OnboardingShell";
import OnboardingGate from "../components/OnboardingGate";
import OnboardingFooter from "../components/OnboardingFooter";
import AvatarUploader from "../components/AvatarUploader";
import PortfolioUploader from "../components/PortfolioUploader";
import {
  RatesEditor,
  mergeRates,
  normalizeRates,
  validateRates,
} from "../components/RatesFields";

const INPUT =
  "w-full px-4 py-3 rounded-2xl bg-black/25 border border-white/10 text-sm outline-none focus:border-[#4ade80]/60 focus:ring-2 focus:ring-[#4ade80]/15";

export default function StudioOnboardingPage() {
  return (
    <OnboardingShell currentStep={STEPS.studioSetup} role="studio" maxWidth="max-w-4xl">
      <OnboardingGate expectedStep={STEPS.studioSetup}>
        {() => <StudioOnboarding />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function StudioOnboarding() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [step, setStep] = useState("code");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [rates, setRates] = useState(() => mergeRates(null));
  const [portfolioCount, setPortfolioCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function checkCode() {
    setBusy(true);
    setError(null);
    const result = await validateModeratorCode(code.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "That moderator code is not valid.");
      return;
    }
    setStep("identity");
  }

  function nextFromIdentity() {
    if (name.trim().length < 2 || username.trim().length < 3 || !avatarUrl) return;
    setStep("rates");
  }

  function nextFromRates() {
    const validation = validateRates(rates);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setStep("portfolio");
  }

  async function finish() {
    if (portfolioCount < 1) return;
    setBusy(true);
    setError(null);
    const result = await completeStudioRegistration({
      code: code.trim(),
      name: name.trim(),
      username: username.trim().toLowerCase(),
      avatarUrl,
      rates: normalizeRates(rates),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't create the studio.");
      return;
    }
    await refresh?.();
    router.push(STEPS.complete);
  }

  const titles = {
    code: ["Verify your studio", "Enter the moderator-only code created by BuildEx."],
    identity: ["Create the studio identity", "This is what buyers will see in the catalog and chat."],
    rates: ["Set studio prices", "Studios accept every style; only size-based prices are required."],
    portfolio: ["Build the studio portfolio", "Upload at least one representative build."],
  };

  return (
    <div>
      <div className="text-center mb-8">
        <p className="text-xs text-[#4ade80] uppercase tracking-[0.2em] mb-3">
          Studio setup · {["code", "identity", "rates", "portfolio"].indexOf(step) + 1}/4
        </p>
        <h1 className="onb-section-title">{titles[step][0]}</h1>
        <p className="onb-section-sub mt-3 mx-auto">{titles[step][1]}</p>
      </div>

      <div className="glass onb-card">
        {step === "code" && (
          <label className="block max-w-xl mx-auto">
            <span className="onb-label block mb-2">Studio moderator code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={INPUT}
              placeholder="Enter the code from BuildEx"
              autoComplete="off"
            />
          </label>
        )}

        {step === "identity" && (
          <div className="flex flex-col sm:flex-row gap-7 items-center sm:items-start">
            <AvatarUploader
              userId={user?.id}
              value={avatarUrl}
              onChange={setAvatarUrl}
              onError={setError}
              fallbackInitial={(name || "S")[0]}
            />
            <div className="flex-1 w-full space-y-4">
              <label className="block">
                <span className="onb-label block mb-2">Public studio name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={INPUT}
                  maxLength={80}
                  placeholder="Aurora Build Team"
                />
              </label>
              <label className="block">
                <span className="onb-label block mb-2">Studio username</span>
                <input
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  className={INPUT}
                  maxLength={24}
                  placeholder="aurora_builds"
                />
              </label>
            </div>
          </div>
        )}

        {step === "rates" && <RatesEditor rates={rates} onChange={setRates} />}

        {step === "portfolio" && (
          <PortfolioUploader
            userId={user?.id}
            onCountChange={setPortfolioCount}
            onError={setError}
          />
        )}

        {error && <div className="auth-banner auth-banner-error mt-5">{error}</div>}
      </div>

      <OnboardingFooter
        onBack={
          step === "code"
            ? () => router.push(`${STEPS.role}?revisit=1`)
            : () =>
                setStep(
                  step === "identity" ? "code" : step === "rates" ? "identity" : "rates"
                )
        }
        onNext={
          step === "code"
            ? checkCode
            : step === "identity"
              ? nextFromIdentity
              : step === "rates"
                ? nextFromRates
                : finish
        }
        nextDisabled={
          busy ||
          (step === "code" && code.trim().length < 6) ||
          (step === "identity" &&
            (name.trim().length < 2 || username.trim().length < 3 || !avatarUrl)) ||
          (step === "rates" && Boolean(validateRates(rates))) ||
          (step === "portfolio" && portfolioCount < 1)
        }
        isSaving={busy}
        nextLabel={step === "portfolio" ? "Create studio" : "Continue"}
      />
    </div>
  );
}
