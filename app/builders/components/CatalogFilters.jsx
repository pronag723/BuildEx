"use client";

import { useState } from "react";
import { STYLES, BUILD_TYPES } from "../data/builders";
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
  provider,
  onProviderChange,
  selectedStyles,
  onStyleToggle,
  selectedBuildTypes,
  onBuildTypeToggle,
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

      {/* Provider type */}
      <div className="py-3 border-b border-white/[0.07]">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2.5">
          Provider
        </p>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/20 border border-white/[0.08]">
          {[
            { value: "all", label: "Both" },
            { value: "builders", label: "Builders" },
            { value: "studios", label: "Studios" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onProviderChange(option.value)}
              aria-pressed={provider === option.value}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition-all ${
                provider === option.value
                  ? "bg-[#4ade80] text-black shadow-[0_0_12px_rgba(74,222,128,0.25)]"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
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
