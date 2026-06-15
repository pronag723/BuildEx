"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/auth/AuthContext";
import {
  markOnboardingComplete,
  saveClientProfile,
} from "../../../lib/onboarding/api";
import { STEPS } from "../../../lib/onboarding/state";
import { Icon } from "../../../lib/icons";
import {
  BIO_MAX,
  CLIENT_INTEREST_STYLES,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  SERVER_TYPES,
} from "../../../lib/onboarding/constants";
import { withBase } from "../../home/utils";
import OnboardingShell from "../components/OnboardingShell";
import OnboardingGate from "../components/OnboardingGate";
import OnboardingFooter from "../components/OnboardingFooter";
import AvatarUploader from "../components/AvatarUploader";
import ChipGrid from "../components/ChipGrid";
import HandleInput from "../components/HandleInput";

export default function ClientProfilePage() {
  return (
    <OnboardingShell currentStep={STEPS.clientProfile} role="client" maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.clientProfile}>
        {(state) => <ClientProfileStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function ClientProfileStep({ state }) {
  const router = useRouter();
  const { user, refresh, updateProfile } = useAuth();
  const p = state.profile || {};

  const [displayName, setDisplayName] = useState(p.display_name || "");
  const [handle, setHandle] = useState(p.username || "");
  const [handleValid, setHandleValid] = useState(Boolean(p.username));
  const [avatarUrl, setAvatarUrl] = useState(p.avatar_url || null);
  // Banner/background is no longer collected during onboarding. We still read
  // and pass through any previously stored value so a re-save doesn't wipe it.
  const [bannerUrl] = useState(p.banner_url || null);
  const [bio, setBio] = useState(p.bio || "");
  const [interests, setInterests] = useState(
    Array.isArray(p.interests) ? p.interests : []
  );
  const [serverType, setServerType] = useState(p.preferred_server_type || null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Auto-suggest a handle the first time a name is typed.
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
    const { error: saveErr } = await saveClientProfile(supabase, user.id, {
      displayName: trimmedName,
      handle,
      avatarUrl,
      bannerUrl,
      bio: bio.trim() || null,
      interests,
      serverType,
    });
    if (saveErr) {
      setSaving(false);
      if (
        saveErr.code === "23505" ||
        /duplicate|unique/i.test(saveErr.message || "")
      ) {
        setError("That handle was just taken. Try another one.");
        setHandleValid(false);
      } else {
        setError(saveErr.message || "Couldn't save your profile. Try again.");
      }
      return;
    }
    const { error: doneErr } = await markOnboardingComplete(supabase, user.id);
    setSaving(false);
    if (doneErr) {
      setError(doneErr.message || "Couldn't finalize onboarding. Try again.");
      return;
    }
    // Reflect the chosen identity (incl. avatar) in the navbar immediately,
    // independent of the background re-fetch.
    updateProfile?.({
      display_name: trimmedName,
      username: handle,
      avatar_url: avatarUrl ?? null,
      banner_url: bannerUrl ?? null,
      bio: bio.trim() || null,
      interests,
      preferred_server_type: serverType ?? null,
    });
    await refresh?.();
    router.push(STEPS.complete);
  }

  return (
    <div>
      <div className="text-center mb-8 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Set up your client profile</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          Help builders understand what you&apos;re looking for.
        </p>
      </div>

      <div className="onb-fade-in onb-fade-in-1 mb-6">
        <div className="glass rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/[0.06] px-4 py-3 flex items-start gap-3">
          <Icon name="info" size={18} className="text-[#4ade80] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-300 leading-relaxed">
            Nothing here is permanent — you can change everything on this page anytime from your account settings.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Display name — hero input */}
        <div className="glass onb-card onb-fade-in onb-fade-in-2">
          <label htmlFor="displayName" className="onb-label block mb-3">
            Your name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
            placeholder="Your name"
            className={`onb-input onb-hero-name-input ${
              displayName && !nameValid ? "is-error" : nameValid ? "is-success" : ""
            }`}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="off"
          />
          <div className="mt-2 flex items-start justify-between text-xs">
            <p className="text-gray-500 leading-snug">
              Shown big on your profile. Two people can share the same name.
            </p>
            <span className="text-gray-500">
              {trimmedName.length}/{DISPLAY_NAME_MAX}
            </span>
          </div>
        </div>

        {/* Handle */}
        <div className="glass onb-card onb-fade-in onb-fade-in-2">
          <HandleInput
            value={handle}
            onChange={setHandle}
            currentUserId={user?.id}
            onValidityChange={setHandleValid}
            label="Pick your @nickname"
            hint="Unique to you — used in your profile URL, mentions and DMs."
          />
        </div>

        {/* Avatar */}
        <div className="glass onb-card onb-fade-in onb-fade-in-2">
          <div className="onb-label mb-4">Avatar</div>
          <div className="flex items-end gap-5">
            <AvatarUploader
              userId={user?.id}
              value={avatarUrl}
              onChange={setAvatarUrl}
              onError={setError}
              fallbackInitial={(trimmedName || "B").charAt(0).toUpperCase()}
              size={104}
            />
            <p className="text-xs text-gray-500 pb-3 hidden sm:block">
              Tip: a clear avatar makes you more recognizable when chatting with builders.
            </p>
          </div>
        </div>

        {/* Bio */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <label htmlFor="bio" className="onb-label block mb-3">
            Short bio
          </label>
          <textarea
            id="bio"
            className="onb-input onb-textarea"
            placeholder="Tell builders about your server, the vibe you're going for, and the kind of work you're hiring for."
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
          />
          <div className="mt-2 flex items-start justify-between text-xs">
            <p className="text-gray-500">Optional — but builders read this.</p>
            <span className="text-gray-500">
              {bio.length}/{BIO_MAX}
            </span>
          </div>
        </div>

        {/* Interests */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <div className="onb-label mb-3">Favorite styles</div>
          <p className="text-xs text-gray-500 mb-4">
            Pick the styles you&apos;re drawn to — we&apos;ll surface matching builders first.
          </p>
          <ChipGrid
            options={CLIENT_INTEREST_STYLES}
            value={interests}
            onChange={setInterests}
            multi
            ariaLabel="Favorite styles"
          />
        </div>

        {/* Server type */}
        <div className="glass onb-card onb-fade-in onb-fade-in-4">
          <div className="onb-label mb-3">Preferred server type</div>
          <p className="text-xs text-gray-500 mb-4">
            What kind of server are you building? Helps us tailor recommendations.
          </p>
          <ChipGrid
            options={SERVER_TYPES}
            value={serverType}
            onChange={setServerType}
            multi={false}
            ariaLabel="Preferred server type"
          />
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
        nextLabel="Finish setup"
        isSaving={saving}
        helper={canContinue ? null : "Add your name and pick a unique @nickname to continue"}
      />
    </div>
  );
}
