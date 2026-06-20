"use client";

import { useState } from "react";
import { STYLES, BUILD_TYPES, RANKS } from "../data/builders";
import { Icon } from "../../../lib/icons";

// ─── Custom checkbox row (button-based for guaranteed click handling) ────────
function FilterCheckbox({ label, icon, checked, onChange }) {
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
        className={`text-sm transition-colors leading-none flex items-center gap-1.5 ${
          checked ? "text-white" : "text-gray-400 group-hover:text-gray-200"
        }`}
      >
        {icon && (
          <Icon
            name={icon}
            size={15}
            className={`flex-shrink-0 transition-colors ${checked ? "text-[#4ade80]" : "text-gray-500 group-hover:text-gray-300"}`}
          />
        )}
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

// ─── Rating slider ────────────────────────────────────────────────────────────
// Replaces the old fixed radio list (4.5+, 4.0+, …) with a continuous 0–5 slider
// in half-star steps. 0 means "any rating".
const RATING_MIN = 0;
const RATING_MAX = 5;
const RATING_STEP = 0.5;

function RatingSlider({ value, onChange }) {
  const pct = ((value - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;

  return (
    <div className="pt-2 pb-1">
      {/* Current value */}
      <div className="flex items-center justify-between mb-3">
        {value > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
            <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {value.toFixed(1)} &amp; up
          </span>
        ) : (
          <span className="text-sm text-gray-400">Any rating</span>
        )}
        {value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="text-xs text-[#4ade80] hover:text-green-300 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Slider (native range, brand-tinted fill via gradient) */}
      <input
        type="range"
        min={RATING_MIN}
        max={RATING_MAX}
        step={RATING_STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Minimum rating"
        aria-valuetext={value > 0 ? `${value.toFixed(1)} stars and up` : "Any rating"}
        className="rating-slider w-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${pct}%, rgba(255,255,255,0.12) ${pct}%, rgba(255,255,255,0.12) 100%)`,
        }}
      />

      {/* Scale labels */}
      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500 select-none">
        <span>Any</span>
        <span>2.5</span>
        <span>5.0</span>
      </div>
    </div>
  );
}

// ─── Favorites toggle (signed-in only) ───────────────────────────────────────
function FavoritesToggle({ active, count, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`w-full flex items-center justify-between gap-2.5 cursor-pointer group py-2.5 px-3 rounded-xl border transition-all duration-200 select-none text-left ${
        active
          ? "bg-[#4ade80]/12 border-[#4ade80]/40"
          : "glass border-white/10 hover:border-white/30"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-colors ${active ? "text-[#4ade80]" : "text-gray-400 group-hover:text-gray-200"}`}
          viewBox="0 0 24 24"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <span className={`text-sm transition-colors leading-none ${active ? "text-white font-medium" : "text-gray-300 group-hover:text-white"}`}>
          Favorites only
        </span>
      </span>
      {count > 0 && (
        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${active ? "bg-[#4ade80] text-black" : "bg-white/10 text-gray-400"}`}>
          {count}
        </span>
      )}
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
  studioOptions = [],
  selectedStudios = [],
  onStudioToggle,
  favoritesOnly,
  onFavoritesToggle,
  canFavorite,
  favoriteCount,
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

      {/* Favorites — signed-in users only */}
      {canFavorite && (
        <div className="py-3 border-b border-white/[0.07]">
          <FavoritesToggle
            active={favoritesOnly}
            count={favoriteCount}
            onToggle={onFavoritesToggle}
          />
        </div>
      )}

      {/* Style */}
      <FilterGroup label="Style">
        {STYLES.map((s) => (
          <FilterCheckbox
            key={s.key}
            label={s.label}
            icon={s.icon}
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
        <RatingSlider value={minRating} onChange={onRatingChange} />
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

      {/* Studios (migration 0026) — only shown when partner studios have builders
          in the feed. */}
      {studioOptions.length > 0 && (
        <FilterGroup label="Studios" defaultOpen={false}>
          {studioOptions.map((s) => (
            <FilterCheckbox
              key={s.slug}
              label={s.name}
              icon="studio"
              checked={selectedStudios.includes(s.slug)}
              onChange={() => onStudioToggle(s.slug)}
            />
          ))}
        </FilterGroup>
      )}
    </div>
  );
}
