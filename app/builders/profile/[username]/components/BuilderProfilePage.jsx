"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CatalogNavbar from "../../../components/CatalogNavbar";
import CatalogMobileMenu from "../../../components/CatalogMobileMenu";
import Toast from "../../../../components/Toast";
import { useAuth } from "../../../../../lib/auth/AuthContext";
import { useAuthGate } from "../../../../../lib/auth/useAuthGate";
import { useFavorites } from "../../../../../lib/favorites/FavoritesContext";
import { useScrollLock } from "../../../../../lib/useScrollLock";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../../../lib/icons";
import { serverMessage } from "../../../../../lib/i18n/serverText.mjs";
import { WORKS_PAGE_SIZE, fetchPriceTiers, fetchWork, fetchWorks, fetchWorksCount } from "../../../../../lib/works/api";
import { fetchBuilderStats, fetchMyLikes, recordWorkView, toggleWorkLike } from "../../../../../lib/works/engagement";
import ProfileHeader from "./ProfileHeader";
import ProfileTabs, { PROFILE_TABS } from "./ProfileTabs";
import WorksGrid from "./WorksGrid";
import PriceList from "./PriceList";
import ReviewsPanel from "./ReviewsPanel";
import ProfileSidebar from "./ProfileSidebar";
import WorkDialog from "./WorkDialog";
import WorkPage from "./WorkPage";
import { WorksGridSkeleton } from "./WorksGrid";

const TOAST_MS = 2600;

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

// Which work the URL asks for: ?w=<id> opens it (a dialog on desktop, its own
// screen on a phone). Shareable, and Back steps out of it like any page.
// ?feed=<id> is what the old phone feed used; such links open the work too.
function readViewerFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const workId = params.get("w") || params.get("feed");
  return workId ? { mode: isDesktop() ? "dialog" : "page", workId } : null;
}

function readTabFromUrl() {
  if (typeof window === "undefined") return "works";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return PROFILE_TABS.some((t) => t.key === tab) ? tab : "works";
}

