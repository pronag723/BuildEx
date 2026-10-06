"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRequireAuth } from "../../lib/auth/useRequireAuth";
import { useScrollLock } from "../../lib/useScrollLock";
import { useAuth } from "../../lib/auth/AuthContext";
import { getSupabaseClient } from "../../lib/supabase/client";
import {
  deleteOwnAccount,
  fetchOnboardingState,
  listPortfolioImages,
  saveBuilderIdentity,
  saveBuilderStyles,
} from "../../lib/onboarding/api";
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  STYLES,
} from "../../lib/onboarding/constants";
import { readContactLinks } from "../../lib/onboarding/contactLinks";
import { BUILDER_ONBOARDING_START } from "../../lib/onboarding/state";
import { withBase } from "../home/utils";
import { Icon } from "../../lib/icons";
import Avatar from "../../lib/ui/Avatar";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import SiteFooter from "../home/components/SiteFooter";
import AvatarUploader from "../onboarding/components/AvatarUploader";
import ChipGrid from "../onboarding/components/ChipGrid";
import ContactLinkField, {
  emptyLinkRows,
  linkRowsValid,
} from "../onboarding/components/ContactLinkField";
import SocialLinks from "../builders/components/SocialLinks";
import HandleInput from "../onboarding/components/HandleInput";
import PortfolioUploader from "../onboarding/components/PortfolioUploader";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "../../lib/i18n/LanguageProvider";
import { styleChipLabel } from "../../lib/i18n/labels.mjs";

function SectionHeader({ title, editing, onEdit, onCancel, onSave, saving, canSave = true }) {
  const t = useT();
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {editing ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost btn-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            className="btn btn-primary btn-sm"
          >
            {saving && (
              <span className="w-3 h-3 rounded-full border-2 border-accent-fg/30 border-t-accent-fg animate-spin" />
            )}
            {t("common.save")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="btn btn-secondary btn-sm"
        >
          <Icon name="pencil" size={14} />
          {t("common.edit")}
        </button>
      )}
    </div>
  );
}

// ─── Section switcher ────────────────────────────────────────────────────────
// The three top-level views of the account page. A segmented control sits above
// the avatar and toggles which group of cards is shown, so the page no longer
// stacks everything in one long scroll.
// Labels: `account.sections.<key>` (full) and `account.sections.<key>Short`.
const ACCOUNT_SECTIONS = [
  { key: "profile" },
  { key: "danger" },
];

