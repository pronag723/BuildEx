"use client";

import { useState, useRef, useEffect } from "react";
import { SORT_OPTIONS } from "../data/builders";

// ─── Inline SVG icons ────────────────────────────────────────────────────────
const Icon = {
  sparkle: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 2v3M10 15v3M3 10h3M14 10h3M5.5 5.5l2 2M12.5 12.5l2 2M5.5 14.5l2-2M12.5 7.5l2-2" />
    </svg>
  ),
  star: (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ),
  arrowUp: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 16V4M5 9l5-5 5 5" />
    </svg>
  ),
  arrowDown: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 4v12M5 11l5 5 5-5" />
    </svg>
  ),
  fire: (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M10 1.5c.6 1.2.4 2.3-.4 3.4-.7 1-1.7 2-1.7 3.3 0 .6.2 1.2.7 1.6-1.5-.3-2.6-1.5-2.6-3.1 0-1 .4-1.8 1-2.6C4.5 4.9 3.5 6.8 3.5 8.9c0 3.6 2.9 6.6 6.5 6.6s6.5-3 6.5-6.6c0-3.6-2-6.4-6.5-7.4z" />
    </svg>
  ),
  check: (props) => (
    <svg viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M1 5l4 4L13 1" />
    </svg>
  ),
  chevron: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 8 4 4 4-4" />
    </svg>
  ),
  shuffle: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 5h3.2c.9 0 1.7.4 2.2 1.1l3.2 4.3c.5.7 1.3 1.1 2.2 1.1H17M3 15h3.2c.9 0 1.7-.4 2.2-1.1l.9-1.2M12.7 6.3l.9-1.2c.5-.7 1.3-1.1 2.2-1.1H17M15 2l2 3-2 3M15 12l2 3-2 3" />
    </svg>
  ),
};

// ─── Per-option metadata (icon, accent colour, description) ──────────────────
const SORT_META = {
  featured: {
    Icon: Icon.shuffle,
    text: "text-[#4ade80]",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/25",
    desc: "A fresh mix every visit",
    badge: "Default",
  },
  newest: {
    Icon: Icon.sparkle,
    text: "text-sky-400",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/25",
    desc: "Newest builders first",
  },
  rating: {
    Icon: Icon.star,
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/25",
    desc: "Top-reviewed creators",
    badge: "Popular",
  },
  price_asc: {
    Icon: Icon.arrowUp,
    text: "text-[#4ade80]",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/25",
    desc: "Lowest starting rates",
  },
  price_desc: {
    Icon: Icon.arrowDown,
    text: "text-violet-400",
    bg: "bg-violet-500/10",
    ring: "ring-violet-500/25",
    desc: "Premium creators first",
  },
  orders: {
    Icon: Icon.fire,
    text: "text-rose-400",
    bg: "bg-rose-500/10",
    ring: "ring-rose-500/25",
    desc: "Most completed projects",
  },
};

export default function CatalogSort({ sort, onSortChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const current = SORT_OPTIONS.find((o) => o.key === sort) || SORT_OPTIONS[0];
  const currentMeta = SORT_META[current.key];
  const CurrentIcon = currentMeta.Icon;

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-shrink-0 z-50">
      {/* ── Trigger button ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2.5 glass rounded-2xl pl-2 pr-3 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap min-w-[210px] ${
          open
            ? "border-[#4ade80]/40 shadow-[0_0_22px_rgba(74,222,128,0.12)]"
            : "hover:border-white/25"
        }`}
      >
        {/* Icon chip */}
        <span
          className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${currentMeta.bg} ${currentMeta.text}`}
        >
          <CurrentIcon className="w-3.5 h-3.5" />
        </span>

        {/* Label */}
        <span className="flex-1 text-left flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Sort by
          </span>
          <span className="text-sm">{current.label}</span>
        </span>

        {/* Chevron */}
        <Icon.chevron
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
            open ? "rotate-180 text-[#4ade80]" : ""
          }`}
        />
      </button>

      {/* ── Dropdown panel ──────────────────────────────────────────────────── */}
      <div
        role="listbox"
        aria-label="Sort options"
        className={`absolute left-0 right-auto min-[640px]:left-auto min-[640px]:right-0 top-[calc(100%+10px)] w-[280px] max-w-[calc(100vw-2rem)] z-50 transition-all duration-200 origin-top-left min-[640px]:origin-top-right ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="glass rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          {/* Header */}
          <div className="px-4 pt-3 pb-2.5 border-b border-white/[0.07] flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Sort builders by
            </p>
            <span className="text-[10px] text-gray-600">{SORT_OPTIONS.length} options</span>
          </div>

          {/* Options */}
          <div className="p-1.5">
            {SORT_OPTIONS.map((opt) => {
              const meta = SORT_META[opt.key];
              const OptIcon = meta.Icon;
              const active = opt.key === sort;

              return (
                <button
                  key={opt.key}
                  role="option"
                  aria-selected={active}
                  type="button"
                  onClick={() => {
                    onSortChange(opt.key);
                    setOpen(false);
                  }}
                  className={`sort-option w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left group transition-all duration-150 ${
                    active
                      ? "bg-white/[0.06] ring-1 ring-inset " + meta.ring
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Coloured icon chip */}
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${meta.bg} ${meta.text}`}
                  >
                    <OptIcon className="w-4 h-4" />
                  </span>

                  {/* Label + description */}
                  <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-semibold transition-colors ${
                          active ? "text-white" : "text-gray-200"
                        }`}
                      >
                        {opt.label}
                      </span>
                      {meta.badge && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/25">
                          {meta.badge}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-gray-500 mt-0.5 truncate">
                      {meta.desc}
                    </span>
                  </span>

                  {/* Active check */}
                  {active && (
                    <Icon.check className="w-3.5 h-3.5 text-[#4ade80] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
