"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Public builder profile.
//
// The page has one job: show the work. Everything the old marketplace profile
// carried — rate cards, the rank ring, ratings, reviews, the hire CTA, the
// tools and formats sidebar — is gone, so the layout is a single column with a
// wide portfolio gallery under a compact identity header. The only action is
// "Message", which opens a chat thread with the builder.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import CatalogNavbar from "../../../components/CatalogNavbar";
import CatalogMobileMenu from "../../../components/CatalogMobileMenu";
import SiteFooter from "../../../../home/components/SiteFooter";
import { publicAsset } from "../../../../home/utils";
import Avatar from "../../../../../lib/ui/Avatar";
import { useAuthGate } from "../../../../../lib/auth/useAuthGate";
import SocialLinks from "../../../components/SocialLinks";
import { Icon } from "../../../../../lib/icons";
import { useFavorites } from "../../../../../lib/favorites/FavoritesContext";
import { useScrollLock } from "../../../../../lib/useScrollLock";

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconChevron({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 7l3 3-3 3" />
    </svg>
  );
}
function IconExpand({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}
function IconHeart({ className = "w-4 h-4", filled = false }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// ─── Portfolio gallery ───────────────────────────────────────────────────────
// A wide grid instead of the old sidebar-sized carousel: the first build runs
// the full width, the rest sit two-up on desktop and stack on mobile. Any tile
// opens the full-screen viewer, which keeps its own keyboard navigation.
function PortfolioGallery({ items }) {
  const [viewerIndex, setViewerIndex] = useState(null);
  const count = items.length;

  const step = useCallback(
    (dir) => setViewerIndex((current) => (current + dir + count) % count),
    [count]
  );

  useScrollLock(viewerIndex != null);

  useEffect(() => {
    if (viewerIndex == null) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft" && count > 1) step(-1);
      if (event.key === "ArrowRight" && count > 1) step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, count, step]);

  const viewerImage = viewerIndex == null ? null : items[viewerIndex];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setViewerIndex(index)}
            aria-label={`Open ${item.title || "portfolio image"} full screen`}
            className={`group/photo relative overflow-hidden rounded-3xl glass cursor-zoom-in text-left ${
              index === 0
                ? "md:col-span-2 aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9]"
                : "aspect-[4/3]"
            }`}
          >
            <img
              src={publicAsset(item.thumbnail)}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/photo:scale-[1.04]"
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/photo:opacity-100" />
            <span className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 text-xs font-semibold text-white opacity-0 backdrop-blur-md transition-all group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100">
              <IconExpand />
              View full screen
            </span>
          </button>
        ))}
      </div>

      {viewerImage && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-3 backdrop-blur-xl sm:p-8" role="dialog" aria-modal="true" aria-label="Full-screen portfolio photo" onClick={() => setViewerIndex(null)}>
          <button type="button" onClick={() => setViewerIndex(null)} className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-2xl text-white transition hover:border-[#4ade80]/60 hover:text-[#4ade80]" aria-label="Close full-screen photo">×</button>
          <div className="relative flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <img src={publicAsset(viewerImage.thumbnail)} alt={viewerImage.title || "Portfolio image"} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
            {count > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:left-4" aria-label="Previous full-screen photo"><IconChevron className="h-6 w-6 rotate-180" /></button>
                <button type="button" onClick={() => step(1)} className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:right-4" aria-label="Next full-screen photo"><IconChevron className="h-6 w-6" /></button>
              </>
            )}
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">{viewerIndex + 1} / {count}</span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function BuilderProfilePage({ builder }) {
  const [theme, setTheme] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);

  const isLight = theme === "light";

  const gate = useAuthGate();
  const router = useRouter();

  // Favorites — signed-in visitors can bookmark this builder from the header.
  const { canFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(builder.id, "builder");

  const description = builder.about || builder.bio || "";
  const styleTags = builder.specialties || [];
  const portfolio = builder.portfolio || [];

  const showSoon = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Open (or jump to) a chat thread with this builder. Auth-gated: unauthenticated
  // visitors are routed to /login first, then back here. The /chats page resolves
  // the @handle to the builder and starts the conversation.
  const messageBuilder = useCallback(() => {
    // Next prepends the deployment basePath to router.push automatically, so the
    // path must stay base-less here — wrapping it in withBase() would double the
    // prefix (/BuildEx/BuildEx/chats) and 404 on GitHub Pages.
    const target = `/chats?to=${encodeURIComponent(builder.username)}`;
    gate(
      () => {
        router.push(target);
      },
      { redirectTo: target }
    );
  }, [gate, router, builder.username]);

  // Theme init
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

  // ── Animated gradient background (identical to catalog/home pages) ────────
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

    function periToXY(progress, offset) {
      const p = ((progress % 1) + 1) % 1;
      const seg = p * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0:  return { x: offset + sp * (100 - offset * 2), y: offset };
        case 1:  return { x: 100 - offset, y: offset + sp * (100 - offset * 2) };
        case 2:  return { x: 100 - offset - sp * (100 - offset * 2), y: 100 - offset };
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

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); obs.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

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

      {/* Toast */}
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

      <main className="relative z-10 pt-24 lg:pt-28 pb-32 lg:pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Breadcrumb + back button */}
          <div className="flex items-center justify-between gap-4 mb-6 detail-fade-up flex-wrap">
            <nav className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-[#4ade80] transition-colors">Home</Link>
              <IconChevron className="w-3 h-3 opacity-50" />
              <Link href="/builders" className="hover:text-[#4ade80] transition-colors">
                Builders
              </Link>
              <IconChevron className="w-3 h-3 opacity-50" />
              <span className="truncate max-w-[200px] sm:max-w-xs" aria-current="page">{builder.display_name}</span>
            </nav>
            <div className="flex items-center gap-2">
              {canFavorite && builder.id && (
                <button
                  type="button"
                  onClick={() => toggleFavorite(builder.id, "builder")}
                  aria-pressed={favorited}
                  aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                    favorited
                      ? "bg-[#4ade80] text-black border-[#4ade80] shadow-[0_0_18px_rgba(74,222,128,0.4)]"
                      : "border-white/15 text-gray-300 bg-white/5 hover:border-[#4ade80]/50 hover:text-[#4ade80]"
                  }`}
                >
                  <IconHeart className="w-3.5 h-3.5" filled={favorited} />
                  {favorited ? "Saved" : "Save"}
                </button>
              )}
              <Link
                href="/builders"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all"
              >
                <IconChevron className="w-3 h-3 rotate-180" />
                Back to Builders
              </Link>
            </div>
          </div>

          {/* ── Identity header ───────────────────────────────────────────── */}
          <header className="glass rounded-3xl p-6 sm:p-8 mb-8 detail-fade-up">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Avatar */}
              <div className="relative flex-shrink-0 mx-auto sm:mx-0">
                <Avatar
                  src={builder.avatar}
                  name={builder.display_name}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl ring-2 ring-[#4ade80]/30 shadow-xl text-4xl"
                />
                {builder.online && (
                  <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#4ade80] border-[3px] border-[#1a1a1a] online-dot" />
                )}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                  {builder.display_name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-sm text-gray-500">
                  <span>@{builder.username}</span>
                  {builder.online ? (
                    <span className="flex items-center gap-1.5 text-[#4ade80]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] online-dot" />
                      Online now
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      Offline
                    </span>
                  )}
                </div>

                {/* Description */}
                {description && (
                  <p className="mt-4 text-gray-400 leading-relaxed whitespace-pre-line">
                    {description}
                  </p>
                )}

                {/* Style tags */}
                {styleTags.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
                    {styleTags.map((s) => (
                      <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Message + whatever links this builder chose to publish */}
                <div className="mt-6 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <button
                    type="button"
                    onClick={messageBuilder}
                    className="hidden lg:inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#4ade80] text-black font-bold text-sm transition-all hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(74,222,128,0.45)] active:scale-[0.99]"
                  >
                    <Icon name="chat" size={16} strokeWidth={2} />
                    Message
                  </button>
                  <SocialLinks
                    contactLinks={builder.contact_links}
                    className="justify-center sm:justify-start"
                  />
                </div>
              </div>
            </div>
          </header>

          {/* ── Portfolio — the main event ─────────────────────────────────── */}
          <section className="reveal">
            <div className="flex items-end justify-between mb-5">
              <h2 className="font-bold text-xl">Portfolio</h2>
              {portfolio.length > 0 && (
                <span className="text-xs text-gray-500">
                  {portfolio.length} {portfolio.length === 1 ? "build" : "builds"}
                </span>
              )}
            </div>
            {portfolio.length === 0 ? (
              <div className="glass rounded-3xl p-12 flex flex-col items-center gap-3 text-center text-gray-500 text-sm">
                <Icon name="image" size={28} strokeWidth={1.5} className="text-gray-600" />
                This builder hasn&apos;t added portfolio entries yet.
              </div>
            ) : (
              <PortfolioGallery items={portfolio} />
            )}
          </section>
        </div>
      </main>

      {/* Mobile / tablet sticky message bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[150] glass border-t border-white/10 safe-bottom px-4 pt-3 pb-4">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={messageBuilder}
            className="w-full py-3 px-4 rounded-full bg-[#4ade80] text-black font-bold text-sm transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <Icon name="chat" size={16} strokeWidth={2} />
            Message {builder.display_name}
          </button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
