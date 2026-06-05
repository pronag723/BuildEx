"use client";

import { useState } from "react";
import Link from "next/link";
import { RANKS } from "../data/builders";
import { publicAsset, withBase } from "../../home/utils";
import { formatPrice } from "../../../lib/pricing";
import { useFavorites } from "../../../lib/favorites/FavoritesContext";

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

export default function BuilderCard({ builder, animationDelay = 0 }) {
  const rank = RANKS[builder.rank];
  const previews = builder.portfolio.slice(0, 6);
  const count = previews.length;

  const [index, setIndex] = useState(0);
  const [infoHover, setInfoHover] = useState(false);

  const { canFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(builder.id);

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
    toggleFavorite(builder.id);
  };

  return (
    <Link
      href={`/builders/profile?u=${encodeURIComponent(builder.username)}`}
      className="offer-card glass rounded-3xl overflow-hidden flex flex-col group cursor-pointer"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* ── Portfolio carousel (full-bleed, swipeable thumbnails) ──────── */}
      <div className="group/media relative h-52 flex-shrink-0 overflow-hidden bg-black/40">
        {count === 0 ? (
          <div className="w-full h-full bg-white/[0.03] flex items-center justify-center text-gray-600 text-sm">
            Portfolio coming soon
          </div>
        ) : (
          <div
            className="flex h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {previews.map((p) => (
              <div key={p.id} className="relative h-full w-full flex-shrink-0 overflow-hidden">
                <img
                  src={publicAsset(p.thumbnail)}
                  alt={p.title}
                  className={`w-full h-full object-cover transition-transform duration-[550ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                    infoHover ? "scale-[1.07]" : "scale-100"
                  }`}
                  loading="lazy"
                  decoding="async"
                />
              </div>
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
            View Profile
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
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
            >
              <ChevronIcon className="w-5 h-5 rotate-180" />
            </button>
            <button
              type="button"
              aria-label="Next build"
              onClick={(e) => go(e, 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
            >
              <ChevronIcon className="w-5 h-5" />
            </button>

            {/* Slide dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 opacity-80 group-hover/media:opacity-100 transition-opacity duration-200">
              {previews.map((p, i) => (
                <span
                  key={p.id}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
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
        {builder.availability_status === "limited" ? (
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
                  : "bg-black/60 text-white border-white/15 hover:border-[#4ade80]/60 hover:text-[#4ade80]"
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
            <img
              src={builder.avatar}
              alt={builder.display_name}
              className="w-11 h-11 rounded-full object-cover ring-2 ring-[#4ade80]/25 flex-shrink-0"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#4ade80]/15 border border-[#4ade80]/30 ring-2 ring-[#4ade80]/25 flex-shrink-0 flex items-center justify-center text-[#4ade80] font-bold">
              {(builder.display_name || "B").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold truncate leading-tight">
                {builder.display_name}
              </p>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex-shrink-0 ${rank.bgClass} ${rank.textClass} ${rank.borderClass}`}>
                {rank.label}
              </span>
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
            View Profile
            <ArrowIcon className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
