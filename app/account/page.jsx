"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRequireAuth } from "../../lib/auth/useRequireAuth";
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
import {
  contactLinkError,
  contactLinkHref,
  contactLinkText,
  contactLinkTypeMeta,
  readContactLinks,
} from "../../lib/onboarding/contactLinks";
import { BUILDER_ONBOARDING_START } from "../../lib/onboarding/state";
import { withBase } from "../home/utils";
import { Icon } from "../../lib/icons";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import SiteFooter from "../home/components/SiteFooter";
import AvatarUploader from "../onboarding/components/AvatarUploader";
import ChipGrid from "../onboarding/components/ChipGrid";
import ContactLinkField from "../onboarding/components/ContactLinkField";
import HandleInput from "../onboarding/components/HandleInput";
import PortfolioUploader from "../onboarding/components/PortfolioUploader";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function IconPencil({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function SectionHeader({ title, editing, onEdit, onCancel, onSave, saving, canSave = true }) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 className="font-bold text-xl">{title}</h2>
      {editing ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-full text-xs font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {saving && (
              <span className="w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />
            )}
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
        >
          <IconPencil className="w-3.5 h-3.5" />
          Edit
        </button>
      )}
    </div>
  );
}

// ─── Section switcher ────────────────────────────────────────────────────────
// The three top-level views of the account page. A segmented control sits above
// the avatar and toggles which group of cards is shown, so the page no longer
// stacks everything in one long scroll.
const ACCOUNT_SECTIONS = [
  { key: "profile", label: "Profile", short: "Profile" },
  { key: "danger", label: "Account", short: "Account" },
];

