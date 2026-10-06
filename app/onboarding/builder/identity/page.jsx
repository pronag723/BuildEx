"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Builder signup, step 1 of 3 — who you are.
// Avatar, @handle, display name, a short description, and one optional way to
// reach you off-platform. Nothing else: rates, tools, response time,
// availability, project types and the banner are all gone.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { markRoleAsBuilder, saveBuilderIdentity } from "../../../../lib/onboarding/api";
import { STEPS } from "../../../../lib/onboarding/state";
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
} from "../../../../lib/onboarding/constants";
import { readContactLinks } from "../../../../lib/onboarding/contactLinks";
import OnboardingShell from "../../components/OnboardingShell";
import OnboardingGate from "../../components/OnboardingGate";
import OnboardingFooter from "../../components/OnboardingFooter";
import AvatarUploader from "../../components/AvatarUploader";
import ContactLinkField, {
  emptyLinkRows,
  linkRowsValid,
} from "../../components/ContactLinkField";
import HandleInput from "../../components/HandleInput";
import { useT } from "../../../../lib/i18n/LanguageProvider";

export default function BuilderIdentityPage() {
  return (
    <OnboardingShell currentStep={STEPS.builderIdentity} maxWidth="max-w-3xl">
      <OnboardingGate expectedStep={STEPS.builderIdentity}>
        {(state) => <BuilderIdentityStep state={state} />}
      </OnboardingGate>
    </OnboardingShell>
  );
}

function BuilderIdentityStep({ state }) {
  const router = useRouter();
  const { user, refresh, updateProfile } = useAuth();
  const t = useT();
  const p = state.profile || {};
  const savedLinks = readContactLinks(state.builderProfile?.contact_links);

  const [displayName, setDisplayName] = useState(p.display_name || "");
  const [handle, setHandle] = useState(p.username || "");
  const [handleValid, setHandleValid] = useState(Boolean(p.username));
  const [avatarUrl, setAvatarUrl] = useState(p.avatar_url || null);
  const [bio, setBio] = useState(p.bio || "");
  const [linkRows, setLinkRows] = useState(
    savedLinks.length
      ? savedLinks.map(({ type, value }) => ({ type, value }))
      : emptyLinkRows()
  );
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
  // Links are optional, but a half-typed one must not be saved.
  const linksOk = linkRowsValid(linkRows);
  const canContinue = nameValid && handleValid && !!handle && linksOk;

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
      bio: bio.trim() || null,
      contactLinks: linkRows,
      // Signup: the builder_profiles row must exist for steps 2 and 3.
      ensureBuilderRow: true,
    });
    if (saveErr) {
      setSaving(false);
      if (
        saveErr.code === "23505" ||
        /duplicate|unique/i.test(saveErr.message || "")
      ) {
        setError(t("onboarding.errors.handleTaken"));
        setHandleValid(false);
      } else {
        setError(saveErr.message || t("onboarding.errors.saveFailed"));
      }
      return;
    }

    // Builder-ness is the existence of the builder_profiles row saveBuilderIdentity
    // just created; `role` is legacy but kept truthful. Best-effort — a failure
    // here must not block someone from finishing their profile.
    await markRoleAsBuilder(supabase, user.id, p.role || null);

    setSaving(false);

    // Reflect the chosen identity (incl. avatar) in the navbar immediately,
    // independent of the background re-fetch.
    updateProfile?.({
      display_name: trimmedName,
      username: handle,
      avatar_url: avatarUrl ?? null,
      bio: bio.trim() || null,
    });
    router.replace(STEPS.builderStyles);
    refresh?.();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="onb-section-title">{t("onboarding.identity.title")}</h1>
        <p className="onb-section-sub mt-2">
          {t("onboarding.identity.subtitle")}
        </p>
      </div>

      {/* One form surface, sections split by hairlines — not a stack of
          five separate boxes. */}
      <div className="onb-card divide-y divide-line/[0.08] !py-0">
        {/* Avatar + name */}
        <div className="flex flex-col gap-5 py-5 sm:flex-row sm:items-start sm:py-6">
          <AvatarUploader
            userId={user?.id}
            value={avatarUrl}
            onChange={setAvatarUrl}
            onError={setError}
            fallbackInitial={(trimmedName || "B").charAt(0).toUpperCase()}
            size={112}
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="displayName" className="onb-label mb-1.5 block">
              {t("onboarding.identity.nameLabel")}
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
              placeholder={t("onboarding.identity.namePlaceholder")}
              className={`onb-input ${displayName && !nameValid ? "is-error" : ""}`}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="off"
            />
            <div className="mt-1.5 flex items-start justify-between gap-3 text-xs text-ink-3">
              <p className="leading-snug">{t("onboarding.identity.nameHint")}</p>
              <span className="tabular-nums">
                {trimmedName.length}/{DISPLAY_NAME_MAX}
              </span>
            </div>

            <div className="mt-5">
              <HandleInput
                value={handle}
                onChange={setHandle}
                currentUserId={user?.id}
                onValidityChange={setHandleValid}
                label={t("onboarding.identity.handleLabel")}
                hint={t("onboarding.identity.handleHint")}
              />
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="py-5 sm:py-6">
          <label htmlFor="bio" className="onb-label mb-1.5 block">
            {t("onboarding.identity.bioLabel")}
          </label>
          <textarea
            id="bio"
            className="onb-input onb-textarea"
            placeholder={t("onboarding.identity.bioPlaceholder")}
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
          />
          <div className="mt-1.5 flex items-start justify-between gap-3 text-xs text-ink-3">
            <p>{t("onboarding.identity.bioHint")}</p>
            <span className="tabular-nums">
              {bio.length}/{BIO_MAX}
            </span>
          </div>
        </div>

        {/* Contact links */}
        <div className="py-5 sm:py-6">
          <ContactLinkField
            rows={linkRows}
            onChange={setLinkRows}
            label={t("onboarding.identity.linksLabel")}
            hint={t("onboarding.identity.linksHint")}
          />
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        {t("onboarding.identity.notPermanent")}
      </p>

      {error && (
        <div role="alert" className="auth-banner auth-banner-error mt-4">
          {error}
        </div>
      )}

      <OnboardingFooter
        onBack={() => router.push("/account")}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        isSaving={saving}
        helper={
          canContinue
            ? null
            : !linksOk
            ? t("onboarding.identity.helperLinks")
            : t("onboarding.identity.helperName")
        }
      />
    </div>
  );
}