function SectionTabs({ section, setSection }) {
  const t = useT();
  return (
    <div
      className="mb-6 flex gap-1 border-b border-line/[0.08]"
      role="tablist"
      aria-label={t("account.sections.aria")}
    >
      {ACCOUNT_SECTIONS.map((s) => {
        const isActive = s.key === section;
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setSection(s.key)}
            className={`relative -mb-px h-10 rounded-t-md px-3 text-sm font-medium transition-colors ${
              isActive
                ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            <span className="sm:hidden">{t(`account.sections.${s.key}Short`)}</span>
            <span className="hidden sm:inline">{t(`account.sections.${s.key}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── About / bio (shared) ────────────────────────────────────────────────────
// Only rendered for builders — it is their public pitch.
function AboutSection({ profile, onSaved }) {
  const { user } = useAuth();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(profile?.bio || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setBio(profile?.bio || "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    setError(null);
    // Only the bio — saveBuilderIdentity writes exactly the fields it is
    // handed, so the avatar and name this card doesn't own stay put.
    const { error: err } = await saveBuilderIdentity(supabase, user.id, {
      bio: bio.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message || t("account.errors.saveFailed"));
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader
        title={t("account.about.title")}
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
      />

      {editing ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="acc-bio" className="onb-label block mb-1.5">{t("account.about.bio")}</label>
            <textarea
              id="acc-bio"
              className="onb-input onb-textarea"
              placeholder={t("account.about.placeholder")}
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
            />
            <p className="mt-1.5 text-xs tabular-nums text-ink-3">{bio.length}/{BIO_MAX}</p>
          </div>
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {profile?.bio ? (
            <p className="max-w-prose text-[15px] leading-7 text-ink-2 break-words whitespace-pre-wrap">{profile.bio}</p>
          ) : (
            <p className="text-sm text-ink-3">
              {t.rich("account.about.empty", { edit: <strong>{t("common.edit")}</strong> })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Styles (builders) ──────────────────────────────────────────────────────
// Exactly what signup step 2 asks for, nothing more. `build_types` is never
// passed, so whatever an older builder stored there survives untouched.
function StylesSection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [specialties, setSpecialties] = useState(builderProfile?.specialties || []);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setSpecialties(builderProfile?.specialties || []);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const { error: err } = await saveBuilderStyles(supabase, user.id, { specialties });
    setSaving(false);
    if (err) {
      setError(err.message || t("account.errors.saveFailed"));
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const canSave = specialties.length >= 1;
  const savedSpecs = builderProfile?.specialties || [];

  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader
        title={t("account.styles.title")}
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
        canSave={canSave}
      />

      {editing ? (
        <div className="space-y-6">
          <div>
            <div className="onb-label mb-3">{t("onboarding.styles.label")}</div>
            <ChipGrid
              options={STYLES.map((s) => ({ ...s, label: t(`styles.${s.key}`) }))}
              value={specialties}
              onChange={setSpecialties}
              multi
              ariaLabel={t("onboarding.styles.label")}
            />
          </div>
          {!canSave && (
            <p className="text-xs text-ink-3">{t("account.styles.pickOne")}</p>
          )}
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : savedSpecs.length === 0 ? (
        <p className="text-sm text-ink-3">
          {t.rich("account.styles.empty", { edit: <strong>{t("common.edit")}</strong> })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {savedSpecs.map((sp) => (
            <span key={sp} className="tag h-6 px-2 text-xs">
              {styleChipLabel(sp, t.lang)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Portfolio (builders) ───────────────────────────────────────────────────
function PortfolioSection({ portfolioCount, onSaved }) {
  const { user } = useAuth();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadImages = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    const { images: rows } = await listPortfolioImages(supabase, user.id);
    setImages(rows || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadImages();
  }, [loadImages, portfolioCount]);

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("profile.portfolio")}</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {t("account.portfolio.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="btn btn-secondary btn-sm"
        >
          <Icon name="pencil" size={14} />
          {editing ? t("account.portfolio.done") : t("account.portfolio.manage")}
        </button>
      </div>

      {editing ? (
        <div>
          <PortfolioUploader
            userId={user?.id}
            onCountChange={() => {
              loadImages();
              onSaved?.();
            }}
            onError={setError}
          />
          {error && (
            <div role="alert" className="auth-banner auth-banner-error mt-6">
              {error}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-dashed border-line/15 p-8 text-center text-sm text-ink-3">{t("account.loading")}</div>
      ) : images.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line/15 p-8 text-center text-sm text-ink-3">
          {t.rich("account.portfolio.empty", { manage: <strong>{t("account.portfolio.manage")}</strong> })}
        </div>
      ) : (
        <div className="portfolio-scroll -mx-5 flex gap-3 overflow-x-auto px-5 pb-2 snap-x sm:-mx-6 sm:px-6">
          {images.map((img) => (
            <div key={img.id} className="portfolio-card snap-start flex-shrink-0 overflow-hidden rounded-lg bg-raised">
              <div className="relative aspect-[16/10] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt || ""} className="w-full h-full object-cover" loading="lazy" />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Account actions + danger zone ───────────────────────────────────────────
function AccountActionsSection() {
  const { user, profile, signOut } = useAuth();
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  function openConfirm() {
    setConfirmText("");
    setError(null);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (deleting) return;
    setConfirmOpen(false);
  }

  async function handleDelete() {
    if (!canDelete || deleting) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setDeleting(true);
    setError(null);
    const { error: err } = await deleteOwnAccount(supabase);
    if (err) {
      setDeleting(false);
      const missingFn =
        err.code === "PGRST202" ||
        /could not find the function|delete_own_account/i.test(err.message || "");
      setError(
        missingFn
          ? t("account.errors.deleteNotEnabled")
          : err.message || t("account.errors.deleteFailed")
      );
      return;
    }
    // The account row is gone — sign out clears the session and sends home.
    await signOut("/");
  }

  // Close on Escape
  useEffect(() => {
    if (!confirmOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") closeConfirm();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen, deleting]);

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{t("account.actions.title")}</h2>

      {/* "Browse builders" and "Back to home" used to be two tiles; the feed is
          the site root now, so they were the same destination twice. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a href={withBase("/")} className="btn btn-secondary">
          {t("account.actions.browse")}
        </a>
        <button
          type="button"
          onClick={() => signOut()}
          className="btn btn-secondary"
        >
          <Icon name="logout" size={16} />
          {t("nav.logOut")}
        </button>
      </div>

      {/* Danger zone */}
      <div className="mt-6 border-t border-line/[0.08] pt-6">
        <div className="flex flex-col justify-between gap-4 rounded-lg border border-danger/30 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-danger">{t("account.actions.delete")}</h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-2">
              {t("account.actions.deleteBody")}
            </p>
          </div>
          <button
            type="button"
            onClick={openConfirm}
            className="btn btn-secondary flex-shrink-0 !text-danger hover:!border-danger/50"
          >
            {t("account.actions.delete")}
          </button>
        </div>
      </div>

      {/* Confirmation modal — portaled to <body> so it sits outside the
          card, so no ancestor style can become the containing block for this
          fixed overlay and break its full-screen centering. */}
      {confirmOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeConfirm}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-line/10 bg-surface p-6 shadow-pop">
            <h3 id="delete-account-title" className="text-lg font-semibold">
              {t("account.deleteDialog.title")}
            </h3>
            <p className="mt-1.5 mb-5 text-sm leading-relaxed text-ink-2">
              {t("account.deleteDialog.body")}{" "}
              <strong className="font-semibold text-ink">{t("account.deleteDialog.irreversible")}</strong>
            </p>
            <label htmlFor="confirm-delete" className="onb-label block mb-1.5">
              {t.rich("account.deleteDialog.typeToConfirm", {
                word: <span className="font-semibold text-danger">DELETE</span>,
              })}
            </label>
            <input
              id="confirm-delete"
              type="text"
              className="onb-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              autoFocus
            />
            {error && (
              <div role="alert" className="auth-banner auth-banner-error mt-4">
                {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={deleting}
                className="btn btn-ghost"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || !canDelete}
                className="btn btn-danger"
              >
                {deleting && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {deleting ? t("account.deleteDialog.deleting") : t("account.actions.delete")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

// ─── Hero header (avatar + identity) ─────────────────────────────────────────
// Mirrors the public builder profile hero (no banner) so what the builder edits
// reads like what clients will eventually see.
function AccountHeader({ profile, builderProfile, isBuilder, onSaved }) {
  const { user, updateProfile } = useAuth();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState(profile?.username || "");
  const [handleValid, setHandleValid] = useState(Boolean(profile?.username));
  const savedLinks = readContactLinks(builderProfile?.contact_links);
  const [linkRows, setLinkRows] = useState(
    savedLinks.length
      ? savedLinks.map(({ type, value }) => ({ type, value }))
      : emptyLinkRows()
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const trimmedName = displayName.trim();
  const nameValid =
    trimmedName.length >= DISPLAY_NAME_MIN && trimmedName.length <= DISPLAY_NAME_MAX;
  const linksOk = linkRowsValid(linkRows);
  const canSave = nameValid && handleValid && !!handle && linksOk;

  const specialties = builderProfile?.specialties || [];

  function startEdit() {
    setAvatarUrl(profile?.avatar_url || null);
    setDisplayName(profile?.display_name || "");
    setHandle(profile?.username || "");
    setHandleValid(Boolean(profile?.username));
    const links = readContactLinks(builderProfile?.contact_links);
    setLinkRows(
      links.length ? links.map(({ type, value }) => ({ type, value })) : emptyLinkRows()
    );
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!canSave) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    setError(null);
    // Name, handle, avatar and (for builders) the contact link. The bio is the
    // About card's field and is deliberately not passed, so saving here leaves
    // it alone.
    const payload = {
      displayName: trimmedName,
      handle,
      avatarUrl,
    };
    if (isBuilder) payload.contactLinks = linkRows;
    const { error: err } = await saveBuilderIdentity(supabase, user.id, payload);
    setSaving(false);
    if (err) {
      if (err.code === "23505" || /duplicate|unique/i.test(err.message || "")) {
        setError(t("onboarding.errors.handleTaken"));
        setHandleValid(false);
      } else {
        setError(err.message || t("account.errors.saveFailed"));
      }
      return;
    }
    // Push the new identity into AuthContext right away so the navbar avatar
    // and name update immediately instead of waiting on the background re-fetch.
    updateProfile?.({
      avatar_url: avatarUrl ?? null,
      display_name: trimmedName,
      username: handle,
    });
    setEditing(false);
    await onSaved?.();
  }

  return (
    <header className="card mb-6 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
        {/* Avatar */}
        <div className="relative flex-shrink-0 mx-auto sm:mx-0">
          {editing ? (
            <AvatarUploader
              userId={user?.id}
              value={avatarUrl}
              onChange={setAvatarUrl}
              onError={setError}
              fallbackInitial={(profile?.display_name || "B").charAt(0).toUpperCase()}
              size={112}
            />
          ) : (
            <Avatar
              src={profile?.avatar_url}
              name={profile?.display_name || "B"}
              alt={profile?.display_name || ""}
              className="h-20 w-20 rounded-2xl text-3xl sm:h-24 sm:w-24"
            />
          )}
        </div>

        {/* Identity */}
        <div className="w-full sm:w-auto sm:flex-1 min-w-0 text-center sm:text-left">
          {editing ? (
            <div className="space-y-4 text-left">
              <div>
                <label htmlFor="acc-display-name" className="onb-label block mb-1.5">
                  {t("onboarding.identity.nameLabel")}
                </label>
                <input
                  id="acc-display-name"
                  type="text"
                  className={`onb-input ${displayName && !nameValid ? "is-error" : ""}`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
                  maxLength={DISPLAY_NAME_MAX}
                  placeholder={t("onboarding.identity.nameLabel")}
                  autoComplete="off"
                />
                <p className="mt-1.5 text-xs text-ink-3">
                  {t("account.header.nameHint")} {trimmedName.length}/{DISPLAY_NAME_MAX}
                </p>
              </div>
              <HandleInput
                value={handle}
                onChange={setHandle}
                currentUserId={user?.id}
                onValidityChange={setHandleValid}
                label={t("account.header.handleLabel")}
                hint={t("account.header.handleHint")}
              />
              {isBuilder && (
                <ContactLinkField
                  rows={linkRows}
                  onChange={setLinkRows}
                  label={t("onboarding.links.label")}
                  hint={t("account.header.linksHint")}
                />
              )}
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1.5 mb-1.5">
            <h2 className="min-w-0 break-words text-xl font-semibold leading-tight tracking-[-0.02em] sm:text-2xl">
              {profile?.display_name || t("onboarding.identity.nameLabel")}
            </h2>
            {isBuilder && (
              <span className="tag bg-accent/15 text-accent-ink">
                {t("account.header.builderBadge")}
              </span>
            )}
          </div>

          {profile?.username && (
            <p className="mb-4 break-all text-sm text-ink-3">@{profile.username}</p>
          )}

          {/* Links used to render ONLY when at least one was saved, which meant
              a builder who had added none saw nothing here at all — no label,
              no hint — and had no way to discover the feature short of opening
              Edit and scrolling past the name and handle fields. The section is
              always present for a builder now, with an empty state that says
              where to add them. */}
          {isBuilder && (
            <div className="mb-4">
              <p className="mb-2 text-[13px] font-medium text-ink-3">
                {t("onboarding.links.label")}
              </p>
              {savedLinks.length > 0 ? (
                <SocialLinks
                  contactLinks={builderProfile?.contact_links}
                  className="justify-center sm:justify-start"
                />
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="btn btn-secondary btn-sm border-dashed"
                >
                  <Icon name="link" size={13} />
                  {t("account.header.addLinks")}
                </button>
              )}
            </div>
          )}

          {isBuilder && specialties.length > 0 && (
            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              {specialties.map((s) => (
                <span key={s} className="tag h-6 px-2 text-xs">
                  {styleChipLabel(s, t.lang)}
                </span>
              ))}
            </div>
          )}
            </>
          )}
        </div>

        {/* Edit identity control */}
        <div className="flex items-center gap-2 self-center sm:self-start mx-auto sm:mx-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="btn btn-ghost btn-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !canSave}
                className="btn btn-primary btn-sm"
              >
                {saving && (
                  <span className="w-3 h-3 rounded-full border-2 border-accent-fg/30 border-t-accent-fg animate-spin" />
                )}
                {t("common.save")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="btn btn-secondary btn-sm"
            >
              <Icon name="pencil" size={14} />
              {t("account.header.editProfile")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="auth-banner auth-banner-error mt-4">
          {error}
        </div>
      )}
    </header>
  );
}

// ─── Become a builder ───────────────────────────────────────────────────────
// The ONLY entrance to builder onboarding. Anyone signed in is a visitor until
// they have a builder_profiles row; this card is what creates one.
function BecomeABuilderCard() {
  const t = useT();
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{t("account.become.title")}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">
        {t("account.become.body")}
      </p>
      <Link href={BUILDER_ONBOARDING_START} className="btn btn-primary mt-5">
        {t("account.become.cta")}
      </Link>
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
        </main>
      }
    >
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  useRequireAuth();
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    status,
    user,
    profile: authProfile,
    profileLoaded,
    refresh: refreshAuthProfile,
  } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Top-level account view: "profile" (visuals/identity) or "danger" (account
  // controls + delete). Keep it in the URL so a refresh or a shared account
  // link restores the selected tab.
  const [section, setSection] = useState(() => searchParams.get("section") || "profile");
  const selectSection = useCallback((nextSection) => {
    setSection(nextSection);

    const url = new URL(window.location.href);
    if (nextSection === "profile") url.searchParams.delete("section");
    else url.searchParams.set("section", nextSection);
    // Keep Next's app router in sync.
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    setSection(searchParams.get("section") || "profile");
  }, [searchParams]);
  // AuthContext owns the profile row (hydrated from localStorage on mount,
  // refreshed from Supabase in the background). The page reads it directly
  // from there instead of re-fetching, which was the source of the duplicate
  // profiles query that timed out on slow Supabase.
  const profile = authProfile;
  const [builderProfile, setBuilderProfile] = useState(null);
  const [portfolioCount, setPortfolioCount] = useState(0);
  const [builderLoaded, setBuilderLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // `refresh` reads the latest profile only as a prefetch hint. We keep it in a
  // ref so `refresh`'s identity does NOT change when AuthContext swaps in a new
  // profile object — otherwise refresh→refreshAuthProfile→setProfile→new
  // authProfile ref→refresh recreated→effect reruns→refresh again would loop
  // forever, flooding Supabase until every query times out.
  const authProfileRef = useRef(authProfile);
  authProfileRef.current = authProfile;

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setLoadError(null);
    // Refresh AuthContext's profile (background — don't gate render on it).
    refreshAuthProfile?.();
    // Builder profile + portfolio count: single attempt, no retry. If they
    // fail (TIMEOUT etc.) we still render the page with whatever profile
    // AuthContext has — the user can hit Edit and re-save to retry.
    const { builderProfile: bp, portfolioCount: pc } = await fetchOnboardingState(
      supabase,
      user.id,
      { prefetchedProfile: authProfileRef.current || undefined }
    );
    setBuilderProfile(bp);
    setPortfolioCount(pc || 0);
    setBuilderLoaded(true);
  }, [user?.id, refreshAuthProfile]);

  useEffect(() => {
    if (status === "authenticated" && user?.id) refresh();
  }, [status, user?.id, refresh]);

  useScrollLock(mobileMenuOpen);

  // Builder-ness is the existence of a builder_profiles row — never
  // profiles.role, which visitors leave null and older accounts carry stale
  // values in. `builderLoaded` guards the gap before that row has been fetched
  // so we don't flash the "create a builder profile" CTA at a real builder.
  const isBuilder = Boolean(builderProfile);

  useEffect(() => {
    if (profile && !ACCOUNT_SECTIONS.some((sct) => sct.key === section)) {
      selectSection("profile");
    }
  }, [profile, section, selectSection]);

  // Render the spinner only when we have NOTHING to show. As soon as either
  // the cached profile from AuthContext or a fresh fetch lands, paint the
  // page — that gives us a near-instant reload on the cached path. Builder
  // data fills in once `refresh()` resolves.
  if (status === "loading" || (!profile && !profileLoaded)) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">{t("account.loadError.title")}</h1>
          <p className="mt-2 mb-6 text-sm text-ink-2">
            {loadError || t("account.loadError.body")}
          </p>
          <button type="button" onClick={refresh} className="btn btn-primary">
            {t("common.tryAgain")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main className="pb-20 pt-8 sm:pt-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] sm:text-[1.875rem]">
              {t("account.intro.title")}
            </h1>
            <p className="mt-1.5 text-[15px] text-ink-2">
              {isBuilder
                ? t("account.intro.builderBody")
                : t("account.intro.visitorBody")}
            </p>
          </div>

          {/* Section switcher — sits above the avatar and picks which group
              of cards is shown, so the page is no longer one long stack. */}
          <SectionTabs section={section} setSection={selectSection} />

          {section === "profile" && (
            <>
              <AccountHeader
                profile={profile}
                builderProfile={builderProfile}
                isBuilder={isBuilder}
                onSaved={refresh}
              />

              <div className="space-y-6">
                {/* Builder settings edit exactly what signup asks for and
                    nothing more: identity + contact link (in the header above),
                    the bio, the styles, and the portfolio. About is a builder's
                    public pitch — someone who isn't listed has nowhere for it
                    to appear, so they aren't asked for one. */}
                {isBuilder && (
                  <>
                    <AboutSection profile={profile} onSaved={refresh} />
                    <StylesSection builderProfile={builderProfile} onSaved={refresh} />
                    <PortfolioSection portfolioCount={portfolioCount} onSaved={refresh} />
                  </>
                )}

                {builderLoaded && !isBuilder && <BecomeABuilderCard />}
              </div>
            </>
          )}

          {section === "danger" && (
            <div className="space-y-6">
              <AccountActionsSection />
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
