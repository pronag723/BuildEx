"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Toast from "../../../components/Toast";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { useT } from "../../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../../lib/i18n/serverText.mjs";
import { styleChipLabel } from "../../../../lib/i18n/labels.mjs";
import { Icon } from "../../../../lib/icons";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { saveBuilderIdentity, saveBuilderStyles, saveHeaderBackground } from "../../../../lib/onboarding/api";
import { BUCKETS } from "../../../../lib/onboarding/constants";
import { hasHeaderBg, storagePathFromUrl } from "../../../../lib/profile/headerBg.mjs";
import { CONTACT_LINKS_MAX, buildContactLinks, readContactLinks } from "../../../../lib/onboarding/contactLinks";
import { fetchPriceTiers } from "../../../../lib/works/api";
import { deleteWork, fetchMyWorks, saveWorksLayout } from "../../../../lib/works/edit";
import { fetchBuilderStats } from "../../../../lib/works/engagement";
import { DESKTOP_QUERY, useMediaQuery } from "../../../../lib/ui/useMediaQuery";
import ConfirmDialog from "../../../../lib/ui/ConfirmDialog";
import YearPicker from "../../../../lib/ui/YearPicker";
import { fetchBuilderById } from "../../../builders/data/fetchBuilders";
import SocialLinks from "../../../builders/components/SocialLinks";
import ProfileHeader from "../../../builders/profile/[username]/components/ProfileHeader";
import ProfileTabs from "../../../builders/profile/[username]/components/ProfileTabs";
import ReviewsPanel from "../../../builders/profile/[username]/components/ReviewsPanel";
import WorksMosaic, { WorksMosaicSkeleton } from "../../../builders/profile/[username]/components/WorksMosaic";
import HeaderBackground from "../../../builders/profile/[username]/components/HeaderBackground";
import { presenceLabel } from "../../../builders/profile/[username]/components/profileText";
import WorkEditor from "../../../onboarding/components/WorkEditor";
import PriceTiersEditor from "../../../onboarding/components/PriceTiersEditor";
import EditZone, { PenGlyph } from "./EditZone";
import EditableAvatar from "./EditableAvatar";
import HeaderBackgroundPicker from "./HeaderBackgroundPicker";
import { BioEditor, NameEditor, StylesEditor } from "./InlineEditors";
import LinkEditor from "./LinkEditor";
import OwnerSidebar from "./OwnerSidebar";

const TOAST_MS = 2600;

const bgKey = (bg) => (bg ? [bg.kind, bg.color, bg.imageUrl, bg.dim].join("|") : "");

const layoutKey = (works) => (works || []).map((w) => `${w.id}:${w.layoutSize}`).join(",");

function Presence({ builder, className = "" }) {
  const t = useT();
  const presence = presenceLabel(builder.online, builder.last_seen_at, t);
  if (!presence) return null;
  return (
    <span className={`items-center gap-1.5 text-[13px] lg:text-[13.5px] ${builder.online ? "text-accent-ink" : "text-ink-2"} ${className}`}>
      <span className={`h-[7px] w-[7px] rounded-full ${builder.online ? "bg-accent" : "bg-line/30"}`} aria-hidden="true" />
      {presence}
    </span>
  );
}

