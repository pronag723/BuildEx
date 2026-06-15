"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  filterBuilders,
  sortBuilders,
  ITEMS_PER_PAGE,
  DEFAULT_SORT,
} from "../data/builders";
import { fetchBuilders } from "../data/fetchBuilders";
import { resolveFeedSeed } from "../data/feedOrder";
import { useFavorites } from "../../../lib/favorites/FavoritesContext";

import CatalogNavbar from "./CatalogNavbar";
import CatalogMobileMenu from "./CatalogMobileMenu";
import CatalogSearch from "./CatalogSearch";
import CatalogSort from "./CatalogSort";
import CatalogFilters from "./CatalogFilters";
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

// ─── Main client page ─────────────────────────────────────────────────────────

export default function CatalogPage() {
  // URL search params held as local state. Synced to history via replaceState.
  // We avoid `useSearchParams()` because it forces a Suspense boundary that
  // currently hangs the page in Next 16 + React 19 with `output: "export"`.
  const [params, setParams] = useState(() => readParamsFromLocation());

  // Sync state when the user navigates back/forward
  useEffect(() => {
    const onPop = () => setParams(readParamsFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ── Derived filter values ──────────────────────────────────────────────────
  const query = params.get("q") || "";
  const selectedStyles = useMemo(() => parseArray(params.get("style")), [params]);
  const selectedBuildTypes = useMemo(() => parseArray(params.get("type")), [params]);
  const minPrice = Number(params.get("min")) || 0;
  const maxPrice = Number(params.get("max")) || 0;
  const minRating = Number(params.get("rating")) || 0;
  const selectedRanks = useMemo(() => parseArray(params.get("rank")), [params]);
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

  // ── Live builder feed (replaces the old static demo array) ──────────────────
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
  const [theme, setTheme] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);
  const toastTimer = useRef(null);

  // ── Theme ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  // ── Animated gradient background (identical to homepage) ───────────────────
  useEffect(() => {
    const gradientBg = gradientRef.current;
    const edgeGlow = edgeGlowRef.current;
    if (!gradientBg || !edgeGlow) return;

    const cfg = {
      edgeOffset: 12,
      speed: 1,
      smoothing: 0.08,
      idleDrift: 0.00003,
      swayAmp: 0.015,
      swaySpeed: 0.0004,
    };

    let cp1 = 0, cp2 = 0.5, tp1 = 0, tp2 = 0.5;
    let lastScroll = window.pageYOffset;
    let raf = 0;

    function periToXY(progress, offset) {
      const p = ((progress % 1) + 1) % 1;
      const seg = p * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0: return { x: offset + sp * (100 - offset * 2), y: offset };
        case 1: return { x: 100 - offset, y: offset + sp * (100 - offset * 2) };
        case 2: return { x: 100 - offset - sp * (100 - offset * 2), y: 100 - offset };
        default: return { x: offset, y: 100 - offset - sp * (100 - offset * 2) };
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

  // ── Scroll-reveal for non-card elements ────────────────────────────────────
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("active")),
      { threshold: 0.1 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ── Mobile menu / keyboard cleanup ─────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

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

  // ── Toast helper (for "coming soon" actions) ────────────────────────────────
  function showToast(msg) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }

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
      const url = `/builders${qs ? `?${qs}` : ""}`;
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

  const handlePriceChange = useCallback(
    ({ min, max }) => updateURL({ min: min || null, max: max || null }),
    [updateURL]
  );

  const handleRatingChange = useCallback(
    (value) => updateURL({ rating: value || null }),
    [updateURL]
  );

  const handleFavoritesToggle = useCallback(
    () => updateURL({ fav: favoritesOnly ? null : "1" }),
    [favoritesOnly, updateURL]
  );

  const handleRankToggle = useCallback(
    (rank) => {
      const next = selectedRanks.includes(rank)
        ? selectedRanks.filter((r) => r !== rank)
        : [...selectedRanks, rank];
      updateURL({ rank: serializeArray(next) });
    },
    [selectedRanks, updateURL]
  );

  const handleSortChange = useCallback(
    (value) => updateURL({ sort: value === DEFAULT_SORT ? null : value }),
    [updateURL]
  );

  const handleClearAll = useCallback(() => {
    window.history.replaceState(window.history.state, "", "/builders");
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
      minPrice,
      maxPrice,
      minRating,
      ranks: selectedRanks,
    });
    const scoped = effectiveFavoritesOnly
      ? filtered.filter((b) => favoriteIds.has(b.id))
      : filtered;
    return sortBuilders(scoped, sort, feedSeed);
  }, [builders, query, selectedStyles, selectedBuildTypes, minPrice, maxPrice, minRating, selectedRanks, sort, feedSeed, effectiveFavoritesOnly, favoriteIds]);

  const visibleBuilders = useMemo(
    () => filteredBuilders.slice(0, pageCount * ITEMS_PER_PAGE),
    [filteredBuilders, pageCount]
  );

  // Key for triggering card re-animation when filters change
  const animKey = useMemo(
    () => `${query}|${selectedStyles}|${selectedBuildTypes}|${minPrice}|${maxPrice}|${minRating}|${selectedRanks}|${effectiveFavoritesOnly}|${sort}|${feedSeed}`,
    [query, selectedStyles, selectedBuildTypes, minPrice, maxPrice, minRating, selectedRanks, effectiveFavoritesOnly, sort, feedSeed]
  );

  // Active filter count (for mobile button badge)
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (selectedStyles.length) n++;
    if (selectedBuildTypes.length) n++;
    if (minPrice || maxPrice) n++;
    if (minRating) n++;
    if (selectedRanks.length) n++;
    if (effectiveFavoritesOnly) n++;
    return n;
  }, [selectedStyles, selectedBuildTypes, minPrice, maxPrice, minRating, selectedRanks, effectiveFavoritesOnly]);

  const isLight = theme === "light";

  // Shared filter props passed to both sidebar and modal
  const filterProps = {
    selectedStyles,
    onStyleToggle: handleStyleToggle,
    selectedBuildTypes,
    onBuildTypeToggle: handleBuildTypeToggle,
    minPrice,
    maxPrice,
    onPriceChange: handlePriceChange,
    minRating,
    onRatingChange: handleRatingChange,
    selectedRanks,
    onRankToggle: handleRankToggle,
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
      {/* Animated gradient background */}
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

      {/* Navbar */}
      <CatalogNavbar
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showToast}
      />

      {/* Mobile nav menu */}
      <CatalogMobileMenu
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showToast}
      />

      <main>
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <section className="catalog-page-header pt-32 pb-10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="reveal">
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full text-xs mb-5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ade80]" />
                </span>
                <span>
                  <span className="text-[#4ade80] font-semibold">{builders.length}</span> active builders
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-3">
                Hire Elite{" "}
                <span className="text-[#4ade80]">Minecraft</span> Builders
              </h1>
              <p className="text-gray-400 text-base sm:text-lg max-w-xl">
                Browse talented creators, view their portfolios, and commission
                custom builds — rates negotiated per project, escrow-protected.
              </p>
            </div>

            {/* Quick-filter style chips */}
            <div className="flex flex-wrap gap-2 mt-8 reveal">
              {["fantasy", "medieval", "sci-fi", "modern", "organic", "pvp"].map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStyleToggle(s)}
                    className={`catalog-chip px-4 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 capitalize ${
                      selectedStyles.includes(s)
                        ? "bg-[#4ade80]/15 border-[#4ade80]/50 text-[#4ade80]"
                        : "glass border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
                    }`}
                  >
                    {s}
                  </button>
                )
              )}
            </div>
          </div>
        </section>

        {/* ── Catalog body ─────────────────────────────────────────────────── */}
        <section className="pb-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex gap-7 items-start">

              {/* ── Desktop sidebar ─────────────────────────────────────── */}
              <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto catalog-sidebar">
                <CatalogFilters {...filterProps} />
              </aside>

              {/* ── Main content ─────────────────────────────────────────── */}
              <div className="flex-1 min-w-0">

                {/* Toolbar — relative + z-40 so the sort dropdown panel
                    paints above the offer grid below (the .reveal class
                    creates a stacking context via transform). */}
                <div className="flex flex-col sm:flex-row gap-3 mb-5 reveal relative z-30 isolate">
                  <CatalogSearch query={query} onQueryChange={handleQueryChange} />
                  <div className="flex gap-2 flex-shrink-0">
                    <CatalogSort sort={sort} onSortChange={handleSortChange} />

                    {/* Mobile filter button */}
                    <button
                      type="button"
                      onClick={() => setMobileFiltersOpen(true)}
                      className="lg:hidden glass rounded-2xl px-4 py-2.5 text-sm font-medium flex items-center gap-2 hover:border-white/30 transition-all relative flex-shrink-0"
                      aria-label="Open filters"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 5h14M6 10h8M9 15h2" />
                      </svg>
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#4ade80] text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Results meta row */}
                <div className="flex items-center justify-between mb-6 reveal">
                  <p className="text-sm text-gray-400">
                    <span className="text-white font-semibold">
                      {filteredBuilders.length}
                    </span>{" "}
                    {filteredBuilders.length === 1 ? "builder" : "builders"} found
                    {query && (
                      <span className="ml-2">
                        for{" "}
                        <span className="text-[#4ade80] font-medium">
                          &ldquo;{query}&rdquo;
                        </span>
                      </span>
                    )}
                  </p>

                  {/* Active filter pills */}
                  {activeFilterCount > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 hidden sm:block">
                        {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                      </span>
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-xs text-[#4ade80] hover:text-green-300 transition-colors font-medium"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>

                {/* Builder grid (spinner until the live feed resolves) */}
                {buildersLoading ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin mb-4" />
                    <p className="text-gray-400 text-sm">Loading builders…</p>
                  </div>
                ) : (
                  <>
                    <BuilderGrid
                      builders={visibleBuilders}
                      animKey={animKey}
                    />

                    {/* Pagination */}
                    <PaginationControls
                      total={filteredBuilders.length}
                      shown={visibleBuilders.length}
                      onLoadMore={() => setPageCount((p) => p + 1)}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Mobile filter slide-over */}
      <FiltersMobileModal
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        {...filterProps}
      />

      <SiteFooter />

      {/* Toast notification */}
      <div
        role="status"
        aria-live="polite"
        className={`catalog-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] glass rounded-2xl px-5 py-3 text-sm font-medium shadow-xl transition-all duration-300 max-w-sm text-center ${
          toastMsg
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {toastMsg}
      </div>
    </div>
  );
}