function SectionTabs({ section, setSection }) {
  const sections = ACCOUNT_SECTIONS;
  const idx = Math.max(0, sections.findIndex((s) => s.key === section));
  return (
    <div
      className="account-section-tabs relative grid p-1 rounded-full bg-white/[0.04] border border-white/10 mb-8 detail-fade-up"
      style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label="Account sections"
    >
      {/* Sliding highlight */}
      <span
        aria-hidden="true"
        className="account-section-indicator absolute inset-y-1 left-1 rounded-full bg-[#4ade80]/15 transition-[transform,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: `calc((100% - 0.5rem) / ${sections.length})`,
          transform: `translateX(calc(${idx} * 100%))`,
          boxShadow: "0 0 0 1px rgba(74,222,128,0.5), 0 0 14px rgba(74,222,128,0.22)",
        }}
      />
      {sections.map((s) => {
        const isActive = s.key === section;
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setSection(s.key)}
            className={`account-section-tab relative z-10 py-2.5 px-2 rounded-full text-xs sm:text-sm font-semibold transition-[color,transform] duration-300 ${
              isActive ? "text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <span className="sm:hidden">{s.short}</span>
            <span className="hidden sm:inline">{s.label}</span>
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
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="About"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
      />

      {editing ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="acc-bio" className="onb-label block mb-2">Bio</label>
            <textarea
              id="acc-bio"
              className="onb-input onb-textarea"
              placeholder="Share your story, what you love building, the kind of projects you take on…"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
            />
            <p className="mt-2 text-xs text-gray-500">{bio.length}/{BIO_MAX}</p>
          </div>
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {profile?.bio ? (
            <p className="text-gray-400 leading-relaxed break-words whitespace-pre-wrap">{profile.bio}</p>
          ) : (
            <p className="text-gray-500 text-sm italic">
              No bio yet. Click <strong>Edit</strong> to add one.
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
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const canSave = specialties.length >= 1;
  const savedSpecs = builderProfile?.specialties || [];

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Styles"
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
            <div className="onb-label mb-3">Building styles</div>
            <ChipGrid
              options={STYLES}
              value={specialties}
              onChange={setSpecialties}
              multi
              ariaLabel="Building styles"
            />
          </div>
          {!canSave && (
            <p className="text-xs text-gray-500">Pick at least one style.</p>
          )}
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : savedSpecs.length === 0 ? (
        <p className="text-gray-500 text-sm italic">
          No styles yet. Click <strong>Edit</strong> to pick some — they are what
          clients filter the catalog by.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {savedSpecs.map((sp) => (
            <span key={sp} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
              {sp}
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
    <section className="reveal">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-xl">Portfolio</h2>
          <p className="text-xs text-gray-500 mt-1">
            Drag in your best builds. The first image becomes your cover.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
        >
          <IconPencil className="w-3.5 h-3.5" />
          {editing ? "Done editing" : "Manage portfolio"}
        </button>
      </div>

      {editing ? (
        <div className="glass rounded-3xl p-6 lg:p-8">
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
        <div className="glass rounded-3xl p-12 text-center text-gray-500 text-sm">Loading…</div>
      ) : images.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center text-gray-500 text-sm">
          No builds in your portfolio yet. Click <strong>Manage portfolio</strong> to add some.
        </div>
      ) : (
        <div className="portfolio-scroll-wrapper fade-edges -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          {/* pt-3/pb-3: a horizontal scroller forces its vertical axis to `auto`
              overflow, which would otherwise clip a card's hover lift
              (related-card translateY) and crowd the image against the
              scrollbar. The vertical padding gives the lift, glow and scrollbar
              room so nothing is cut off — on mobile especially. */}
          <div className="portfolio-scroll flex gap-4 overflow-x-auto pt-3 pb-3 snap-x snap-mandatory">
            {images.map((img) => (
              <div key={img.id} className="snap-start portfolio-card related-card glass rounded-2xl overflow-hidden flex-shrink-0">
                <div className="relative aspect-[16/10] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt || ""} className="w-full h-full object-cover" loading="lazy" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Account actions + danger zone ───────────────────────────────────────────
function AccountActionsSection() {
  const { user, profile, signOut } = useAuth();
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
          ? "Account deletion isn't enabled on the database yet. Run Supabase migration 0006 (delete_own_account), then try again."
          : err.message || "Couldn't delete your account. Please try again."
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
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <h2 className="font-bold text-xl mb-1">Account</h2>
      <p className="text-xs text-gray-500 mb-5">Quick links and account controls.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a
          href={withBase("/builders")}
          className="py-3 px-4 text-sm font-medium rounded-2xl border border-white/15 hover:border-white/40 transition-all ghost-btn text-center"
        >
          Browse builders
        </a>
        <a
          href={withBase("/")}
          className="py-3 px-4 text-sm font-medium rounded-2xl border border-white/15 hover:border-white/40 transition-all ghost-btn text-center"
        >
          Back to home
        </a>
        <button
          type="button"
          onClick={() => signOut()}
          className="py-3 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-2xl border border-white/15 text-gray-200 hover:border-white/40 hover:bg-white/5 transition-all"
        >
          <Icon name="logout" size={16} />
          Log out
        </button>
      </div>

      {/* Danger zone */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-red-400/25 bg-red-500/[0.06] p-5">
          <div className="min-w-0">
            <h3 className="font-semibold text-red-200 text-sm">Delete account</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-md leading-relaxed">
              Permanently remove your account and everything tied to it — profile,
              availability, portfolio and conversations. This can&apos;t be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={openConfirm}
            className="flex-shrink-0 py-2.5 px-5 text-sm font-semibold rounded-full bg-red-500/15 text-red-200 border border-red-400/40 hover:bg-red-500/25 hover:border-red-400/60 transition-all disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-gray-600"
          >
            Delete account
          </button>
        </div>
      </div>

      {/* Confirmation modal — portaled to <body> so it escapes the .glass
          ancestor (whose backdrop-filter would otherwise become the containing
          block for this fixed overlay, breaking full-screen centering/dimming). */}
      {confirmOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={closeConfirm}
          />
          <div className="relative glass rounded-3xl p-6 sm:p-8 w-full max-w-md detail-fade-up shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-400/30 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 id="delete-account-title" className="text-xl font-bold mb-2">
              Delete your account?
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-5">
              This permanently deletes your BuildEx account and all associated data —
              profile, availability, portfolio images and conversations.{" "}
              <strong className="text-red-200">This action cannot be undone.</strong>
            </p>
            <label htmlFor="confirm-delete" className="onb-label block mb-2">
              Type <span className="text-red-200 font-bold">DELETE</span> to confirm
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
                className="px-4 py-2 rounded-full text-sm font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || !canDelete}
                className="px-5 py-2 rounded-full text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {deleting && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {deleting ? "Deleting…" : "Delete account"}
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
  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState(profile?.username || "");
  const [handleValid, setHandleValid] = useState(Boolean(profile?.username));
  const savedContact = readContactLinks(builderProfile?.contact_links);
  const [contactType, setContactType] = useState(savedContact.type || "discord");
  const [contactValue, setContactValue] = useState(savedContact.value || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const trimmedName = displayName.trim();
  const nameValid =
    trimmedName.length >= DISPLAY_NAME_MIN && trimmedName.length <= DISPLAY_NAME_MAX;
  const contactProblem = contactValue.trim()
    ? contactLinkError(contactType, contactValue)
    : null;
  const canSave = nameValid && handleValid && !!handle && !contactProblem;

  const specialties = builderProfile?.specialties || [];
  const savedContactMeta = savedContact.type ? contactLinkTypeMeta(savedContact.type) : null;
  const savedContactHref = savedContact.type
    ? contactLinkHref(savedContact.type, savedContact.value)
    : null;

  function startEdit() {
    setAvatarUrl(profile?.avatar_url || null);
    setDisplayName(profile?.display_name || "");
    setHandle(profile?.username || "");
    setHandleValid(Boolean(profile?.username));
    const contact = readContactLinks(builderProfile?.contact_links);
    setContactType(contact.type || "discord");
    setContactValue(contact.value || "");
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
    if (isBuilder) {
      payload.contactLinkType = contactType;
      payload.contactLinkValue = contactValue.trim();
    }
    const { error: err } = await saveBuilderIdentity(supabase, user.id, payload);
    setSaving(false);
    if (err) {
      if (err.code === "23505" || /duplicate|unique/i.test(err.message || "")) {
        setError("That handle was just taken. Try another one.");
        setHandleValid(false);
      } else {
        setError(err.message || "Couldn't save.");
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
    <header className="glass rounded-3xl p-6 sm:p-8 mb-8 detail-fade-up">
      <div className="flex flex-col sm:flex-row gap-6 items-start">
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
            <>
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || ""}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover ring-2 ring-[#4ade80]/30 shadow-xl"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-[#4ade80]/15 border border-[#4ade80]/40 ring-2 ring-[#4ade80]/30 flex items-center justify-center text-[#4ade80] font-bold text-4xl">
                  {(profile?.display_name || "B").charAt(0).toUpperCase()}
                </div>
              )}
            </>
          )}
        </div>

        {/* Identity */}
        <div className="w-full sm:w-auto sm:flex-1 min-w-0 text-center sm:text-left">
          {editing ? (
            <div className="space-y-4 text-left">
              <div>
                <label htmlFor="acc-display-name" className="onb-label block mb-2">
                  Your name
                </label>
                <input
                  id="acc-display-name"
                  type="text"
                  className={`onb-input ${
                    displayName && !nameValid ? "is-error" : nameValid ? "is-success" : ""
                  }`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
                  maxLength={DISPLAY_NAME_MAX}
                  placeholder="Your name"
                  autoComplete="off"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  Shown big on your profile. {trimmedName.length}/{DISPLAY_NAME_MAX}
                </p>
              </div>
              <HandleInput
                value={handle}
                onChange={setHandle}
                currentUserId={user?.id}
                onValidityChange={setHandleValid}
                label="Your @nickname"
                hint="Unique to you — used in your profile URL, mentions and DMs."
              />
              {isBuilder && (
                <ContactLinkField
                  type={contactType}
                  value={contactValue}
                  onTypeChange={setContactType}
                  onValueChange={setContactValue}
                  label="Where else can clients reach you?"
                  hint="Shown publicly on your profile. Clear it to remove it."
                />
              )}
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1.5 mb-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight break-words min-w-0">
              {profile?.display_name || "Your name"}
            </h2>
            {isBuilder && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] flex-shrink-0" />
                Builder
              </span>
            )}
          </div>

          {profile?.username && (
            <p className="text-sm text-gray-500 mb-3 break-all">@{profile.username}</p>
          )}

          {isBuilder && savedContactMeta && (
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-gray-400 mb-4">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Icon name={savedContactMeta.icon} size={14} className="text-gray-500 flex-shrink-0" />
                {/* Rendered as text unless the stored value really is an https
                    URL; contactLinkHref returns null for a bare handle so a
                    handle can never become an anchor. */}
                {savedContactHref ? (
                  <a
                    href={savedContactHref}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="truncate hover:text-[#4ade80] transition-colors"
                  >
                    {contactLinkText(savedContact.type, savedContact.value)}
                  </a>
                ) : (
                  <span className="truncate">
                    {contactLinkText(savedContact.type, savedContact.value)}
                  </span>
                )}
              </span>
            </div>
          )}

          {isBuilder && specialties.length > 0 && (
            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              {specialties.map((s) => (
                <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400 capitalize">
                  {s}
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
                className="px-4 py-2 rounded-full text-xs font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !canSave}
                className="px-4 py-2 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {saving && (
                  <span className="w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />
                )}
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="px-3 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
            >
              <IconPencil className="w-3.5 h-3.5" />
              Edit profile
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
  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8 border border-[#4ade80]/20">
      <p className="text-xs uppercase tracking-[0.18em] text-[#4ade80]/80">Build for others</p>
      <h2 className="font-bold text-xl mt-1">Create a builder profile</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-relaxed">
        Get listed in the builders directory so server owners can find you and message
        you directly. Three steps: your name and avatar, the styles you build in, and
        a few photos of your work. It takes a couple of minutes and nothing is
        permanent — you can edit or remove it later.
      </p>
      <Link
        href={BUILDER_ONBOARDING_START}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4ade80] text-black text-sm font-bold transition-[transform,background-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#86efac] hover:shadow-[0_8px_20px_rgba(74,222,128,0.22)]"
      >
        Create a builder profile
        <Icon name="hammer" size={16} />
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
          <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        </main>
      }
    >
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  useRequireAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    status,
    user,
    profile: authProfile,
    profileLoaded,
    refresh: refreshAuthProfile,
  } = useAuth();

  const [theme, setTheme] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
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

  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);
  const isLight = theme === "light";

  // True once the main content (which mounts the gradient divs) is rendered.
  // Flips false→true a single time, so the gradient effect below starts only
  // after its target divs exist — and doesn't restart on later profile swaps.
  const contentReady = status !== "loading" && !!profile;

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

  const showSoon = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!theme) return;
    const html = document.documentElement;
    html.classList.toggle("light", isLight);
    html.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  // Animated gradient background (matches the rest of the site)
  useEffect(() => {
    const gradientBg = gradientRef.current;
    const edgeGlow = edgeGlowRef.current;
    if (!gradientBg || !edgeGlow || window.getComputedStyle(gradientBg).display === "none") return;

    const cfg = {
      edgeOffset: 12, speed: 1, smoothing: 0.08,
      idleDrift: 0.00003, swayAmp: 0.015, swaySpeed: 0.0004,
    };
    let cp1 = 0, cp2 = 0.5, tp1 = 0, tp2 = 0.5;
    let lastScroll = window.pageYOffset;
    let raf = 0;
    function periToXY(p, off) {
      const pp = ((p % 1) + 1) % 1;
      const seg = pp * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0:  return { x: off + sp * (100 - off * 2), y: off };
        case 1:  return { x: 100 - off, y: off + sp * (100 - off * 2) };
        case 2:  return { x: 100 - off - sp * (100 - off * 2), y: 100 - off };
        default: return { x: off, y: 100 - off - sp * (100 - off * 2) };
      }
    }
    function tick(ts) {
      const sy = window.pageYOffset;
      const delta = sy - lastScroll;
      if (Math.abs(delta) > 0) {
        tp1 += delta * 0.0008 * cfg.speed;
        tp2 -= delta * 0.0006 * cfg.speed;
      }
      tp1 += cfg.idleDrift;
      tp2 -= cfg.idleDrift * 0.7;
      lastScroll = sy;
      tp1 = ((tp1 % 1) + 1) % 1;
      tp2 = ((tp2 % 1) + 1) % 1;
      let d1 = tp1 - cp1; if (d1 > 0.5) d1 -= 1; if (d1 < -0.5) d1 += 1;
      let d2 = tp2 - cp2; if (d2 > 0.5) d2 -= 1; if (d2 < -0.5) d2 += 1;
      cp1 += d1 * cfg.smoothing;
      cp2 += d2 * cfg.smoothing;
      const sw1 = Math.sin(ts * cfg.swaySpeed) * cfg.swayAmp;
      const sw2 = Math.cos(ts * cfg.swaySpeed * 1.3) * cfg.swayAmp * 0.8;
      const p1 = periToXY(cp1 + sw1, cfg.edgeOffset);
      const p2 = periToXY(cp2 + sw2, cfg.edgeOffset + 3);
      gradientBg.style.setProperty("--gradient-x", `${p1.x}%`);
      gradientBg.style.setProperty("--gradient-y", `${p1.y}%`);
      gradientBg.style.setProperty("--gradient-x2", `${p2.x}%`);
      gradientBg.style.setProperty("--gradient-y2", `${p2.y}%`);
      const breathe = 1 + Math.sin(ts * 0.0003) * 0.12;
      edgeGlow.style.opacity = `${0.45 + breathe * 0.2}`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [contentReady]);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); obs.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [profile, builderProfile, section]);

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
        <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-3xl p-8 sm:p-10 border border-red-400/30 text-center max-w-md">
          <div className="w-12 h-12 mx-auto mb-5 rounded-2xl bg-red-500/15 border border-red-400/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-xl font-semibold mb-2">Couldn&apos;t load your profile</div>
          <p className="text-gray-400 text-sm mb-6">
            {loadError || "We hit a snag fetching your account. Please try again."}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="inline-block px-6 py-3 bg-[#4ade80] text-black font-semibold rounded-full green-glow hover:scale-105 transition-all"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className={`builder-profile-root ${isLight ? "light" : ""} catalog-root min-h-screen flex flex-col`}>
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

      <CatalogNavbar
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showSoon}
      />
      <CatalogMobileMenu
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showSoon}
      />

      <div
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-none transition-all duration-500 ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="glass catalog-toast rounded-2xl px-5 py-3 text-sm font-medium text-[#4ade80] flex items-center gap-2 shadow-2xl max-w-sm text-center">
          <span className="text-[#4ade80] flex-shrink-0">✦</span>
          <span>{toast}</span>
        </div>
      </div>

      <main className="relative z-10 pt-24 lg:pt-28 pb-20 flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page intro */}
          <div className="mb-6 detail-fade-up">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4ade80]/80 mb-1.5">
              Profile settings
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight logo-font">
              Your profile
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              {isBuilder
                ? "Manage how you appear across BuildEx — your identity, styles and portfolio."
                : "Manage your account details and how you appear to the builders you message."}
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

              <div className="space-y-8">
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
            <div className="space-y-8">
              <AccountActionsSection />
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
