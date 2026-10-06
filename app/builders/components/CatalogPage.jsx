"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  filterBuilders,
  sortBuilders,
  ITEMS_PER_PAGE,
  DEFAULT_SORT,
  STYLES,
} from "../data/builders";
import { fetchBuilders } from "../data/fetchBuilders";
import { resolveFeedSeed } from "../data/feedOrder";
import { useFavorites } from "../../../lib/favorites/FavoritesContext";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";

import CatalogNavbar from "./CatalogNavbar";
import CatalogMobileMenu from "./CatalogMobileMenu";
import CatalogSearch from "./CatalogSearch";
import CatalogSort from "./CatalogSort";
import FiltersMobileModal from "./FiltersMobileModal";
import BuilderGrid from "./BuilderGrid";
import PaginationControls from "./PaginationControls";
import SiteFooter from "../../home/components/SiteFooter";

// ─── URL param helpers ────────────────────────────────────────────────────────

function parseArray(value) {
  return value ? value.split(",").filter(Boolean) : [];
}

function serializeArray(arr) {
  return arr.length > 0 ? arr.join(",") : null;
}

// Read params synchronously from window.location (client-only, no Suspense).
function readParamsFromLocation() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

// The path a filter change should write back to.
//
// The feed now lives at `/` (with `/builders` kept as a redirect), so this can
// no longer be the hardcoded `/builders` it used to be — ticking a filter on
// the homepage would have bounced the URL onto the legacy path.
//
// It reads window.location rather than usePathname() on purpose:
// replaceState() resolves its argument against the document, and
// usePathname() strips the deployment basePath, so `/` would drop the
// `/BuildEx` prefix on GitHub Pages and rewrite the URL out of the app.
function currentFeedPath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}

// ─── Main client page ─────────────────────────────────────────────────────────

