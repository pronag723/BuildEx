"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { saveBuilderIdentity } from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
} from "../../../../lib/onboarding/constants";
import { withBase } from "../../../home/utils";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import AvatarUploader from "../../components/AvatarUploader";
import BannerUploader from "../../components/BannerUploader";
import HandleInput from "../../components/HandleInput";

const TAGLINE_MAX = 80;

export default function BuilderIdentityPage() {
  return (
    <OnboardingShell currentStep={STEPS.builderIdentity} role="builder" maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.builderIdentity}>
        {(state) => <BuilderIdentityStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderIdentityStep({ state }) {
  const router = useRouter();
  const { user, refresh, updateProfile } = useAuth();
  const p = state.profile || {};
  const bp = state.builderProfile || {};

  const [displayName, setDisplayName] = useState(p.display_name || "");
  const [handle, setHandle] = useState(p.username || "");
  const [handleValid, setHandleValid] = useState(Boolean(p.username));
  const [avatarUrl, setAvatarUrl] = useState(p.avatar_url || null);
  const [bannerUrl, setBannerUrl] = useState(p.banner_url || null);
  const [bio, setBio] = useState(p.bio || "");
  const [tagline, setTagline] = useState(bp.tagline || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

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
    const { error: saveErr } = await saveBuilderIdentity(supabase, user.id, {
      displayName: trimmedName,
      handle,
      avatarUrl,
      bannerUrl,
      bio: bio.trim() || null,
      tagline: tagline.trim() || null,
    });
    setSaving(false);
    if (saveErr) {
      if (
        saveErr.code === "23505" ||
        /duplicate|unique/i.test(saveErr.message || "")
      ) {
        setError("That handle was just taken. Try another one.");
        setHandleValid(false);
      } else {
        setError(saveErr.message || "Couldn't save. Try again.");
      }
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
    });
    await refresh?.();
    router.push(withBase(STEPS.builderExpertise));
  }

  return (
    <div>
      <div className="text-center mb-8 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Craft your builder profile</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          This is what clients see first. Make it count — you can refine every part later from your dashboard.
        </p>
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
            placeholder="Pixel Forge Studio"
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
            hint="Unique to you — your profile URL is /builders/profile/@yourhandle."
          />
        </div>

        {/* Banner */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <div className="onb-label mb-3">Banner</div>
          <BannerUploader
            userId={user?.id}
            value={bannerUrl}
            onChange={setBannerUrl}
            onError={setError}
          />
          <div className="-mt-14 pl-6 flex items-end gap-5">
            <AvatarUploader
              userId={user?.id}
              value={avatarUrl}
              onChange={setAvatarUrl}
              onError={setError}
              fallbackInitial={(trimmedName || "B").charAt(0).toUpperCase()}
              size={112}
            />
            <div className="pb-2">
              <div className="text-base font-bold">
                {trimmedName || "Your name"}
              </div>
              <div className="text-xs text-gray-400">@{handle || "yourhandle"}</div>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <label htmlFor="tagline" className="onb-label block mb-2">
            Tagline
          </label>
          <input
            id="tagline"
            type="text"
            className="onb-input"
            placeholder="Master spawn builder — medieval & fantasy specialist"
            value={tagline}
            onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX))}
            maxLength={TAGLINE_MAX}
          />
          <div className="mt-2 flex items-start justify-between text-xs">
            <p className="text-gray-500">One line — what makes you stand out.</p>
            <span className="text-gray-500">
              {tagline.length}/{TAGLINE_MAX}
            </span>
          </div>
        </div>

        {/* Bio */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <label htmlFor="bio" className="onb-label block mb-3">
            About you
          </label>
          <textarea
            id="bio"
            className="onb-input onb-textarea"
            placeholder="Share your story, what you love building, the kind of projects you take on, and anything that makes working with you great."
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
          />
          <div className="mt-2 flex items-start justify-between text-xs">
            <p className="text-gray-500">
              Optional, but builders with bios get 3× more inquiries.
            </p>
            <span className="text-gray-500">
              {bio.length}/{BIO_MAX}
            </span>
          </div>
        </div>

        {error && (
          <div role="alert" className="auth-banner auth-banner-error">
            {error}
          </div>
        )}
      </div>

      <OnboardingFooter
        onBack={() => router.push(`${withBase(STEPS.role)}?revisit=1`)}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
        helper={canContinue ? null : "Add your name and pick a unique @nickname to continue"}
      />
    </div>
  );
}
