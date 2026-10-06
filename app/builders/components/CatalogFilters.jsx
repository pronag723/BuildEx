"use client";

import { STYLES, BUILD_TYPES } from "../data/builders";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// ─── Checkbox row (button-based for guaranteed click handling) ───────────────
function FilterCheckbox({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="group flex min-h-[2.25rem] w-full items-center gap-3 py-1.5 text-left text-sm leading-snug select-none"
    >
      <span
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
          checked
            ? "border-accent bg-accent text-accent-fg"
            : "border-line/25 group-hover:border-line/45"
        }`}
      >
        {checked && <Icon name="check" size={12} strokeWidth={3} />}
      </span>
      <span className={`transition-colors ${checked ? "text-ink" : "text-ink-2 group-hover:text-ink"}`}>
        {label}
      </span>
    </button>
  );
}

function FilterGroup({ label, children }) {
  return (
    <fieldset className="border-b border-line/[0.08] py-4 last:border-b-0">
      <legend className="float-left mb-1.5 w-full text-[13px] font-medium text-ink-3">{label}</legend>
      <div className="clear-both grid grid-cols-2 gap-x-3">{children}</div>
    </fieldset>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
// Lives inside the filter drawer. Groups are always open — there are only two,
// and collapsing a list of ten checkboxes saved nothing but a click.
export default function CatalogFilters({
  selectedStyles,
  onStyleToggle,
  selectedBuildTypes,
  onBuildTypeToggle,
  favoritesOnly,
  onFavoritesToggle,
  canFavorite,
  favoriteCount,
}) {
  const t = useT();
  return (
    <div>
      {/* Favorites — signed-in users only */}
      {canFavorite && (
        <div className="border-b border-line/[0.08] py-4">
          <button
            type="button"
            onClick={onFavoritesToggle}
            aria-pressed={favoritesOnly}
            className={`flex h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm transition-colors ${
              favoritesOnly
                ? "border-accent/55 bg-accent/10 text-ink"
                : "border-line/10 text-ink-2 hover:border-line/25 hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Icon name="heart" size={16} filled={favoritesOnly} className={favoritesOnly ? "text-accent-ink" : ""} />
              {t("catalog.favoritesOnly")}
            </span>
            {favoriteCount > 0 && (
              <span className="text-xs tabular-nums text-ink-3">{favoriteCount}</span>
            )}
          </button>
        </div>
      )}

      <FilterGroup label={t("catalog.style")}>
        {STYLES.map((s) => (
          <FilterCheckbox
            key={s.key}
            label={t(`styles.${s.key}`)}
            checked={selectedStyles.includes(s.key)}
            onChange={() => onStyleToggle(s.key)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label={t("catalog.buildType")}>
        {BUILD_TYPES.map((bt) => (
          <FilterCheckbox
            key={bt.key}
            label={t(`buildTypes.${bt.key}`)}
            checked={selectedBuildTypes.includes(bt.key)}
            onChange={() => onBuildTypeToggle(bt.key)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}