export default function CatalogPage() {
  const t = useT();

  // URL search params held as local state. Synced to history via replaceState.
  // We avoid `useSearchParams()` because it forces a Suspense boundary that
  // currently hangs the page in Next 16 + React 19 with `output: "export"`.
  const [params, setParams] = useState(() => readParamsFromLocation());

  // Sync state when the user navigates back/forward
  useEffect(() => {
    // The static server render cannot see the query string. Re-read it after
    // hydration and after a Next client navigation back from a builder profile.
    setParams(readParamsFromLocation());
    const onPop = () => setParams(readParamsFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ── Derived filter values ──────────────────────────────────────────────────
  const query = params.get("q") || "";
  const selectedStyles = useMemo(() => parseArray(params.get("style")), [params]);
  const selectedBuildTypes = useMemo(() => parseArray(params.get("type")), [params]);
  const favoritesOnly = params.get("fav") === "1";
  const sort = params.get("sort") || DEFAULT_SORT;

  // Seed for the default "Recommended" (randomised) order. A fresh visit rolls
  // a new seed; returning from a builder profile reuses it so the order doesn't
  // reshuffle. See data/feedOrder.js. Resolved in an effect (not a useState
  // initializer) so it stays pure under React StrictMode's dev double-mount.
  const [feedSeed, setFeedSeed] = useState(0);
  useEffect(() => {
    setFeedSeed(resolveFeedSeed());
  }, []);

  // ── Favorites (signed-in users can bookmark builders & filter to them) ──────
  const { favoriteIds, canFavorite } = useFavorites();

  // ── Live builder feed ────────────────────────────────────────────────────────
  const [builders, setBuilders] = useState([]);
  const [buildersLoading, setBuildersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBuildersLoading(true);
    fetchBuilders().then(({ builders: rows }) => {
      if (cancelled) return;
      setBuilders(rows || []);
      setBuildersLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [pageCount, setPageCount] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Mobile menu / keyboard cleanup ─────────────────────────────────────────
  useScrollLock(mobileMenuOpen);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { setMobileMenuOpen(false); setMobileFiltersOpen(false); }
    }
    function onResize() { if (window.innerWidth >= 1024) setMobileMenuOpen(false); }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); };
  }, []);

  // ── Reset page on filter change ─────────────────────────────────────────────
  useEffect(() => {
    setPageCount(1);
  }, [params]);

  // ── URL update helper (writes to history + updates local state) ────────────
  const updateURL = useCallback((updates) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);

      Object.entries(updates).forEach(([key, value]) => {
        if (
          value === null ||
          value === undefined ||
          value === "" ||
          value === 0 ||
          (Array.isArray(value) && value.length === 0)
        ) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
      });

      const qs = next.toString();
      const url = `${currentFeedPath()}${qs ? `?${qs}` : ""}`;
      window.history.replaceState(window.history.state, "", url);
      return next;
    });
  }, []);

  // ── Filter handlers ─────────────────────────────────────────────────────────
  const handleQueryChange = useCallback(
    (value) => updateURL({ q: value }),
    [updateURL]
  );

  const handleStyleToggle = useCallback(
    (style) => {
      const next = selectedStyles.includes(style)
        ? selectedStyles.filter((s) => s !== style)
        : [...selectedStyles, style];
      updateURL({ style: serializeArray(next) });
    },
    [selectedStyles, updateURL]
  );

  const handleBuildTypeToggle = useCallback(
    (type) => {
      const next = selectedBuildTypes.includes(type)
        ? selectedBuildTypes.filter((t) => t !== type)
        : [...selectedBuildTypes, type];
      updateURL({ type: serializeArray(next) });
    },
    [selectedBuildTypes, updateURL]
  );

  const handleFavoritesToggle = useCallback(
    () => updateURL({ fav: favoritesOnly ? null : "1" }),
    [favoritesOnly, updateURL]
  );

  const handleSortChange = useCallback(
    (value) => updateURL({ sort: value === DEFAULT_SORT ? null : value }),
    [updateURL]
  );

  const handleClearAll = useCallback(() => {
    window.history.replaceState(window.history.state, "", currentFeedPath());
    setParams(new URLSearchParams());
  }, []);

  // The favorites filter only does anything for a signed-in user (a logged-out
  // visitor has no favorites, so honouring a stray ?fav=1 would wrongly empty
  // the feed). Gate it on canFavorite.
  const effectiveFavoritesOnly = favoritesOnly && canFavorite;

  // ── Computed builders ───────────────────────────────────────────────────────
  const filteredBuilders = useMemo(() => {
    const filtered = filterBuilders(builders, {
      query,
      styles: selectedStyles,
      buildTypes: selectedBuildTypes,
    });
    const scoped = effectiveFavoritesOnly
      ? filtered.filter((b) => favoriteIds.has(`builder:${b.id}`))
      : filtered;
    return sortBuilders(scoped, sort, feedSeed);
  }, [builders, query, selectedStyles, selectedBuildTypes, sort, feedSeed, effectiveFavoritesOnly, favoriteIds]);

  const visibleBuilders = useMemo(
    () => filteredBuilders.slice(0, pageCount * ITEMS_PER_PAGE),
    [filteredBuilders, pageCount]
  );

  // Filters only — the drawer button's badge. The search box shows its own
  // state, so it is not counted here.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (selectedStyles.length) n++;
    if (selectedBuildTypes.length) n++;
    if (effectiveFavoritesOnly) n++;
    return n;
  }, [selectedStyles, selectedBuildTypes, effectiveFavoritesOnly]);

  const hasNarrowing = activeFilterCount > 0 || Boolean(query);

  // Shared filter props passed to the drawer
  const filterProps = {
    selectedStyles,
    onStyleToggle: handleStyleToggle,
    selectedBuildTypes,
    onBuildTypeToggle: handleBuildTypeToggle,
    favoritesOnly,
    onFavoritesToggle: handleFavoritesToggle,
    canFavorite,
    favoriteCount: favoriteIds.size,
    onClearAll: handleClearAll,
    activeFilterCount,
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main>
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-7 sm:px-6 sm:pb-24 sm:pt-10 lg:px-8">
          {/* ── Page header ─────────────────────────────────────────────── */}
          <header className="mb-5 sm:mb-7">
            <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2rem]">
              {t("catalog.heading")}
            </h1>
            <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-ink-2">
              {t("catalog.subheading")}
            </p>
          </header>

          {/* ── Search + filters ────────────────────────────────────────── */}
          <div className="flex gap-2">
            <CatalogSearch query={query} onQueryChange={handleQueryChange} />
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className={`btn btn-secondary h-11 px-3.5 sm:px-4 ${
                activeFilterCount > 0 ? "!border-accent/50" : ""
              }`}
              aria-label={t("catalog.openFilters")}
              aria-expanded={mobileFiltersOpen}
              aria-controls="catalog-filter-drawer"
            >
              <Icon name="filters" size={16} />
              <span className="hidden xs:inline">{t("catalog.filters")}</span>
              {activeFilterCount > 0 && (
                <span className="min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-accent text-accent-fg text-[11px] font-semibold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* ── Style shortcuts ─────────────────────────────────────────────
              The style filter is the one most people reach for, so it sits
              out in the open; build type and favourites stay in the drawer. */}
          <div
            className="quick-filters hide-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:flex-wrap"
            role="group"
            aria-label={t("catalog.style")}
          >
            {STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                className="tag-toggle"
                aria-pressed={selectedStyles.includes(s.key)}
                onClick={() => handleStyleToggle(s.key)}
              >
                {t(`styles.${s.key}`)}
              </button>
            ))}
          </div>

          {/* ── Result count + sort ────────────────────────────────────────
              relative + z-30 so the sort menu paints above the grid. */}
          <div className="relative z-30 mb-4 mt-6 flex min-h-[2rem] items-center justify-between gap-3 sm:mb-5">
            <p className="min-w-0 truncate text-sm text-ink-2" aria-live="polite">
              {!buildersLoading && (
                <>
                  {t.rich("catalog.found", {
                    count: filteredBuilders.length,
                    n: <span className="font-semibold text-ink">{filteredBuilders.length}</span>,
                  })}
                  {query && (
                    <span className="ml-1">
                      {t.rich("catalog.forQuery", {
                        q: <span className="text-ink">&ldquo;{query}&rdquo;</span>,
                      })}
                    </span>
                  )}
                </>
              )}
            </p>

            <div className="flex flex-shrink-0 items-center gap-1">
              {hasNarrowing && (
                <button type="button" onClick={handleClearAll} className="btn btn-ghost btn-sm">
                  {t("catalog.clearAll")}
                </button>
              )}
              <CatalogSort sort={sort} onSortChange={handleSortChange} />
            </div>
          </div>

          {/* ── Builder grid ────────────────────────────────────────────── */}
          <BuilderGrid
            builders={visibleBuilders}
            loading={buildersLoading}
            hasNarrowing={hasNarrowing}
            onClearAll={handleClearAll}
          />

          {!buildersLoading && (
            <PaginationControls
              total={filteredBuilders.length}
              shown={visibleBuilders.length}
              onLoadMore={() => setPageCount((p) => p + 1)}
            />
          )}
        </div>
      </main>

      {/* Filter slide-over */}
      <FiltersMobileModal
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        resultCount={filteredBuilders.length}
        {...filterProps}
      />

      <SiteFooter />
    </div>
  );
}
