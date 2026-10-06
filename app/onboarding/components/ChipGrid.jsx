"use client";

import { Icon } from "../../../lib/icons";

/**
 * Selectable chips for multi/single-select inputs (styles). A selected chip
 * gets an accent outline and a check in front of its label.
 *
 * Props:
 *   - options:  [{ key, label }]
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
            <span className="chip-check" aria-hidden="true">
              <Icon name="check" size={14} strokeWidth={2.5} />
            </span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