function EditorSkeleton() {
  return (
    <div aria-busy="true">
      <div className="flex items-center gap-5 lg:gap-7">
        <div className="h-[86px] w-[86px] rounded-[22px] skeleton lg:h-[120px] lg:w-[120px] lg:rounded-[30px]" />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-48 max-w-full rounded skeleton" />
          <div className="h-4 w-64 max-w-full rounded skeleton" />
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <WorksMosaicSkeleton />
        <div className="hidden h-64 rounded-xl skeleton lg:block" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The builder's own profile, edited in place: the public profile's layout
// (ProfileHeader, ProfileTabs, WorksMosaic) with every block editable. There
// is no preview mode — what the builder sees here is what visitors see, minus
// the visitor actions (message, save, share) and the counters.
//
// One inline editor is open at a time (`editing`); each saves on Done and
// patches the local copy of the profile, so the page never reloads under the
// builder. `tabs` is the account page's Profile | Account switcher, which sits
// in this page's top row.
// ─────────────────────────────────────────────────────────────────────────────
export default function OwnerProfileEditor({ tabs, onSaved }) {
  const t = useT();
  const { user, updateProfile } = useAuth();
  const userId = user?.id || null;
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const [builder, setBuilder] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [works, setWorks] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState("works");
  // "name" | "bio" | "styles" | "link:<type>" | "link:new" | "bg" | null
  const [editing, setEditing] = useState(null);
  const [arranging, setArranging] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [workEditor, setWorkEditor] = useState(null); // a work, or "new"
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const [toast, setToast] = useState(null);
  const savedLayout = useRef("");
  // The background being picked, shown live; saved when the picker closes.
  const [bgDraft, setBgDraft] = useState(null);
  // Images uploaded while picking, so the ones that weren't kept get removed.
  const bgUploads = useRef(new Set());

  // ─── Loading ──────────────────────────────────────────────────────────────
  const loadBuilder = useCallback(async () => {
    if (!userId) return;
    setLoadFailed(false);
    const { builder: row, error } = await fetchBuilderById(userId);
    if (error || !row) {
      setLoadFailed(true);
      return;
    }
    setBuilder(row);
  }, [userId]);

  const loadWorks = useCallback(async () => {
    if (!userId) return;
    const { works: rows, error } = await fetchMyWorks(userId);
    if (error) setToast(serverMessage(error, "account.works.loadFailed"));
    setWorks(rows);
    savedLayout.current = layoutKey(rows);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadBuilder();
    loadWorks();
    fetchPriceTiers(userId).then(({ tiers: rows }) => setTiers(rows));
    fetchBuilderStats(userId).then(({ stats: next }) => setStats(next));
  }, [userId, loadBuilder, loadWorks]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  // ─── Saving the header blocks ─────────────────────────────────────────────
  const patch = (next) => setBuilder((b) => (b ? { ...b, ...next } : b));

  const saved = () => {
    setEditing(null);
    setToast(t("account.editor.saved"));
    onSaved?.();
  };

  // Each resolves to an error message for the open editor, or null.
  const saveIdentity = async (payload) => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return t("account.errors.saveFailed");
    const { error } = await saveBuilderIdentity(supabase, userId, payload);
    if (!error) return null;
    if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
      return t("onboarding.errors.handleTaken");
    }
    return serverMessage(error, "account.errors.saveFailed");
  };

  const saveName = async ({ name, handle }) => {
    const error = await saveIdentity({ displayName: name, handle });
    if (error) return error;
    updateProfile?.({ display_name: name, username: handle });
    patch({ display_name: name, username: handle });
    saved();
    return null;
  };

  const saveAvatar = async (url) => {
    const error = await saveIdentity({ avatarUrl: url });
    if (error) {
      setToast(error);
      return;
    }
    updateProfile?.({ avatar_url: url });
    patch({ avatar: url });
    saved();
  };

  const saveBio = async (bio) => {
    const error = await saveIdentity({ bio });
    if (error) return error;
    updateProfile?.({ bio });
    patch({ bio: bio || "" });
    saved();
    return null;
  };

  const saveYear = async (year) => {
    const before = builder.building_since;
    patch({ building_since: year });
    const error = await saveIdentity({ buildingSince: year });
    if (error) {
      patch({ building_since: before });
      setToast(error);
      return;
    }
    saved();
  };

  const saveStyles = async (list) => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return t("account.errors.saveFailed");
    const { error } = await saveBuilderStyles(supabase, userId, { specialties: list });
    if (error) return serverMessage(error, "account.errors.saveFailed");
    patch({ specialties: list, styles: list });
    saved();
    return null;
  };

  // ─── Header background ────────────────────────────────────────────────────
  const removeBgFiles = (urls) => {
    const supabase = getSupabaseClient();
    const paths = urls.map((url) => storagePathFromUrl(url, userId)).filter(Boolean);
    if (supabase && paths.length) supabase.storage.from(BUCKETS.portfolios).remove(paths);
  };

  // Uploaded this time but not what the profile ended up with.
  const dropUnusedUploads = (keep) => {
    const unused = [...bgUploads.current].filter((url) => url !== keep);
    bgUploads.current.clear();
    removeBgFiles(unused);
  };

  const openBg = () => {
    setBgDraft(builder.headerBg);
    setEditing("bg");
  };

  const closeBg = async () => {
    const draft = bgDraft;
    const before = builder.headerBg;
    setEditing((current) => (current === "bg" ? null : current));
    setBgDraft(null);
    if (!draft || bgKey(draft) === bgKey(before)) {
      dropUnusedUploads(before.imageUrl);
      return;
    }
    patch({ headerBg: draft });
    const { error } = await saveHeaderBackground(getSupabaseClient(), userId, draft);
    if (error) {
      patch({ headerBg: before });
      dropUnusedUploads(before.imageUrl);
      // No header_bg_* columns yet: migration 0110 hasn't run.
      setToast(
        error.code === "PGRST204" || error.code === "42703"
          ? t("account.editor.bg.notReady")
          : serverMessage(error, "account.errors.saveFailed")
      );
      return;
    }
    dropUnusedUploads(draft.imageUrl);
    if (before.imageUrl && before.imageUrl !== draft.imageUrl) removeBgFiles([before.imageUrl]);
    setToast(t("account.editor.saved"));
    onSaved?.();
  };

  // ─── Contact links ────────────────────────────────────────────────────────
  const links = builder ? readContactLinks(builder.contact_links) : [];
  const editingType = editing?.startsWith("link:") ? editing.slice(5) : null;
  const editingLink = editingType && editingType !== "new" ? links.find((l) => l.type === editingType) || null : null;

  // next: { type, value } for the open link, or null to delete it.
  const saveLink = async (next) => {
    let rows = links.map(({ type, value }) => ({ type, value }));
    if (editingLink) {
      rows = next ? rows.map((r) => (r.type === editingLink.type ? next : r)) : rows.filter((r) => r.type !== editingLink.type);
    } else if (next) {
      rows = [...rows, next];
    }
    const error = await saveIdentity({ contactLinks: rows });
    if (error) return error;
    patch({ contact_links: buildContactLinks(rows) });
    saved();
    return null;
  };

  const linkEditor = editingType ? (
    <LinkEditor
      key={editing}
      className="mt-2.5"
      link={editingLink}
      taken={links.map((l) => l.type)}
      onSave={saveLink}
      onCancel={() => setEditing(null)}
    />
  ) : null;

  // ─── Works ────────────────────────────────────────────────────────────────
  const startArrange = () => {
    setEditing(null);
    savedLayout.current = layoutKey(works);
    setArranging(true);
  };

  // Done: order and sizes in one call. Nothing moved, nothing written.
  const finishArrange = async () => {
    if (savingLayout) return false;
    if (layoutKey(works) === savedLayout.current) {
      setArranging(false);
      return true;
    }
    setSavingLayout(true);
    const { error, sizesSaved } = await saveWorksLayout(
      works.map((w) => w.id),
      works.map((w) => w.layoutSize)
    );
    setSavingLayout(false);
    if (error) {
      setToast(serverMessage(error, "account.errors.saveFailed"));
      return false;
    }
    savedLayout.current = layoutKey(works);
    setArranging(false);
    setToast(sizesSaved ? t("account.editor.saved") : t("account.editor.works.sizesPending"));
    return true;
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    const { error } = await deleteWork(removing);
    setRemoveBusy(false);
    if (error) {
      setRemoveError(serverMessage(error, "account.errors.saveFailed"));
      return;
    }
    const gone = removing.id;
    setWorks((list) => list.filter((w) => w.id !== gone));
    savedLayout.current = layoutKey((works || []).filter((w) => w.id !== gone));
    setRemoving(null);
  };

  const changeTab = async (next) => {
    if (next === tab) return;
    if (arranging && !(await finishArrange())) return;
    setTab(next);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const container = "relative mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-20";
  const topRow = (bgControl = null) => (
    <div className="flex min-h-[38px] items-center justify-between gap-3">
      {tabs}
      {bgControl}
    </div>
  );

  if (!builder) {
    return (
      <main className="relative">
        <div className={container}>
          {topRow()}
          <div className="mt-5">
            {loadFailed ? (
              <div className="card mx-auto max-w-md p-8 text-center">
                <h2 className="text-lg font-semibold">{t("account.loadError.title")}</h2>
                <p className="mb-6 mt-2 text-sm text-ink-2">{t("account.loadError.body")}</p>
                <button type="button" onClick={loadBuilder} className="btn btn-primary">
                  {t("common.tryAgain")}
                </button>
              </div>
            ) : (
              <EditorSkeleton />
            )}
          </div>
        </div>
      </main>
    );
  }

  const open = (what) => setEditing((current) => (current === what ? null : what));
  const specialties = builder.specialties || [];
  const canAddLink = links.length < CONTACT_LINKS_MAX;

  const header = {
    avatar: (
      <EditableAvatar
        userId={userId}
        src={builder.avatar}
        name={builder.display_name}
        onUploaded={saveAvatar}
        onError={setToast}
      />
    ),

    name:
      editing === "name" ? (
        <NameEditor userId={userId} name={builder.display_name} handle={builder.username} onSave={saveName} />
      ) : (
        <>
          <EditZone
            onClick={() => open("name")}
            label={t("account.editor.name.edit")}
            className="block lg:inline-flex lg:items-baseline lg:gap-3"
          >
            <span className="flex items-center gap-[7px]">
              <span className="min-w-0 break-words text-[22px] font-semibold leading-tight tracking-[-0.02em] lg:text-[1.75rem]">
                {builder.display_name}
              </span>
              <PenGlyph className="lg:hidden" />
            </span>
            <span className="mt-[3px] block break-all text-sm text-ink-2 lg:mt-0 lg:text-[15px] lg:text-ink-3">
              @{builder.username}
            </span>
            <PenGlyph size={15} className="hidden self-center lg:block" />
          </EditZone>
          <Presence builder={builder} className="mt-2 flex lg:hidden" />
        </>
      ),

    bio:
      editing === "bio" ? (
        <BioEditor bio={builder.bio} onSave={saveBio} onCancel={() => setEditing(null)} />
      ) : (
        <EditZone
          onClick={() => open("bio")}
          label={t("account.editor.bio.edit")}
          className="mt-1 block w-full lg:mt-0 lg:max-w-[680px]"
        >
          {builder.bio ? (
            <span className="block whitespace-pre-line break-words text-sm leading-relaxed text-ink-2 lg:text-[15px]">
              {builder.bio}
              <PenGlyph size={13} className="ml-1.5 inline-block align-[-2px]" />
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-xl border border-dashed border-line/20 px-3 py-2.5 text-sm leading-snug text-ink-3">
              <Icon name="plus" size={15} strokeWidth={2.5} className="flex-shrink-0" />
              {t("account.editor.bio.empty")}
            </span>
          )}
        </EditZone>
      ),

    meta: (
      <>
        <div className="mt-3 flex flex-col items-start gap-3 lg:mt-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-[18px] lg:gap-y-2.5">
          <YearPicker value={builder.building_since} onChange={saveYear} />
          <Presence builder={builder} className="hidden lg:inline-flex" />
          {editing !== "styles" && (
            <EditZone
              onClick={() => open("styles")}
              label={t("account.editor.styles.edit")}
              className="inline-flex flex-wrap items-center gap-1.5"
            >
              {specialties.map((key) => (
                <span
                  key={key}
                  className="inline-flex h-7 items-center rounded-lg bg-line/[0.08] px-2.5 text-[12.5px] font-medium text-ink-2"
                >
                  {styleChipLabel(key, t.lang)}
                </span>
              ))}
              {specialties.length === 0 && (
                <span className="inline-flex h-7 items-center gap-1.5 text-[13px] text-ink-3">
                  <Icon name="plus" size={14} strokeWidth={2.5} /> {t("account.editor.styles.edit")}
                </span>
              )}
              <PenGlyph size={13} className="ml-0.5" />
            </EditZone>
          )}
        </div>
        {editing === "styles" && <StylesEditor styles={specialties} onSave={saveStyles} />}
      </>
    ),

    // Phone: the link tiles under the header; from `lg` they're in the sidebar.
    links: (
      <div className="mt-4 lg:hidden">
        <SocialLinks
          contactLinks={builder.contact_links}
          onItemClick={(link) => open(`link:${link.type}`)}
          selectedType={editingType}
          addTile={
            canAddLink && editing !== "link:new" ? (
              <button
                type="button"
                onClick={() => open("link:new")}
                className="flex h-[3.25rem] w-full items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-line/20 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
              >
                <Icon name="plus" size={15} strokeWidth={2.5} />
                {links.length ? t("account.editor.links.addShort") : t("account.editor.links.addFirst")}
              </button>
            ) : null
          }
        />
        {!isDesktop && linkEditor}
      </div>
    ),
  };

  const bgShown = editing === "bg" && bgDraft ? bgDraft : builder.headerBg;

  const hasWorks = (works?.length ?? 0) > 0;
  const arrangeHint = <span className="text-[12.5px] leading-snug text-ink-2 lg:text-[13px]">{t("account.editor.works.hint")}</span>;
  const doneButton = (extra = "") => (
    <button type="button" onClick={finishArrange} disabled={savingLayout} className={`btn btn-primary flex-shrink-0 ${extra}`}>
      {savingLayout && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" />}
      {t("account.editor.done")}
    </button>
  );
  const addButton = (extra = "") => (
    <button type="button" onClick={() => setWorkEditor("new")} className={`btn btn-secondary ${extra}`}>
      <Icon name="plus" size={15} strokeWidth={2.4} />
      {t("account.editor.works.add")}
    </button>
  );
  const arrangeButton = (extra = "") => (
    <button type="button" onClick={startArrange} className={`btn btn-secondary ${extra}`}>
      <Icon name="arrange" size={15} />
      {t("account.editor.works.arrange")}
    </button>
  );

  const desktopWorksActions =
    tab !== "works" ? null : arranging ? (
      <>
        {arrangeHint}
        {doneButton("btn-sm")}
      </>
    ) : hasWorks ? (
      <>
        {addButton("btn-sm")}
        {arrangeButton("btn-sm")}
      </>
    ) : null;

  return (
    <main className={`relative ${hasHeaderBg(bgShown) ? "has-header-bg" : ""}`}>
      <HeaderBackground bg={bgShown} />
      <div className={container}>
        {topRow(
          <HeaderBackgroundPicker
            open={editing === "bg"}
            onOpen={openBg}
            onClose={closeBg}
            draft={bgDraft || builder.headerBg}
            setDraft={setBgDraft}
            userId={userId}
            isDesktop={isDesktop}
            onUploaded={(url) => bgUploads.current.add(url)}
            onError={setToast}
          />
        )}

        {builder.is_hidden && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
            <Icon name="eyeOff" size={16} className="mt-0.5 flex-shrink-0" />
            {t("profile.hiddenBanner")}
          </p>
        )}

        <div className="mt-3.5 grid grid-cols-1 items-start gap-8 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <ProfileHeader builder={builder} editor={header} />

            <ProfileTabs
              tab={tab}
              onChange={changeTab}
              worksCount={works?.length ?? 0}
              reviewsCount={stats?.reviewsCount ?? 0}
              trailing={desktopWorksActions}
            />

            <section id={`profile-panel-${tab}`} role="tabpanel" aria-labelledby={`profile-tab-${tab}`} className="pt-3 lg:pt-5">
              {tab === "works" && (
                <>
                  {/* Phone toolbar; desktop has these at the end of the tab row. */}
                  {arranging ? (
                    <div className="mb-3 flex items-center gap-2.5 lg:hidden">
                      <span className="flex-1">{arrangeHint}</span>
                      {doneButton()}
                    </div>
                  ) : (
                    hasWorks && (
                      <div className="mb-3 flex gap-2 lg:hidden">
                        {addButton("flex-1")}
                        {arrangeButton("flex-1")}
                      </div>
                    )
                  )}

                  {works === null ? (
                    <WorksMosaicSkeleton />
                  ) : hasWorks ? (
                    <WorksMosaic
                      works={works}
                      owner
                      editable
                      arranging={arranging}
                      onLayoutChange={setWorks}
                      onRemove={(work) => {
                        setRemoveError(null);
                        setRemoving(work);
                      }}
                      onOpen={(work) => setWorkEditor(work)}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2.5 rounded-[18px] border border-dashed border-line/20 px-5 py-7 text-center">
                      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-accent/[0.12] text-accent-ink">
                        <Icon name="image" size={24} />
                      </span>
                      <h2 className="text-base font-semibold">{t("account.editor.works.emptyTitle")}</h2>
                      <p className="max-w-[280px] text-[13px] leading-relaxed text-ink-2 lg:max-w-sm">
                        {t("account.editor.works.emptyBody")}
                      </p>
                      <button type="button" onClick={() => setWorkEditor("new")} className="btn btn-primary btn-lg mt-1.5">
                        <Icon name="plus" size={16} strokeWidth={2.5} />
                        {t("account.editor.works.emptyCta")}
                      </button>
                    </div>
                  )}
                </>
              )}

              {tab === "prices" && <PriceTiersEditor userId={userId} onChange={setTiers} />}

              {tab === "reviews" && (
                <>
                  <p className="mb-2 flex max-w-[680px] gap-2.5 rounded-[14px] border border-line/[0.08] bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
                    <Icon name="lock" size={16} className="mt-0.5 flex-shrink-0 text-ink-3" />
                    {t("account.editor.reviews.note")}
                  </p>
                  <ReviewsPanel
                    builderId={userId}
                    userId={userId}
                    isOwner
                    tiers={tiers}
                    ratingAvg={stats?.ratingAvg ?? null}
                    onChanged={() => fetchBuilderStats(userId).then(({ stats: next }) => setStats(next))}
                    onSignIn={() => {}}
                  />
                </>
              )}
            </section>
          </div>

          <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:block">
            <OwnerSidebar
              links={links}
              username={builder.username}
              editingType={editingType}
              linkEditor={isDesktop ? linkEditor : null}
              onEditLink={(link) => open(`link:${link.type}`)}
              onAddLink={() => open("link:new")}
            />
          </aside>
        </div>
      </div>

      {workEditor && (
        <WorkEditor
          userId={userId}
          work={workEditor === "new" ? null : workEditor}
          tiers={tiers}
          nextPosition={works?.length ?? 0}
          onClose={() => setWorkEditor(null)}
          onSaved={() => {
            setWorkEditor(null);
            loadWorks();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={t("account.editor.works.confirmTitle")}
        body={t("account.editor.works.confirmBody")}
        confirmLabel={t("account.editor.works.confirm")}
        busy={removeBusy}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />

      <Toast message={toast} />
    </main>
  );
}