// Shown while the profile loads: the real layout's shapes, not a spinner on an
// empty page.
export function BuilderProfileSkeleton() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <main aria-busy="true">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8 lg:px-8">
          <div className="flex items-center gap-5 lg:gap-7">
            <div className="h-[86px] w-[86px] rounded-[22px] skeleton lg:h-[120px] lg:w-[120px] lg:rounded-[30px]" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-48 max-w-full rounded skeleton" />
              <div className="h-4 w-64 max-w-full rounded skeleton" />
            </div>
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
            <WorksGridSkeleton />
            <div className="hidden h-64 rounded-xl skeleton lg:block" />
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
// Two columns from `lg` (the sticky contact sidebar is how a visitor reaches a
// builder, and stays); one column on a phone, where the message button sits in
// the header and a bottom bar takes over once it scrolls away.
export default function BuilderProfilePage({ builder }) {
  const t = useT();
  const router = useRouter();
  const gate = useAuthGate();
  const { user } = useAuth();
  const userId = user?.id || null;
  const isOwner = userId === builder.id;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useScrollLock(mobileMenuOpen);

  const { canFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(builder.id, "builder");

  const [tab, setTab] = useState("works");
  const [works, setWorks] = useState([]);
  const [worksTotal, setWorksTotal] = useState(0);
  const [worksLoading, setWorksLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [stats, setStats] = useState(null);
  const [viewer, setViewer] = useState(null); // { mode: "dialog" | "page", workId }
  const [extraWork, setExtraWork] = useState(null); // a ?w= work not in the loaded page
  const [likedIds, setLikedIds] = useState(() => new Set());
  const [likeCounts, setLikeCounts] = useState({});
  const [toast, setToast] = useState(null);
  const [showBar, setShowBar] = useState(false);
  const actionsRef = useRef(null);
  // Per work, while a like is being written: { busy, want, before }.
  const likeSync = useRef({});

  useEffect(() => {
    setTab(readTabFromUrl());
    setViewer(readViewerFromUrl());
    const onPop = () => setViewer(readViewerFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A linked work that is not on the first page of the grid is fetched on its
  // own — and only shown if it really belongs to this builder.
  useEffect(() => {
    if (!viewer || worksLoading || works.some((w) => w.id === viewer.workId)) return undefined;
    if (extraWork?.id === viewer.workId) return undefined;
    let cancelled = false;
    fetchWork(viewer.workId).then(({ work }) => {
      if (cancelled) return;
      setExtraWork(work && work.builderId === builder.id && work.photos.length > 0 ? work : null);
    });
    return () => {
      cancelled = true;
    };
  }, [viewer, works, worksLoading, extraWork, builder.id]);

  // Which of the loaded works the signed-in visitor has liked.
  useEffect(() => {
    if (!userId) {
      setLikedIds(new Set());
      return;
    }
    const ids = works.map((w) => w.id).concat(extraWork ? [extraWork.id] : []);
    fetchMyLikes(userId, ids).then(({ likedIds: next }) => setLikedIds(next));
  }, [userId, works, extraWork]);

  const loadStats = useCallback(() => {
    fetchBuilderStats(builder.id).then(({ stats: next }) => setStats(next));
  }, [builder.id]);

  useEffect(() => {
    let cancelled = false;
    setWorksLoading(true);
    Promise.all([fetchWorks(builder.id), fetchWorksCount(builder.id), fetchPriceTiers(builder.id)]).then(
      ([w, c, p]) => {
        if (cancelled) return;
        setWorks(w.works);
        setWorksTotal(c.count);
        setTiers(p.tiers);
        setWorksLoading(false);
      }
    );
    loadStats();
    return () => {
      cancelled = true;
    };
  }, [builder.id, loadStats]);

  // The phone's bottom bar appears only once the header's own button has
  // scrolled out of view, so the button is never on screen twice.
  useEffect(() => {
    const node = actionsRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const changeTab = useCallback((next) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "works") params.delete("tab");
    else params.set("tab", next);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const { works: next } = await fetchWorks(builder.id, {
      from: works.length,
      to: works.length + WORKS_PAGE_SIZE - 1,
    });
    setWorks((list) => [...list, ...next.filter((w) => !list.some((x) => x.id === w.id))]);
    setLoadingMore(false);
  }, [builder.id, works.length, loadingMore]);

  // Open (or jump to) a chat with this builder. Auth-gated; router.push paths
  // stay base-less — Next prepends the basePath itself.
  const contactBuilder = useCallback(() => {
    const target = `/chats?to=${encodeURIComponent(builder.username)}`;
    gate(() => router.push(target), { redirectTo: target });
  }, [gate, router, builder.username]);

  const signIn = useCallback(() => gate(() => {}), [gate]);

  const share = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(builder.username)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: builder.display_name, url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast(t("profile.share.copied"));
    } catch {
      setToast(url);
    }
  }, [builder.username, builder.display_name, t]);

  const pushViewerUrl = useCallback((params, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    next.delete("w");
    next.delete("feed");
    for (const [key, value] of Object.entries(params)) next.set(key, value);
    const url = `${window.location.pathname}?${next}`;
    const state = { ...(window.history.state || {}), bxViewer: Object.keys(params).length > 0 };
    if (replace) window.history.replaceState(state, "", url);
    else window.history.pushState(state, "", url);
  }, []);

  // Grid tap or "More works": the dialog on desktop, the work's own screen on
  // a phone. Moving between works inside an open viewer replaces the entry, so
  // one Back always returns to the profile.
  const openWork = useCallback(
    (work) => {
      pushViewerUrl({ w: work.id }, viewer != null);
      setViewer({ mode: isDesktop() ? "dialog" : "page", workId: work.id });
    },
    [pushViewerUrl, viewer]
  );

  const closeViewer = useCallback(() => {
    if (window.history.state?.bxViewer) {
      window.history.back();
      return;
    }
    pushViewerUrl({}, true);
    setViewer(null);
  }, [pushViewerUrl]);

  const currentWork = viewer
    ? works.find((w) => w.id === viewer.workId) || (extraWork?.id === viewer.workId ? extraWork : null)
    : null;

  // Opening a work counts a view (the server dedups per viewer per day).
  useEffect(() => {
    if (currentWork) recordWorkView(currentWork.id);
  }, [currentWork]);

  const likeOf = useCallback(
    (work) => ({ liked: likedIds.has(work.id), likes: likeCounts[work.id] ?? work.likes }),
    [likedIds, likeCounts]
  );

  // Show a like (or its undo) on the heart, the work's count and the header's
  // total at once.
  const showLike = useCallback((workId, liked, likes, delta) => {
    setLikedIds((set) => {
      const next = new Set(set);
      if (liked) next.add(workId);
      else next.delete(workId);
      return next;
    });
    setLikeCounts((map) => ({ ...map, [workId]: Math.max(0, likes) }));
    if (delta) setStats((s) => s && { ...s, likesTotal: Math.max(0, (s.likesTotal ?? 0) + delta) });
  }, []);

  // Optimistic: the heart and counts change on the tap, and the server catches
  // up behind it. toggle_work_like flips, so taps that land while a write is in
  // flight only move the wanted state; once the write returns, it flips again
  // until the server agrees, then the server's count wins. A failure puts back
  // what was shown before the first tap. Returns false when it refused.
  const toggleLike = useCallback(
    (work) => {
      if (!userId) {
        gate(() => {});
        return false;
      }
      if (isOwner) {
        setToast(t("profile.viewer.ownLike"));
        return false;
      }
      const wasLiked = likedIds.has(work.id);
      const shownLikes = likeCounts[work.id] ?? work.likes;
      const want = !wasLiked;
      showLike(work.id, want, shownLikes + (want ? 1 : -1), want ? 1 : -1);

      const sync = likeSync.current[work.id] || (likeSync.current[work.id] = { busy: false });
      sync.want = want;
      if (sync.busy) return true;
      sync.busy = true;
      sync.before = { liked: wasLiked, likes: shownLikes };

      (async () => {
        let result = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          result = await toggleWorkLike(work.id);
          if (result.error || result.liked == null || result.liked === sync.want) break;
        }
        sync.busy = false;
        if (result.error || result.liked == null) {
          const { liked, likes } = sync.before;
          showLike(work.id, liked, likes, (liked ? 1 : 0) - (sync.want ? 1 : 0));
          if (result.error) setToast(serverMessage(result.error, "profile.viewer.likeFailed"));
          return;
        }
        if (result.likes != null) setLikeCounts((map) => ({ ...map, [work.id]: result.likes }));
      })();
      return true;
    },
    [userId, isOwner, gate, t, likedIds, likeCounts, showLike]
  );

  // The bookmark in the work viewers saves the builder; signed out, it asks
  // to sign in first.
  const toggleSave = useCallback(async () => {
    if (!canFavorite) {
      gate(() => {});
      return { ok: false };
    }
    return toggleFavorite(builder.id, "builder");
  }, [canFavorite, gate, toggleFavorite, builder.id]);

  // "Discuss a similar build": the chat opens with a draft naming this work.
  const discussWork = useCallback(
    (work) => {
      const target = `/chats?to=${encodeURIComponent(builder.username)}&work=${encodeURIComponent(work.id)}`;
      gate(() => router.push(target), { redirectTo: target });
    },
    [gate, router, builder.username]
  );

  const shareWork = useCallback(
    async (work) => {
      const url = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(builder.username)}&w=${work.id}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: work.title || builder.display_name, url });
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setToast(t("profile.share.copied"));
      } catch {
        setToast(url);
      }
    },
    [builder.username, builder.display_name, t]
  );

  const tierOf = (work) => (work ? tiers.find((tier) => tier.id === work.priceTierId) || null : null);
  const moreWorks = currentWork ? works.filter((w) => w.id !== currentWork.id) : [];

  return (
    <div className={`catalog-root ${isOwner ? "" : "has-bottom-bar"}`}>
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main>
        <div className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20">
          <nav className="hidden min-w-0 items-center gap-1.5 text-sm text-ink-3 lg:flex" aria-label={t("profile.breadcrumb")}>
            <Link href="/" className="flex-shrink-0 rounded-sm transition-colors hover:text-ink">
              {t("nav.builders")}
            </Link>
            <Icon name="chevronRight" size={14} className="flex-shrink-0 opacity-60" />
            <span className="truncate text-ink-2" aria-current="page">{builder.display_name}</span>
          </nav>

          {builder.is_hidden && (
            <p className="mb-5 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn lg:mt-5">
              <Icon name="eyeOff" size={16} className="mt-0.5 flex-shrink-0" />
              {t("profile.hiddenBanner")}
            </p>
          )}

          <div className="grid grid-cols-1 items-start gap-8 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <ProfileHeader
                builder={builder}
                stats={stats}
                isOwner={isOwner}
                onContact={contactBuilder}
                onShare={share}
                canFavorite={canFavorite}
                favorited={favorited}
                onToggleFavorite={() => toggleFavorite(builder.id, "builder")}
                actionsRef={actionsRef}
              />

              {/* No wrapper: a sticky element only sticks within its parent. */}
              <ProfileTabs
                tab={tab}
                onChange={changeTab}
                worksCount={worksTotal}
                reviewsCount={stats?.reviewsCount ?? 0}
              />

              <section
                id={`profile-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`profile-tab-${tab}`}
                className="pt-4 lg:pt-5"
              >
                {tab === "works" && (
                  <WorksGrid
                    works={works}
                    total={worksTotal}
                    loading={worksLoading}
                    loadingMore={loadingMore}
                    likeOf={likeOf}
                    onOpen={openWork}
                    onLoadMore={loadMore}
                  />
                )}
                {tab === "prices" && <PriceList tiers={tiers} />}
                {tab === "reviews" && (
                  <ReviewsPanel
                    builderId={builder.id}
                    userId={userId}
                    isOwner={isOwner}
                    tiers={tiers}
                    ratingAvg={stats?.ratingAvg ?? null}
                    onChanged={loadStats}
                    onSignIn={signIn}
                  />
                )}
              </section>
            </div>

            <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:block">
              <ProfileSidebar
                builder={builder}
                stats={stats}
                tiers={tiers}
                isOwner={isOwner}
                onContact={contactBuilder}
                onShowPrices={() => changeTab("prices")}
              />
            </aside>
          </div>
        </div>
      </main>

      {!isOwner && showBar && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-[60] border-t border-line/10 bg-canvas/90 px-4 pt-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={contactBuilder}
            className="btn btn-primary btn-lg mx-auto flex w-full max-w-lg"
          >
            <Icon name="chat" size={17} />
            {t("profile.contactBuilder")}
          </button>
        </div>
      )}

      {currentWork && viewer?.mode === "dialog" && (
        <WorkDialog
          work={currentWork}
          builder={builder}
          tier={tierOf(currentWork)}
          moreWorks={moreWorks}
          like={likeOf(currentWork)}
          isOwner={isOwner}
          onToggleLike={() => toggleLike(currentWork)}
          saved={favorited}
          onToggleSave={toggleSave}
          onClose={closeViewer}
          onOpenWork={openWork}
          onDiscuss={() => discussWork(currentWork)}
          onShare={() => shareWork(currentWork)}
        />
      )}

      {currentWork && viewer?.mode === "page" && (
        <WorkPage
          work={currentWork}
          builder={builder}
          tier={tierOf(currentWork)}
          moreWorks={moreWorks}
          worksTotal={worksTotal}
          like={likeOf(currentWork)}
          isOwner={isOwner}
          onToggleLike={() => toggleLike(currentWork)}
          saved={favorited}
          onToggleSave={toggleSave}
          onBack={closeViewer}
          onOpenWork={openWork}
          onDiscuss={() => discussWork(currentWork)}
          onShare={() => shareWork(currentWork)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
