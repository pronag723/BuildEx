"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { saveBuilderIdentity } from "../../../../lib/onboarding/api";
import { validateStudioCode } from "../../../../lib/studios/api";
import { STEPS } from "../../../../lib/onboarding/state";
import { Icon } from "../../../../lib/icons";
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
  // Banner/background is no longer collected during onboarding. We still read
  // and pass through any previously stored value so a re-save doesn't wipe it.
  const [bannerUrl] = useState(p.banner_url || null);
  const [bio, setBio] = useState(p.bio || "");
  const [tagline, setTagline] = useState(bp.tagline || "");
  // Studio referral (migrations 0026/0027). A builder may belong to at most one
  // studio, ever. The code is only VALIDATED here and stashed as pending; it's
  // consumed when onboarding completes, so abandoning setup never burns a slot.
  // Pre-fill from any previously entered (still pending) code.
  const alreadyJoined = Boolean(bp.studio_id);
  const [studioCode, setStudioCode] = useState(bp.pending_studio_code || "");
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

    // Studio code is optional. Validate it first (no slot is consumed yet — it's
    // only stashed as pending and redeemed when onboarding completes). A bad code
    // blocks the step so the builder can fix or clear it.
    const codeTrimmed = studioCode.trim();
    if (!alreadyJoined && codeTrimmed) {
      const { error: vErr } = await validateStudioCode(codeTrimmed);
      if (vErr) {
        setSaving(false);
        setError(vErr.message || "That studio code couldn't be applied.");
        return;
      }
    }

    const { error: saveErr } = await saveBuilderIdentity(supabase, user.id, {
      displayName: trimmedName,
      handle,
      avatarUrl,
      bannerUrl,
      bio: bio.trim() || null,
      tagline: tagline.trim() || null,
      // Stash the validated code as pending (or clear it). Skipped when already
      // joined so an existing studio link is never disturbed.
      ...(alreadyJoined ? {} : { pendingStudioCode: codeTrimmed || null }),
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
        setError(saveErr.message || "Couldn't save. Try again.");
      }
      return;
    }
    setSaving(false);

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
    router.push(STEPS.builderExpertise);
  }

  return (
    <div>
      <div className="text-center mb-8 onb-fade-in onb-fade-in-1">
        <h1 className="onb-section-title">Craft your builder profile</h1>
        <p className="onb-section-sub mt-3 mx-auto">
          This is what clients see first. Make it count.
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

        {/* Avatar */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3">
          <div className="onb-label mb-3">Avatar</div>
          <div className="flex items-end gap-5">
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

        {/* Studio code (optional referral — migration 0026) */}
        <div className="glass onb-card onb-fade-in onb-fade-in-3 border border-emerald-500/20 bg-emerald-500/[0.05]">
          <label htmlFor="studioCode" className="onb-label block mb-2 flex items-center gap-2">
            <Icon name="handshake" size={16} className="text-emerald-300" />
            Studio code
            <span className="text-xs font-normal text-gray-500">(optional)</span>
          </label>
          {alreadyJoined ? (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <Icon name="check" size={16} />
              You&apos;re linked to a studio — reduced fees are active for your first 4 months.
            </div>
          ) : (
            <>
              <input
                id="studioCode"
                type="text"
                className="onb-input"
                placeholder="e.g. ATLAS"
                value={studioCode}
                onChange={(e) => setStudioCode(e.target.value.slice(0, 40))}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-2 text-xs text-gray-500 leading-snug">
                From a partner studio? Enter their code to get a reduced commission for
                your first 4 months and a studio badge on your profile.
              </p>
            </>
          )}
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
        onBack={() => router.push(`${STEPS.role}?revisit=1`)}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
        helper={canContinue ? null : "Add your name and pick a unique @nickname to continue"}
      />
    </div>
  );
}
