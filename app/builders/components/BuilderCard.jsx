"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { RANKS } from "../data/builders";
import { publicAsset, withBase } from "../../home/utils";
import { formatPrice } from "../../../lib/pricing";
import { useFavorites } from "../../../lib/favorites/FavoritesContext";
import StudioOfficialBadge from "./StudioOfficialBadge";
import { useScrollLock } from "../../../lib/useScrollLock";

function StarIcon({ className = "w-3.5 h-3.5" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function ArrowIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 10h10M11 6l4 4-4 4" />
    </svg>
  );
}

function ChevronIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 7l3 3-3 3" />
    </svg>
  );
}

function HeartIcon({ className = "w-4 h-4", filled = false }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ExpandIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

export default function BuilderCard({ builder, animationDelay = 0 }) {
  const isStudio = builder.provider_type === "studio";
  const rank = isStudio ? null : (RANKS[builder.rank] || RANKS.rookie);
  const previews = builder.portfolio.slice(0, 6);
  const count = previews.length;

  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [infoHover, setInfoHover] = useState(false);
  const touchStartX = useRef(null);
  const touchDidSwipe = useRef(false);

  useScrollLock(lightbox != null);

  const goLightbox = useCallback((direction) => {
    setLightbox((current) => {
      if (!current || current.kind !== "portfolio" || count < 2) return current;
      return { ...current, index: (current.index + direction + count) % count };
    });
  }, [count]);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setLightbox(null);
      if (event.key === "ArrowLeft") goLightbox(-1);
      if (event.key === "ArrowRight") goLightbox(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox, goLightbox]);

  const { canFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(builder.id, isStudio ? "studio" : "builder");

  const go = (e, dir) => {
    // Keep arrow clicks inside the carousel — never follow the card's link.
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i + dir + count) % count);
  };

  const onToggleFavorite = (e) => {
    // The card is a <Link>; keep the heart click from navigating.
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(builder.id, isStudio ? "studio" : "builder");
  };

  const selectSlide = (e, nextIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex(nextIndex);
  };

  const onTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchDidSwipe.current = false;
  };

  const onTouchEnd = (event) => {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX == null || endX == null || Math.abs(endX - startX) < 36 || count < 2) return;
    touchDidSwipe.current = true;
    setIndex((current) => (endX < startX ? (current + 1) % count : (current - 1 + count) % count));
  };

  const openPortfolioImage = (event, imageIndex) => {
    event.preventDefault();
    event.stopPropagation();
    if (touchDidSwipe.current) {
      touchDidSwipe.current = false;
      return;
    }
    setLightbox({ kind: "portfolio", index: imageIndex });
  };

  const openAvatar = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setLightbox({ kind: "avatar", index: 0 });
  };

  const lightboxImage = lightbox?.kind === "avatar"
    ? { url: builder.avatar, alt: `${builder.display_name} profile photo` }
    : lightbox?.kind === "portfolio"
      ? { url: publicAsset(previews[lightbox.index]?.thumbnail), alt: previews[lightbox.index]?.title }
      : null;

  return (
    <>
    <Link
      href={
        isStudio
          ? `/studios?s=${encodeURIComponent(builder.username)}`
          : `/builders/profile?u=${encodeURIComponent(builder.username)}`
      }
      className="offer-card glass rounded-3xl overflow-hidden flex flex-col group cursor-pointer"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* ── Portfolio carousel (full-bleed, swipeable thumbnails) ──────── */}
      <div
        className="group/media card-carousel relative h-64 sm:h-72 flex-shrink-0 overflow-hidden bg-black/40"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {count === 0 ? (
          <div className="w-full h-full bg-white/[0.03] flex items-center justify-center text-gray-600 text-sm">
            Portfolio coming soon
          </div>
        ) : (
          <div
            className="card-carousel-track flex h-full w-full"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {previews.map((p, imageIndex) => (
              <button
                key={p.id}
                type="button"
                onClick={(event) => openPortfolioImage(event, imageIndex)}
                className="group/photo relative h-full w-full flex-shrink-0 cursor-zoom-in overflow-hidden text-left"
                aria-label={`Open ${p.title || "portfolio image"} full screen`}
              >
                <img
                  src={publicAsset(p.thumbnail)}
                  alt={p.title}
                  className={`w-full h-full object-cover transition-transform duration-[550ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                    infoHover ? "scale-[1.07]" : "scale-100"
                  }`}
                  loading="lazy"
                  decoding="async"
                />
                <span className="absolute right-4 bottom-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 text-xs font-semibold text-white opacity-0 backdrop-blur-md transition-all group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100">
                  <ExpandIcon /> View full screen
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

        {/* Overlay + "View Profile" CTA — only when hovering the info block */}
        <div
          className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-300 pointer-events-none ${
            infoHover ? "opacity-100" : "opacity-0"
          }`}
        >
          <span
            className={`inline-flex items-center gap-2 px-6 py-2.5 bg-[#4ade80] text-black text-sm font-bold rounded-full shadow-lg shadow-green-500/30 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              infoHover ? "translate-y-0" : "translate-y-2.5"
            }`}
          >
            View {isStudio ? "Studio" : "Profile"}
            <ArrowIcon />
          </span>
        </div>

        {/* Carousel arrows — only when hovering the image, only if >1 slide */}
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous build"
              onClick={(e) => go(e, -1)}
              className="carousel-arrow absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
            >
              <ChevronIcon className="w-5 h-5 rotate-180" />
            </button>
            <button
              type="button"
              aria-label="Next build"
              onClick={(e) => go(e, 1)}
              className="carousel-arrow absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
            >
              <ChevronIcon className="w-5 h-5" />
            </button>

            {/* Slide dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 opacity-80 group-hover/media:opacity-100 transition-opacity duration-200" role="tablist" aria-label="Portfolio images">
              {previews.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={(event) => selectSlide(event, i)}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Show image ${i + 1}`}
                  className={`carousel-progress-indicator h-1.5 rounded-full ${
                    i === index ? "w-4 bg-[#4ade80]" : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Availability indicator — top left. Mirrors the builder's busyness
            slider: green = available, amber = limited. "Busy" (red) builders are
            filtered out of the feed entirely, so they never render here. */}
        {isStudio && !builder.has_capacity ? (
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-xs bg-black/60 text-amber-300 backdrop-blur-sm border border-amber-400/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Message only
          </div>
        ) : builder.availability_status === "limited" ? (
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-xs bg-black/60 text-amber-400 backdrop-blur-sm border border-amber-400/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Limited
          </div>
        ) : (
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-xs bg-black/60 text-[#4ade80] backdrop-blur-sm border border-[#4ade80]/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] online-dot" />
            Available
          </div>
        )}

        {/* Top-right cluster — favorite toggle + portfolio count */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          {canFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={favorited}
              aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
              title={favorited ? "Remove from favorites" : "Add to favorites"}
              className={`w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md border transition-all duration-200 ${
                favorited
                  ? "bg-[#4ade80] text-black border-[#4ade80] shadow-[0_0_16px_rgba(74,222,128,0.5)]"
                  : "bg-black/60 text-white border-white/15 hover:border-[#4ade80]/60 hover:text-[#4ade80] card-fav-btn"
              }`}
            >
              <HeartIcon className="w-4 h-4" filled={favorited} />
            </button>
          )}
          <div className="px-2.5 py-1 rounded-full text-xs bg-black/60 text-white/70 backdrop-blur-sm border border-white/10">
            {builder.portfolio.length} {builder.portfolio.length === 1 ? "build" : "builds"} in portfolio
          </div>
        </div>
      </div>

      {/* ── Builder info ──────────────────────────────────────── */}
      <div
        className="p-5 flex flex-col gap-3 flex-1"
        onMouseEnter={() => setInfoHover(true)}
        onMouseLeave={() => setInfoHover(false)}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          {builder.avatar ? (
            <button type="button" onClick={openAvatar} className="group/avatar relative w-11 h-11 flex-shrink-0 cursor-zoom-in rounded-full" aria-label={`Open ${builder.display_name} profile photo full screen`}>
              <img
                src={builder.avatar}
                alt={builder.display_name}
                className="w-full h-full rounded-full object-cover ring-2 ring-[#4ade80]/25"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100"><ExpandIcon className="h-4 w-4" /></span>
            </button>
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#4ade80]/15 border border-[#4ade80]/30 ring-2 ring-[#4ade80]/25 flex-shrink-0 flex items-center justify-center text-[#4ade80] font-bold">
              {(builder.display_name || "B").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* Name row: studio affiliation (migration 0026) sits to the LEFT of
                the nickname, then the name, then the rank badge. Non-clickable
                here because the whole card is already a <Link>; the storefront
                link lives on the profile page header. */}
            <div className="flex items-center gap-2">
              {builder.studio && (
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 inline-flex items-center gap-1 flex-shrink-0 max-w-[45%]"
                  title={`Builder from ${builder.studio.name}`}
                >
                  {builder.studio.logo_url && (
                    <img src={builder.studio.logo_url} alt="" className="w-3 h-3 rounded-sm object-cover flex-shrink-0" />
                  )}
                  <span className="truncate">{builder.studio.name}</span>
                </span>
              )}
              <p className="text-base font-bold truncate leading-tight min-w-0">
                {builder.display_name}
              </p>
              {isStudio && builder.is_verified && (
                <StudioOfficialBadge />
              )}
              {isStudio ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold border flex-shrink-0 bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30">
                  Studio
                </span>
              ) : (
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex-shrink-0 ${rank.bgClass} ${rank.textClass} ${rank.borderClass}`}>
                  {rank.label}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">@{builder.username}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <StarIcon className="w-3 h-3 text-amber-400" />
              <span className="text-xs font-semibold">{builder.avg_rating.toFixed(2)}</span>
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-400">{builder.completed_projects} projects</span>
            </div>
          </div>
        </div>

        {/* Specialties */}
        {builder.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {builder.specialties.slice(0, 3).map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 text-[11px] rounded-full bg-white/5 border border-white/10 text-gray-400"
              >
                {s}
              </span>
            ))}
            {builder.specialties.length > 3 && (
              <span className="px-2 py-0.5 text-[11px] rounded-full bg-white/5 border border-white/10 text-gray-500">
                +{builder.specialties.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Bio one-liner */}
        {builder.bio && (
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
            {builder.bio}
          </p>
        )}

        {/* Footer — rates + CTA */}
        <div className="mt-auto pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
              Rates from
            </p>
            <p className="text-[#4ade80] font-bold text-lg leading-none">
              {builder.starts_from > 0 ? formatPrice(builder.starts_from) : "—"}
            </p>
          </div>

          <span className="offer-card-view-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4ade80]/12 border border-[#4ade80]/30 text-[#4ade80] text-xs font-semibold transition-all duration-200 group-hover:bg-[#4ade80] group-hover:text-black group-hover:shadow-[0_0_18px_rgba(74,222,128,0.45)] group-hover:border-[#4ade80]">
            View {isStudio ? "Studio" : "Profile"}
            <ArrowIcon className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
    {lightboxImage && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-3 backdrop-blur-xl sm:p-8" role="dialog" aria-modal="true" aria-label="Full-screen builder photo" onClick={() => setLightbox(null)}>
        <button type="button" onClick={() => setLightbox(null)} className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-2xl text-white transition hover:border-[#4ade80]/60 hover:text-[#4ade80]" aria-label="Close full-screen photo">×</button>
        <div className="relative flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
          <img src={lightboxImage.url} alt={lightboxImage.alt || builder.display_name} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          {lightbox?.kind === "portfolio" && count > 1 && <>
            <button type="button" onClick={() => goLightbox(-1)} className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:left-4" aria-label="Previous full-screen photo"><ChevronIcon className="h-6 w-6 rotate-180" /></button>
            <button type="button" onClick={() => goLightbox(1)} className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/45 bg-black/65 text-white backdrop-blur-md transition hover:bg-[#4ade80] hover:text-black sm:right-4" aria-label="Next full-screen photo"><ChevronIcon className="h-6 w-6" /></button>
          </>}
          {lightbox?.kind === "portfolio" && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">{lightbox.index + 1} / {count}</span>}
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
