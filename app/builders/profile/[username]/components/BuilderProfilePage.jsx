"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import CatalogNavbar from "../../../components/CatalogNavbar";
import CatalogMobileMenu from "../../../components/CatalogMobileMenu";
import { publicAsset } from "../../../../home/utils";
import Avatar from "../../../../../lib/ui/Avatar";
import { useAuthGate } from "../../../../../lib/auth/useAuthGate";
import SocialLinks from "../../../components/SocialLinks";
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
function IconChat({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
// ─── Portfolio carousel ──────────────────────────────────────────────────────
function PortfolioCarousel({ items }) {
  const [index, setIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const count = items.length;

  const go = (dir) => setIndex((i) => (i + dir + count) % count);
  const goLightbox = useCallback((dir) => {
    setLightboxIndex((current) => (current + dir + count) % count);
  }, [count]);

  useScrollLock(lightboxIndex != null);

  useEffect(() => {
    if (lightboxIndex == null) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowLeft" && count > 1) goLightbox(-1);
      if (event.key === "ArrowRight" && count > 1) goLightbox(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, count, goLightbox]);

  const lightboxImage = lightboxIndex == null ? null : items[lightboxIndex];

  return (
    <>
    <div className="group/media relative rounded-3xl overflow-hidden bg-black/20">
      <div
        className="flex transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {items.map((item, itemIndex) => (
          <button key={item.id} type="button" onClick={() => setLightboxIndex(itemIndex)} className="group/photo relative w-full flex-shrink-0 aspect-[16/9] cursor-zoom-in overflow-hidden text-left" aria-label={`Open ${item.title || "portfolio image"} full screen`}>
            <img
              src={publicAsset(item.thumbnail)}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            <span className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 text-xs font-semibold text-white opacity-0 backdrop-blur-md transition-all group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100"><IconExpand />View full screen</span>
          </button>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous build"
            onClick={() => go(-1)}
            className="carousel-arrow absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
          >
            <IconChevron className="w-5 h-5 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Next build"
            onClick={() => go(1)}
            className="carousel-arrow absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
          >
            <IconChevron className="w-5 h-5" />
          </button>

          {/* Slide dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Go to build ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all duration-200 ${
                  i === index ? "w-6 bg-[#4ade80]" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
    {lightboxImage && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-3 backdrop-blur-xl sm:p-8" role="dialog" aria-modal="true" aria-label="Full-screen portfolio photo" onClick={() => setLightboxIndex(null)}>
        <button type="button" onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-2xl text-white transition hover:border-[#4ade80]/60 hover:text-[#4ade80]" aria-label="Close full-screen photo">×</button>
        <div className="relative flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
          <img src={publicAsset(lightboxImage.thumbnail)} alt={lightboxImage.title || "Portfolio image"} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          {count > 1 && <>
            <button type="button" onClick={() => goLightbox(-1)} className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:left-4" aria-label="Previous full-screen photo"><IconChevron className="h-6 w-6 rotate-180" /></button>
            <button type="button" onClick={() => goLightbox(1)} className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:right-4" aria-label="Next full-screen photo"><IconChevron className="h-6 w-6" /></button>
          </>}
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">{lightboxIndex + 1} / {count}</span>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

// ─── Contact sidebar ─────────────────────────────────────────────────────────
function ContactSidebar({ builder, onContact }) {
  return (
    <div className="glass rounded-3xl p-5 builder-sidebar-sticky space-y-4">
      {/* Avatar + header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <Avatar
            src={builder.avatar}
            name={builder.display_name}
            className="w-14 h-14 rounded-full ring-2 ring-[#4ade80]/30 text-xl"
          />
          {builder.online && (
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#4ade80] border-2 border-[#1a1a1a] online-dot" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-base leading-tight">{builder.display_name}</p>
          {builder.online ? (
            <p className="text-xs text-[#4ade80] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] online-dot" />
              Online now
            </p>
          ) : (
            <p className="text-xs text-gray-500">Offline</p>
          )}
        </div>
      </div>

      {/* CTA. Dark-secondary until the revamp, because "Order Now" sat above it
          in green. Orders are gone — messaging the builder is the only thing
          this page asks anyone to do, so it reads as the primary action. */}
      <button
        type="button"
        onClick={onContact}
        className="w-full py-3.5 rounded-full bg-[#4ade80] text-black font-bold text-base green-glow hover:bg-[#22c55e] transition-all flex items-center justify-center gap-2"
      >
        <IconChat className="w-4 h-4" />
        Contact Builder
      </button>

      {/* Whatever links this builder chose to publish; nothing at all when they
          published none. The badges that used to sit here ("Source Files",
          "Discuss Anytime") promised things about a builder's delivery that
          BuildEx cannot know, and are not coming back. The disclaimer that
          replaced them is not here either — it lives once, in the footer. */}
      <SocialLinks
        contactLinks={builder.contact_links}
        className="justify-center"
      />
    </div>
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

  const showSoon = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Open (or jump to) a chat thread with this builder. Auth-gated: unauthenticated
  // visitors are routed to /login first, then back here. The /chats page resolves
  // the @handle to the builder and starts the conversation.
  const contactBuilder = useCallback(() => {
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

      <main className="relative z-10 pt-20 sm:pt-24 lg:pt-28 pb-24 sm:pb-28 lg:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Breadcrumb + back button */}
          <div className="flex items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-6 detail-fade-up">
            <nav className="flex min-w-0 items-center gap-1.5 text-xs sm:text-sm text-gray-500" aria-label="Breadcrumb">
              {/* "Home" and "Builders" were separate crumbs until the feed
                  became the site root; they now point at the same page. */}
              <Link href="/" className="flex-shrink-0 hover:text-[#4ade80] transition-colors">
                Builders
              </Link>
              <IconChevron className="w-3 h-3 flex-shrink-0 opacity-50" />
              <span className="truncate" aria-current="page">{builder.display_name}</span>
            </nav>
            <div className="flex flex-shrink-0 items-center gap-2">
              {canFavorite && builder.id && (
                <button
                  type="button"
                  onClick={() => toggleFavorite(builder.id, "builder")}
                  aria-pressed={favorited}
                  aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 sm:px-4 text-xs font-semibold border transition-all ${
                    favorited
                      ? "bg-[#4ade80] text-black border-[#4ade80] shadow-[0_0_18px_rgba(74,222,128,0.4)]"
                      : "border-white/15 text-gray-300 bg-white/5 hover:border-[#4ade80]/50 hover:text-[#4ade80]"
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill={favorited ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span className="hidden xs:inline">{favorited ? "Saved" : "Save"}</span>
                </button>
              )}
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-3 py-2 sm:px-4 text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all"
              >
                <IconChevron className="w-3 h-3 flex-shrink-0 rotate-180" />
                <span className="whitespace-nowrap">Back<span className="hidden xs:inline"> to Builders</span></span>
              </Link>
            </div>
          </div>

          {/* ── Hero header ─────────────────────────────────────────────────
              Deliberately NOT a glass card. The page used to open with a big
              empty box before you reached anything the builder made; the
              identity row now sits directly on the page so the portfolio is
              the first surface you see. */}
          <header className="mb-6 sm:mb-8 detail-fade-up">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-start">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <Avatar
                  src={builder.avatar}
                  name={builder.display_name}
                  className="w-16 h-16 sm:w-24 sm:h-24 rounded-3xl ring-2 ring-[#4ade80]/30 shadow-xl text-2xl sm:text-3xl"
                />
                {builder.online && (
                  <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#4ade80] border-[3px] border-[#1a1a1a] online-dot" />
                )}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <h1 className="text-xl sm:text-3xl font-extrabold leading-tight">
                  {builder.display_name}
                </h1>

                {/* The "Member Since" year used to be a bordered one-cell grid
                    of its own inside the About card. It is a single number —
                    it belongs on this line. */}
                <p className="mt-1 text-sm text-gray-500">
                  @{builder.username}
                  {builder.member_since && (
                    <span className="text-gray-600">
                      {" · "}Member since{" "}
                      {new Date(builder.member_since).getFullYear()}
                    </span>
                  )}
                </p>

                {/* Specialties */}
                {builder.specialties.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap justify-center sm:justify-start gap-1.5 sm:gap-2">
                    {builder.specialties.map((s) => (
                      <span key={s} className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs bg-white/5 border border-white/10 text-gray-400">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Contact links render in the sticky sidebar from `lg` up, so
                    this copy only exists for the widths where the sidebar is
                    hidden. Exactly one is visible at any viewport. */}
                <SocialLinks
                  contactLinks={builder.contact_links}
                  className="justify-center sm:justify-start mt-3.5 lg:hidden"
                />
              </div>
            </div>
          </header>

          {/* ── Two-column layout ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-6 lg:gap-8 items-start">

            {/* LEFT: Content */}
            <div className="space-y-6 sm:space-y-8 min-w-0">

              {/* Portfolio gallery — the count moved into the heading row, and
                  the carousel lost its `glass` frame: the images are the
                  content and a border around them just adds another box. */}
              <section className="reveal">
                <h2 className="font-bold text-lg sm:text-xl mb-3 sm:mb-4">
                  Portfolio
                  {builder.portfolio.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      {builder.portfolio.length}{" "}
                      {builder.portfolio.length === 1 ? "build" : "builds"}
                    </span>
                  )}
                </h2>
                {builder.portfolio.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 p-8 sm:p-12 text-center text-gray-500 text-sm">
                    This builder hasn&apos;t added portfolio entries yet.
                  </div>
                ) : (
                  <PortfolioCarousel items={builder.portfolio} />
                )}
              </section>

              {/* About — no card, and nothing at all when there is no bio. An
                  empty "About" box was the emptiest of the four boxes this
                  page used to stack. */}
              {(builder.about || builder.bio) && (
                <section className="reveal">
                  <h2 className="font-bold text-lg sm:text-xl mb-2.5 sm:mb-3">About</h2>
                  <p className="text-sm sm:text-base text-gray-400 leading-relaxed">
                    {builder.about || builder.bio}
                  </p>
                </section>
              )}
            </div>

            {/* RIGHT: Sticky contact sidebar */}
            <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
              <ContactSidebar builder={builder} onContact={contactBuilder} />
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[150] glass border-t border-white/10 safe-bottom px-4 pt-2.5 pb-3 sm:pt-3 sm:pb-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            type="button"
            onClick={contactBuilder}
            className="flex-1 py-2.5 sm:py-3 px-4 rounded-full bg-[#4ade80] text-black font-bold text-sm green-glow hover:bg-[#22c55e] transition-all flex items-center justify-center gap-1.5"
          >
            <IconChat className="w-4 h-4" />
            Contact Builder
          </button>
        </div>
      </div>

    </div>
  );
}
