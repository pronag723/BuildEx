"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRequireAuth } from "../../lib/auth/useRequireAuth";
import { useAuth } from "../../lib/auth/AuthContext";
import { getSupabaseClient } from "../../lib/supabase/client";
import {
  fetchOnboardingState,
  listPortfolioImages,
  saveBuilderExpertise,
  saveBuilderIdentity,
  saveBuilderStyles,
  saveClientProfile,
} from "../../lib/onboarding/api";
import {
  AVAILABILITY_STATES,
  BIO_MAX,
  BUILD_TYPES,
  BUILDER_TOOLS,
  CLIENT_INTEREST_STYLES,
  PROJECT_TYPES,
  RESPONSE_TIMES,
  SERVER_TYPES,
  STYLES,
} from "../../lib/onboarding/constants";
import { RANKS } from "../builders/data/builders";
import { withBase } from "../home/utils";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import SiteFooter from "../home/components/SiteFooter";
import AvatarUploader from "../onboarding/components/AvatarUploader";
import BannerUploader from "../onboarding/components/BannerUploader";
import ChipGrid from "../onboarding/components/ChipGrid";
import PortfolioUploader from "../onboarding/components/PortfolioUploader";

const TAGLINE_MAX = 80;

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

// ─── About / bio (shared) ────────────────────────────────────────────────────
function AboutSection({ profile, builderProfile, isBuilder, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(profile?.bio || "");
  const [tagline, setTagline] = useState(builderProfile?.tagline || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setBio(profile?.bio || "");
    setTagline(builderProfile?.tagline || "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    setError(null);
    const payload = {
      avatarUrl: profile?.avatar_url ?? null,
      bannerUrl: profile?.banner_url ?? null,
      bio: bio.trim() || null,
    };
    const { error: err } = isBuilder
      ? await saveBuilderIdentity(supabase, user.id, {
          ...payload,
          tagline: tagline.trim() || null,
        })
      : await saveClientProfile(supabase, user.id, {
          ...payload,
          interests: profile?.interests || [],
          serverType: profile?.preferred_server_type ?? null,
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
          {isBuilder && (
            <div>
              <label htmlFor="acc-tagline" className="onb-label block mb-2">Tagline</label>
              <input
                id="acc-tagline"
                type="text"
                className="onb-input"
                placeholder="Master spawn builder — medieval & fantasy specialist"
                value={tagline}
                onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX))}
                maxLength={TAGLINE_MAX}
              />
              <p className="mt-2 text-xs text-gray-500">{tagline.length}/{TAGLINE_MAX}</p>
            </div>
          )}
          <div>
            <label htmlFor="acc-bio" className="onb-label block mb-2">Bio</label>
            <textarea
              id="acc-bio"
              className="onb-input onb-textarea"
              placeholder={
                isBuilder
                  ? "Share your story, what you love building, the kind of projects you take on…"
                  : "Tell builders what kind of work you're hiring for."
              }
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
          {isBuilder && builderProfile?.tagline && (
            <p className="text-sm text-[#4ade80] font-semibold">{builderProfile.tagline}</p>
          )}
          {profile?.bio ? (
            <p className="text-gray-400 leading-relaxed">{profile.bio}</p>
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

// ─── Specialties (builders) ─────────────────────────────────────────────────
function SpecialtiesSection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [specialties, setSpecialties] = useState(builderProfile?.specialties || []);
  const [buildTypes, setBuildTypes] = useState(builderProfile?.build_types || []);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setSpecialties(builderProfile?.specialties || []);
    setBuildTypes(builderProfile?.build_types || []);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const { error: err } = await saveBuilderStyles(supabase, user.id, {
      specialties,
      buildTypes,
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const canSave = specialties.length >= 1 && buildTypes.length >= 1;
  const savedSpecs = builderProfile?.specialties || [];
  const savedTypes = builderProfile?.build_types || [];

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Specialties"
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
          <div>
            <div className="onb-label mb-3">Build types</div>
            <ChipGrid
              options={BUILD_TYPES}
              value={buildTypes}
              onChange={setBuildTypes}
              multi
              ariaLabel="Build types"
            />
          </div>
          {!canSave && (
            <p className="text-xs text-gray-500">
              Pick at least one style and one build type.
            </p>
          )}
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Styles</p>
            {savedSpecs.length === 0 ? (
              <p className="text-gray-500 text-sm italic">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedSpecs.map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Build types</p>
            {savedTypes.length === 0 ? (
              <p className="text-gray-500 text-sm italic">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedTypes.map((t) => (
                  <span key={t} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Expertise (builders) ───────────────────────────────────────────────────
function ExpertiseSection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);

  function pickResponse(hours) {
    if (hours == null) return null;
    return (RESPONSE_TIMES.find((r) => r.hours >= hours) || RESPONSE_TIMES.at(-1))?.key || null;
  }

  const [tools, setTools] = useState(builderProfile?.tools || []);
  const [projectTypes, setProjectTypes] = useState(builderProfile?.project_types || []);
  const [responseKey, setResponseKey] = useState(pickResponse(builderProfile?.response_time_hours));
  const [availability, setAvailability] = useState(builderProfile?.availability_status || "available");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setTools(builderProfile?.tools || []);
    setProjectTypes(builderProfile?.project_types || []);
    setResponseKey(pickResponse(builderProfile?.response_time_hours));
    setAvailability(builderProfile?.availability_status || "available");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const responseTimeHours = RESPONSE_TIMES.find((r) => r.key === responseKey)?.hours ?? null;
    const { error: err } = await saveBuilderExpertise(supabase, user.id, {
      tools,
      projectTypes,
      responseTimeHours,
      availabilityStatus: availability,
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const savedTools = builderProfile?.tools || [];
  const respLabel = RESPONSE_TIMES.find(
    (r) => r.key === pickResponse(builderProfile?.response_time_hours)
  )?.label;
  const availMeta = AVAILABILITY_STATES.find(
    (a) => a.key === (builderProfile?.availability_status || "available")
  );

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Tools & availability"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
        canSave={tools.length >= 1 && !!responseKey}
      />

      {editing ? (
        <div className="space-y-6">
          <div>
            <div className="onb-label mb-3">Tools used</div>
            <ChipGrid
              options={BUILDER_TOOLS}
              value={tools}
              onChange={setTools}
              multi
            />
          </div>
          <div>
            <div className="onb-label mb-3">Project types</div>
            <ChipGrid
              options={PROJECT_TYPES}
              value={projectTypes}
              onChange={setProjectTypes}
              multi
            />
          </div>
          <div>
            <div className="onb-label mb-3">Response time</div>
            <ChipGrid
              options={RESPONSE_TIMES}
              value={responseKey}
              onChange={setResponseKey}
              multi={false}
            />
          </div>
          <div>
            <div className="onb-label mb-3">Availability</div>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY_STATES.map((opt) => {
                const active = availability === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setAvailability(opt.key)}
                    className={`availability-pill ${active ? "is-active" : ""}`}
                  >
                    <span className="availability-dot" style={{ background: opt.dot, boxShadow: `0 0 10px ${opt.dot}` }} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Tools used</p>
            {savedTools.length === 0 ? (
              <p className="text-sm text-gray-500 italic">None selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedTools.map((k) => {
                  const meta = BUILDER_TOOLS.find((t) => t.key === k);
                  return (
                    <span key={k} className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300">
                      {meta?.emoji} {meta?.label || k}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Response time</p>
            <p className="text-sm text-gray-200">{respLabel || "Not set"}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Availability</p>
            {availMeta && (
              <p className="text-sm text-gray-200 inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: availMeta.dot, boxShadow: `0 0 10px ${availMeta.dot}` }} />
                {availMeta.label}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Open to</p>
            {(builderProfile?.project_types || []).length === 0 ? (
              <p className="text-sm text-gray-500 italic">Nothing selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(builderProfile?.project_types || []).map((k) => {
                  const meta = PROJECT_TYPES.find((p) => p.key === k);
                  return (
                    <span key={k} className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300">
                      {meta?.emoji} {meta?.label || k}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="glass rounded-2xl overflow-hidden aspect-[16/10] relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || ""} className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Client preferences ─────────────────────────────────────────────────────
function ClientPreferencesSection({ profile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [interests, setInterests] = useState(profile?.interests || []);
  const [serverType, setServerType] = useState(profile?.preferred_server_type || null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setInterests(profile?.interests || []);
    setServerType(profile?.preferred_server_type || null);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const { error: err } = await saveClientProfile(supabase, user.id, {
      avatarUrl: profile?.avatar_url ?? null,
      bannerUrl: profile?.banner_url ?? null,
      bio: profile?.bio ?? null,
      interests,
      serverType,
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const savedServer = SERVER_TYPES.find((s) => s.key === profile?.preferred_server_type);

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Preferences"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
      />

      {editing ? (
        <div className="space-y-6">
          <div>
            <div className="onb-label mb-3">Favorite styles</div>
            <ChipGrid options={CLIENT_INTEREST_STYLES} value={interests} onChange={setInterests} multi />
          </div>
          <div>
            <div className="onb-label mb-3">Preferred server type</div>
            <ChipGrid options={SERVER_TYPES} value={serverType} onChange={setServerType} multi={false} />
          </div>
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Favorite styles</p>
            {(profile?.interests || []).length === 0 ? (
              <p className="text-gray-500 text-sm italic">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(profile?.interests || []).map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Server type</p>
            {savedServer ? (
              <p className="text-sm text-gray-200">{savedServer.emoji} {savedServer.label}</p>
            ) : (
              <p className="text-gray-500 text-sm italic">Not set.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Hero header (banner + avatar + name) ───────────────────────────────────
function AccountHeader({ profile, builderProfile, onSaved }) {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [bannerUrl, setBannerUrl] = useState(profile?.banner_url || null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const role = profile?.role;
  const isBuilder = role === "builder" || role === "both";
  // Builders carry a rank (rookie → master); show it instead of a bare "builder".
  const rankMeta = isBuilder ? RANKS[builderProfile?.rank] || RANKS.rookie : null;

  function startEdit() {
    setAvatarUrl(profile?.avatar_url || null);
    setBannerUrl(profile?.banner_url || null);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const payload = {
      avatarUrl,
      bannerUrl,
      bio: profile?.bio ?? null,
    };
    const { error: err } = isBuilder
      ? await saveBuilderIdentity(supabase, user.id, payload)
      : await saveClientProfile(supabase, user.id, {
          ...payload,
          interests: profile?.interests || [],
          serverType: profile?.preferred_server_type ?? null,
        });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    // Push the new avatar/banner into AuthContext right away so the navbar
    // avatar updates immediately instead of waiting on the background re-fetch.
    updateProfile?.({ avatar_url: avatarUrl ?? null, banner_url: bannerUrl ?? null });
    setEditing(false);
    await onSaved?.();
  }

  return (
    <header className="glass rounded-3xl overflow-hidden mb-8 detail-fade-up">
      {/* Banner */}
      <div className="relative">
        {editing ? (
          <div className="p-5">
            <BannerUploader
              userId={user?.id}
              value={bannerUrl}
              onChange={setBannerUrl}
              onError={setError}
            />
          </div>
        ) : profile?.banner_url ? (
          <div className="aspect-[5/1.6] sm:aspect-[6/1.5] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="aspect-[5/1.6] sm:aspect-[6/1.5] w-full bg-gradient-to-br from-[#4ade80]/15 via-white/[0.04] to-transparent" />
        )}
      </div>

      <div className="p-6 sm:p-8 -mt-12 sm:-mt-16 relative">
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">
          <div className="relative flex-shrink-0">
            {editing ? (
              <AvatarUploader
                userId={user?.id}
                value={avatarUrl}
                onChange={setAvatarUrl}
                onError={setError}
                fallbackInitial={(profile?.display_name || "B").charAt(0).toUpperCase()}
                size={112}
              />
            ) : profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.display_name || ""}
                className="w-28 h-28 rounded-3xl object-cover ring-4 ring-[#1a1a1a] shadow-xl"
              />
            ) : (
              <div className="w-28 h-28 rounded-3xl bg-[#4ade80]/15 border border-[#4ade80]/40 ring-4 ring-[#1a1a1a] flex items-center justify-center text-[#4ade80] font-bold text-4xl">
                {(profile?.display_name || "B").charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-2 sm:pt-0">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight logo-font leading-tight">
              {profile?.display_name || "Your name"}
            </h1>
            {role && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {rankMeta && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${rankMeta.bgClass} ${rankMeta.textClass} ${rankMeta.borderClass}`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: rankMeta.dotColor }}
                    />
                    {rankMeta.label} {role === "both" ? "Builder & Client" : "Builder"}
                  </span>
                )}
                {!rankMeta && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80] capitalize">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                    {role}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-end">
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
                  disabled={saving}
                  className="px-4 py-2 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
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
                Edit cover &amp; avatar
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="auth-banner auth-banner-error mt-4">
            {error}
          </div>
        )}
      </div>
    </header>
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
  const {
    status,
    user,
    profile: authProfile,
    profileLoaded,
    signOut,
    refresh: refreshAuthProfile,
  } = useAuth();

  const [theme, setTheme] = useState("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
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
    const saved = window.localStorage.getItem("theme") || "dark";
    setTheme(saved);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("light", isLight);
    html.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  // Animated gradient background (matches the rest of the site)
  useEffect(() => {
    const gradientBg = gradientRef.current;
    const edgeGlow = edgeGlowRef.current;
    if (!gradientBg || !edgeGlow) return;

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
  }, []);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); obs.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [profile, builderProfile]);

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

  const role = profile.role;
  const isBuilder = role === "builder" || role === "both";
  const isClient = role === "client" || role === "both";

  return (
    <div className={`builder-profile-root ${isLight ? "light" : ""} catalog-root`}>
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

      <main className="relative z-10 pt-24 lg:pt-28 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <AccountHeader profile={profile} builderProfile={builderProfile} onSaved={refresh} />

          <div className="space-y-8">
            <AboutSection
              profile={profile}
              builderProfile={builderProfile}
              isBuilder={isBuilder}
              onSaved={refresh}
            />

            {isBuilder && (
              <>
                <PortfolioSection portfolioCount={portfolioCount} onSaved={refresh} />
                <SpecialtiesSection builderProfile={builderProfile} onSaved={refresh} />
                <ExpertiseSection builderProfile={builderProfile} onSaved={refresh} />
              </>
            )}

            {isClient && !isBuilder && (
              <ClientPreferencesSection profile={profile} onSaved={refresh} />
            )}

            {/* Account actions */}
            <section className="reveal glass rounded-3xl p-6 lg:p-8">
              <h2 className="font-bold text-xl mb-4">Account</h2>
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
                  className="py-3 px-4 text-sm font-semibold rounded-2xl bg-red-500/15 text-red-200 border border-red-400/30 hover:bg-red-500/25 transition-all"
                >
                  Log out
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
