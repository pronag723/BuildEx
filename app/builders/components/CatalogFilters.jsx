"use client";

import { useState } from "react";
import { STYLES, BUILD_TYPES, RATING_OPTIONS, RANKS } from "../data/builders";

// ─── Custom checkbox row (button-based for guaranteed click handling) ────────
function FilterCheckbox({ label, emoji, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="w-full flex items-center gap-2.5 cursor-pointer group py-1.5 select-none text-left"
    >
      <span
        className={`w-4 h-4 rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          checked
            ? "bg-[#4ade80] border-[#4ade80]"
            : "border-white/20 group-hover:border-[#4ade80]/40"
        }`}
      >
        {checked && (
          <svg
            className="w-2.5 h-2.5 text-black"
            viewBox="0 0 12 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M1 5l3.5 3.5L11 1" />
          </svg>
        )}
      </span>
      <span
        className={`text-sm transition-colors leading-none ${
          checked ? "text-white" : "text-gray-400 group-hover:text-gray-200"
        }`}
      >
        {emoji && <span className="mr-1.5">{emoji}</span>}
        {label}
      </span>
    </button>
  );
}

// ─── Rank checkbox with coloured dot ─────────────────────────────────────────
function RankCheckbox({ rankKey, checked, onChange }) {
  const meta = RANKS[rankKey];
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="w-full flex items-center gap-2.5 cursor-pointer group py-1.5 select-none text-left"
    >
      <span
        className={`w-4 h-4 rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          checked
            ? `${meta.bgClass} ${meta.borderClass}`
            : "border-white/20 group-hover:border-white/30"
        }`}
      >
        {checked && (
          <svg
            className={`w-2.5 h-2.5 ${meta.textClass}`}
            viewBox="0 0 12 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M1 5l3.5 3.5L11 1" />
          </svg>
        )}
      </span>
      <span className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 transition-opacity"
          style={{ background: meta.dotColor, opacity: checked ? 1 : 0.5 }}
        />
        <span
          className={`text-sm transition-colors leading-none ${
            checked ? meta.textClass : "text-gray-400 group-hover:text-gray-200"
          }`}
        >
          {meta.label}
        </span>
      </span>
    </button>
  );
}

// ─── Rating radio row (also button-based) ────────────────────────────────────
function RatingOption({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="w-full flex items-center gap-2.5 cursor-pointer group py-1.5 select-none text-left"
    >
      <span
        className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          active
            ? "border-[#4ade80] bg-[#4ade80]"
            : "border-white/20 group-hover:border-[#4ade80]/40"
        }`}
      >
        {active && <span className="w-1.5 h-1.5 rounded-full bg-black" />}
      </span>
      <span
        className={`text-sm transition-colors leading-none ${
          active ? "text-white" : "text-gray-400 group-hover:text-gray-200"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function FilterGroup({ label, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-white/[0.07] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-4 text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
      >
        {label}
        <svg
          className={`w-4 h-4 transition-transform duration-300 flex-shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? "500px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="pb-4 space-y-0.5">{children}</div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function CatalogFilters({
  selectedStyles,
  onStyleToggle,
  selectedBuildTypes,
  onBuildTypeToggle,
  minPrice,
  maxPrice,
  onPriceChange,
  minRating,
  onRatingChange,
  selectedRanks,
  onRankToggle,
  onClearAll,
  activeFilterCount,
}) {
  return (
    <div className="glass rounded-3xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-base">Filters</h2>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-[#4ade80] hover:text-green-300 transition-colors flex items-center gap-1.5"
          >
            Clear all
            <span className="w-4 h-4 bg-[#4ade80]/15 rounded-full text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          </button>
        )}
      </div>

      {/* Style */}
      <FilterGroup label="Style">
        {STYLES.map((s) => (
          <FilterCheckbox
            key={s.key}
            label={s.label}
            emoji={s.emoji}
            checked={selectedStyles.includes(s.key)}
            onChange={() => onStyleToggle(s.key)}
          />
        ))}
      </FilterGroup>

      {/* Build type */}
      <FilterGroup label="Build Type" defaultOpen={false}>
        {BUILD_TYPES.map((bt) => (
          <FilterCheckbox
            key={bt.key}
            label={bt.label}
            checked={selectedBuildTypes.includes(bt.key)}
            onChange={() => onBuildTypeToggle(bt.key)}
          />
        ))}
      </FilterGroup>

      {/* Price range */}
      <FilterGroup label="Price Range" defaultOpen={false}>
        <div className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
              $
            </span>
            <input
              type="number"
              min="0"
              placeholder="Min"
              value={minPrice || ""}
              onChange={(e) =>
                onPriceChange({ min: Number(e.target.value), max: maxPrice })
              }
              className="price-input w-full glass rounded-xl pl-6 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#4ade80]/50 transition-all"
            />
          </div>
          <span className="text-gray-500 text-sm flex-shrink-0">—</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
              $
            </span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              value={maxPrice || ""}
              onChange={(e) =>
                onPriceChange({ min: minPrice, max: Number(e.target.value) })
              }
              className="price-input w-full glass rounded-xl pl-6 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#4ade80]/50 transition-all"
            />
          </div>
        </div>
      </FilterGroup>

      {/* Rating */}
      <FilterGroup label="Rating" defaultOpen={false}>
        {RATING_OPTIONS.map((opt) => (
          <RatingOption
            key={opt.value}
            label={opt.label}
            active={minRating === opt.value}
            onClick={() => onRatingChange(opt.value)}
          />
        ))}
      </FilterGroup>

      {/* Builder rank */}
      <FilterGroup label="Builder Rank" defaultOpen={false}>
        {Object.keys(RANKS).map((rankKey) => (
          <RankCheckbox
            key={rankKey}
            rankKey={rankKey}
            checked={selectedRanks.includes(rankKey)}
            onChange={() => onRankToggle(rankKey)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}
