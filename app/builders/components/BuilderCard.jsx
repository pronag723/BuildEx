"use client";

import { RANKS } from "../data/builders";
import { publicAsset, withBase } from "../../home/utils";

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

export default function BuilderCard({ builder, animationDelay = 0 }) {
  const rank = RANKS[builder.rank];
  const previews = builder.portfolio.slice(0, 3);
  const cols = Math.max(previews.length, 1);

  return (
    <a
      href={withBase(`/builders/profile/${builder.username}`)}
      className="offer-card glass rounded-3xl overflow-hidden flex flex-col group cursor-pointer"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* ── Portfolio strip (1-3 thumbnails, no empty slots) ──────────── */}
      <div
        className="relative h-52 flex-shrink-0 grid gap-0.5 bg-black/40"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {previews.length === 0 ? (
          <div className="w-full h-full bg-white/[0.03] flex items-center justify-center text-gray-600 text-sm">
            Portfolio coming soon
          </div>
        ) : (
          previews.map((p) => (
            <div key={p.id} className="relative overflow-hidden">
              <img
                src={publicAsset(p.thumbnail)}
                alt={p.title}
                className="offer-card-img w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          ))
        )}

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

        {/* Hover overlay */}
        <div className="offer-card-overlay absolute inset-0 bg-black/55 flex items-center justify-center">
          <span className="offer-card-cta inline-flex items-center gap-2 px-6 py-2.5 bg-[#4ade80] text-black text-sm font-bold rounded-full shadow-lg shadow-green-500/30">
            View Profile
            <ArrowIcon />
          </span>
        </div>

        {/* Rank badge — top left */}
        <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm ${rank.bgClass} ${rank.textClass} ${rank.borderClass}`}>
          {rank.label}
        </div>

        {/* Online indicator — top right */}
        {builder.online ? (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs bg-black/60 text-[#4ade80] backdrop-blur-sm border border-[#4ade80]/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] online-dot" />
            Online
          </div>
        ) : (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs bg-black/50 text-white/60 backdrop-blur-sm border border-white/10">
            Offline
          </div>
        )}

        {/* Portfolio count — bottom left */}
        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-xs bg-black/60 text-white/70 backdrop-blur-sm border border-white/10">
          {builder.portfolio.length} {builder.portfolio.length === 1 ? "build" : "builds"} in portfolio
        </div>
      </div>

      {/* ── Builder info ──────────────────────────────────────── */}
      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start gap-3">
          <img
            src={builder.avatar}
            alt={builder.display_name}
            className="w-11 h-11 rounded-full object-cover ring-2 ring-[#4ade80]/25 flex-shrink-0"
            loading="lazy"
            decoding="async"
          />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold truncate leading-tight">
              {builder.display_name}
            </p>
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
              ${builder.starts_from.toLocaleString()}
            </p>
          </div>

          <span className="offer-card-view-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4ade80]/12 border border-[#4ade80]/30 text-[#4ade80] text-xs font-semibold transition-all duration-200 group-hover:bg-[#4ade80] group-hover:text-black group-hover:shadow-[0_0_18px_rgba(74,222,128,0.45)] group-hover:border-[#4ade80]">
            View Profile
            <ArrowIcon className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </a>
  );
}
