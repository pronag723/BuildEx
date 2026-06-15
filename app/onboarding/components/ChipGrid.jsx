"use client";

import { Icon } from "../../../lib/icons";

/**
 * Animated selectable chips for multi/single-select inputs (styles, build
 * types, project types, interests).
 *
 * Props:
 *   - options:  [{ key, label, icon? }]
 *   - value:    array of selected keys (multi) OR single string (single)
 *   - onChange: (newValue) => void
 *   - multi:    bool (default true)
 *   - max:      optional cap on multi-select
 */
export default function ChipGrid({
  options,
  value,
  onChange,
  multi = true,
  max,
  ariaLabel,
}) {
  const selected = multi ? new Set(Array.isArray(value) ? value : []) : value;

  function toggle(key) {
    if (multi) {
      const next = new Set(selected);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (typeof max === "number" && next.size >= max) return;
        next.add(key);
      }
      onChange(Array.from(next));
    } else {
      onChange(value === key ? null : key);
    }
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = multi ? selected.has(opt.key) : value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => toggle(opt.key)}
            aria-pressed={isActive}
            className={`chip ${isActive ? "is-active" : ""}`}
          >
            {opt.icon && <Icon name={opt.icon} size={16} className="chip-icon" />}
            <span>{opt.label}</span>
            <span className="chip-check" aria-hidden="true">
              <svg viewBox="0 0 12 10" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 5l3.5 3.5L11 1" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}
