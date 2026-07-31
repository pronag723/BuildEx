"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import { RANKS } from "../../builders/data/builders";
import SiteFooter from "../../home/components/SiteFooter";
import { PreviewViewer } from "../../orders/components/WorldPreview";
import { useAuthGate } from "../../../lib/auth/useAuthGate";
import { formatPrice } from "../../../lib/pricing";
import { getReadyBuild, getReadyBuildPreviewUrl } from "../../../lib/readyBuilds/api";
import Avatar from "../../../lib/ui/Avatar";
import { useGradientBackground } from "../../../lib/ui/useGradientBackground";

function Chevron({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 7l3 3-3 3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 10 3 3 7-7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

function BuildGallery({ photos, listing, previewLoader }) {
  const [mode, setMode] = useState("photos");
  const [index, setIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const touchStartX = useRef(null);
  const count = photos.length;
  const go = (direction) => setIndex((current) => (current + direction + count) % count);
  const goLightbox = useCallback((direction) => {
    setLightboxIndex((current) => (current + direction + count) % count);
  }, [count]);

  useEffect(() => {
    if (lightboxIndex == null) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowLeft" && count > 1) goLightbox(-1);
      if (event.key === "ArrowRight" && count > 1) goLightbox(1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxIndex, count, goLightbox]);

  const lightboxImage = lightboxIndex == null ? null : photos[lightboxIndex];

  return (
    <>
    <section className="reveal">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Build gallery</h2>
          <p className="mt-1 text-xs text-gray-500">Explore every angle before purchasing.</p>
        </div>
        <div className={`build-media-switch ${mode === "preview" ? "is-preview" : "is-photos"}`} role="tablist" aria-label="Build media">
          <button type="button" role="tab" aria-selected={mode === "photos"} onClick={() => setMode("photos")} className={`build-media-switch-option ${mode === "photos" ? "is-active" : ""}`}>Photos</button>
          <button type="button" role="tab" aria-selected={mode === "preview"} onClick={() => setMode("preview")} className={`build-media-switch-option ${mode === "preview" ? "is-active" : ""}`}>3D preview</button>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="build-media-panel glass rounded-3xl p-3">
          <PreviewViewer source={{ loadPreview: previewLoader }} className="h-[420px] w-full sm:h-[520px]" />
        </div>
      ) : (
        <div
          className="build-media-panel glass relative overflow-hidden rounded-3xl bg-black/35"
          onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const end = event.changedTouches[0]?.clientX;
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start != null && end != null && Math.abs(end - start) >= 36 && count > 1) go(end < start ? 1 : -1);
          }}
        >
          {count ? (
            <div className="card-carousel-track flex h-[380px] w-full sm:h-[520px]" style={{ transform: `translateX(-${index * 100}%)` }}>
              {photos.map((image, photoIndex) => (
                <button key={image.id} type="button" onClick={() => setLightboxIndex(photoIndex)} className="group/photo relative h-full w-full flex-shrink-0 cursor-zoom-in overflow-hidden text-left" aria-label={`Open ${image.alt || listing.title} full screen`}>
                  <img src={image.url} alt={image.alt || listing.title} className="h-full w-full object-cover" />
                  <span className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 text-xs font-semibold text-white opacity-0 backdrop-blur-md transition-all group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100"><ExpandIcon />View full screen</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-[380px] items-center justify-center text-sm text-gray-500">Photos coming soon</div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {count > 1 && (
            <>
              <button type="button" aria-label="Previous image" onClick={() => go(-1)} className="carousel-arrow absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/50 bg-[#143c24]/80 text-white backdrop-blur-md hover:bg-[#4ade80] hover:text-black"><Chevron className="h-5 w-5 rotate-180" /></button>
              <button type="button" aria-label="Next image" onClick={() => go(1)} className="carousel-arrow absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/50 bg-[#143c24]/80 text-white backdrop-blur-md hover:bg-[#4ade80] hover:text-black"><Chevron className="h-5 w-5" /></button>
              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5" role="tablist" aria-label="Build photos">
                {photos.map((image, photoIndex) => (
                  <button type="button" key={image.id} role="tab" aria-selected={photoIndex === index} aria-label={`Show image ${photoIndex + 1}`} onClick={() => setIndex(photoIndex)} className={`h-1.5 rounded-full transition-all ${photoIndex === index ? "w-5 bg-[#4ade80]" : "w-1.5 bg-white/55"}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
    {lightboxImage && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-3 backdrop-blur-xl sm:p-8" role="dialog" aria-modal="true" aria-label="Full-screen build photo" onClick={() => setLightboxIndex(null)}>
        <button type="button" onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-2xl text-white transition hover:border-[#4ade80]/60 hover:text-[#4ade80]" aria-label="Close full-screen photo">×</button>
        <div className="relative flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
          <img src={lightboxImage.url} alt={lightboxImage.alt || listing.title} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          {count > 1 && <>
            <button type="button" onClick={() => goLightbox(-1)} className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:left-4" aria-label="Previous full-screen photo"><Chevron className="h-6 w-6 rotate-180" /></button>
            <button type="button" onClick={() => goLightbox(1)} className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:right-4" aria-label="Next full-screen photo"><Chevron className="h-6 w-6" /></button>
          </>}
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">{lightboxIndex + 1} / {count}</span>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

export default function ReadyBuildDetailPage({ listingId }) {
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const gate = useAuthGate();
  const router = useRouter();
  const { gradientRef, edgeGlowRef } = useGradientBackground(listing?.id || (loading ? "loading" : "empty"));
  const isLight = theme === "light";

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.classList.toggle("light", isLight);
    document.documentElement.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getReadyBuild(listingId).then(({ listing: row, error: requestError }) => {
      if (!active) return;
      setListing(row);
      setError(requestError?.message || null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [listingId]);

  useEffect(() => {
    if (!listing) return;
    const elements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("active"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.08 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [listing]);

  const photos = useMemo(() => [...(listing?.media || [])].sort((a, b) => a.position - b.position), [listing?.media]);
  const previewPath = listing?.version?.preview_path;
  const previewLoader = useCallback(() => getReadyBuildPreviewUrl(previewPath), [previewPath]);

  const builder = listing?.builder || {};
  const builderRankRow = Array.isArray(builder.builder) ? builder.builder[0] : builder.builder;
  const rank = RANKS[builderRankRow?.rank] || RANKS.rookie;
  const builderName = builder.display_name || builder.username || "BuildEx builder";
  const builderHref = builder.username ? `/builders/profile/?u=${encodeURIComponent(builder.username)}` : null;

  const openCheckout = useCallback(() => {
    if (!listing?.id) return;
    const target = `/build/checkout/?id=${encodeURIComponent(listing.id)}`;
    gate(() => router.push(target), { redirectTo: target });
  }, [gate, router, listing?.id]);

  const contactBuilder = useCallback(() => {
    if (!builder.username) return;
    const target = `/chats?to=${encodeURIComponent(builder.username)}`;
    gate(() => router.push(target), { redirectTo: target });
  }, [gate, router, builder.username]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-[#4ade80] border-t-transparent" /></main>;
  }

  if (!listing || !listing.is_active) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="glass rounded-3xl p-8 text-center">
          <h1 className="text-xl font-bold">Build not found</h1>
          <Link className="mt-3 inline-block text-sm text-[#4ade80]" href="/builders?mode=ready">Browse builds</Link>
        </div>
      </main>
    );
  }

  return (
    <div className={`builder-profile-root catalog-root ${isLight ? "light" : ""}`}>
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />
      <CatalogNavbar isLight={isLight} setTheme={setTheme} mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} onShowSoon={() => {}} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} onShowSoon={() => {}} />

      <main className="relative z-10 pb-36 pt-24 lg:pb-20 lg:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="detail-fade-up mb-6 flex flex-wrap items-center justify-between gap-4">
            <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
              <Link href="/" className="transition-colors hover:text-[#4ade80]">Home</Link>
              <Chevron className="h-3 w-3 opacity-50" />
              <Link href="/builders?mode=ready" className="transition-colors hover:text-[#4ade80]">Ready-made builds</Link>
              <Chevron className="h-3 w-3 opacity-50" />
              <span className="max-w-[220px] truncate" aria-current="page">{listing.title}</span>
            </nav>
            <Link href="/builders?mode=ready" className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/30 bg-[#4ade80]/10 px-4 py-2 text-xs font-semibold text-[#4ade80] transition-all hover:bg-[#4ade80] hover:text-black">
              <Chevron className="h-3 w-3 rotate-180" />Back to builds
            </Link>
          </div>

          <header className="glass detail-fade-up mb-8 rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col items-start gap-6 sm:flex-row">
              <Avatar src={builder.avatar_url} name={builderName} className="mx-auto h-24 w-24 flex-shrink-0 rounded-3xl text-3xl ring-2 ring-[#4ade80]/30 shadow-xl sm:mx-0 sm:h-28 sm:w-28" />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{listing.title}</h1>
                  <span className="rounded-full border border-[#4ade80]/30 bg-[#4ade80]/10 px-2.5 py-1 text-xs font-semibold capitalize text-[#4ade80]">{listing.style}</span>
                </div>
                <p className="mb-3 text-sm text-gray-500">Ready-made build by {builderName}</p>
                <div className="mb-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-400 sm:justify-start">
                  {builderHref ? <Link href={builderHref} className="font-semibold text-gray-200 transition-colors hover:text-[#4ade80]">@{builder.username}</Link> : <span className="font-semibold text-gray-200">{builderName}</span>}
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${rank.bgClass} ${rank.textClass} ${rank.borderClass}`}>{rank.label} Builder</span>
                  <span className="inline-flex items-center gap-1.5"><DownloadIcon />Instant download</span>
                </div>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
            <div className="min-w-0 space-y-8">
              <BuildGallery photos={photos} listing={listing} previewLoader={previewLoader} />

              <section className="reveal glass rounded-3xl p-6 lg:p-8">
                <h2 className="mb-4 text-xl font-bold">About this build</h2>
                <p className="whitespace-pre-wrap leading-relaxed text-gray-400">{listing.description}</p>
                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-6 sm:grid-cols-4">
                  <div className="text-center"><p className="text-xl font-bold capitalize">{listing.style}</p><p className="text-[10px] uppercase tracking-wide text-gray-500">Style</p></div>
                  <div className="text-center"><p className="text-xl font-bold">{photos.length}</p><p className="text-[10px] uppercase tracking-wide text-gray-500">Photos</p></div>
                  <div className="text-center"><p className="text-xl font-bold text-[#4ade80]">Ready</p><p className="text-[10px] uppercase tracking-wide text-gray-500">Availability</p></div>
                  <div className="text-center"><p className="text-xl font-bold">{new Date(listing.created_at).getFullYear()}</p><p className="text-[10px] uppercase tracking-wide text-gray-500">Published</p></div>
                </div>
              </section>

              <section className="reveal glass rounded-3xl p-6 lg:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar src={builder.avatar_url} name={builderName} className="h-14 w-14 flex-shrink-0 rounded-2xl text-lg ring-2 ring-[#4ade80]/25" />
                    <div className="min-w-0"><p className="text-[10px] uppercase tracking-widest text-gray-500">Created by</p><p className="truncate text-lg font-bold">{builderName}</p><p className={`text-xs font-semibold ${rank.textClass}`}>{rank.label} Builder</p></div>
                  </div>
                  {builderHref && <Link href={builderHref} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-gray-200 transition-all hover:border-[#4ade80]/50 hover:text-[#4ade80]">View builder profile<Chevron /></Link>}
                </div>
              </section>
            </div>

            <aside className="reveal hidden h-fit lg:sticky lg:top-24 lg:block lg:self-start">
              <div className="builder-sidebar-sticky glass space-y-5 rounded-3xl p-6">
                <div className="flex items-center gap-3">
                  <Avatar src={builder.avatar_url} name={builderName} className="h-14 w-14 flex-shrink-0 rounded-full text-xl ring-2 ring-[#4ade80]/30" />
                  <div className="min-w-0"><p className="truncate font-bold">{builderName}</p><p className={`text-xs font-semibold ${rank.textClass}`}>{rank.label} Builder</p></div>
                </div>
                <div className="border-y border-white/[0.08] py-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">Ready-made build</p>
                  <p className="mt-1 text-3xl font-extrabold leading-none text-[#4ade80]">{formatPrice(listing.price_kopecks)}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">One-time payment. Download access is available immediately after payment.</p>
                </div>
                <button type="button" onClick={openCheckout} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#4ade80] py-4 text-base font-bold text-black shadow-[0_0_28px_rgba(74,222,128,.22)] transition-all hover:-translate-y-0.5 hover:bg-[#86efac] hover:shadow-[0_0_34px_rgba(74,222,128,.38)]">
                  Buy
                </button>
                {builder.username && <button type="button" onClick={contactBuilder} className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-gray-200 transition-all hover:border-[#4ade80]/50 hover:bg-[#4ade80]/10 hover:text-[#4ade80]"><MessageIcon />Message builder</button>}
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-white/10 pt-5 text-[11px] text-gray-400">
                  {["Instant access", "Secure payment", "Source world", "Preview before buying"].map((label) => <p key={label} className="flex items-center gap-1.5"><span className="text-[#4ade80]"><CheckIcon /></span>{label}</p>)}
                </div>
                {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
              </div>
            </aside>
          </div>
        </div>
      </main>

      <div className="safe-bottom fixed bottom-0 left-0 right-0 z-[150] border-t border-white/10 px-4 pb-4 pt-3 glass lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex-shrink-0"><p className="text-[10px] uppercase tracking-wide text-gray-500">Price</p><p className="text-lg font-extrabold leading-none text-[#4ade80]">{formatPrice(listing.price_kopecks)}</p></div>
          {builder.username && <button type="button" onClick={contactBuilder} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200" aria-label="Message builder"><MessageIcon /></button>}
          <button type="button" onClick={openCheckout} className="flex flex-1 items-center justify-center rounded-full bg-[#4ade80] py-3 text-sm font-bold text-black">Buy</button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
