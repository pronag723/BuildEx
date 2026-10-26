"use client";

import { useId, useRef, useState } from "react";
import { useT } from "../i18n/LanguageProvider";
import { Icon } from "../icons";
import { experienceYears } from "../works/format.mjs";
import { useDismiss } from "./useDismiss";

const YEARS_SHOWN = 16;

/** "7 years" / "under a year", for the trigger and the popover's hint. */
export function yearsText(year, t) {
  const years = experienceYears(year);
  if (years == null) return null;
  return years === 0 ? t("account.editor.year.lessThanYear") : t("account.editor.year.years", { count: years });
}

// "Building since <year>": a trigger that opens a grid of the last 16 years
// (this one first), not a native <select>. Picking a year, a press outside and
// Escape all close it; "Don't specify" clears the value (null).
//
//   variant="inline" — the profile's meta row: "Building since 2019 · 7 years ▾"
//   variant="field"  — an input-shaped button for forms (onboarding)
export default function YearPicker({ value, onChange, variant = "inline", id, disabled = false, className = "" }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const titleId = useId();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_SHOWN }, (_, i) => thisYear - i);
  const since = value ?? null;
  const span = yearsText(since, t);

  const close = (reason) => {
    setOpen(false);
    if (reason === "escape") triggerRef.current?.focus();
  };
  useDismiss(rootRef, open, close);

  const pick = (year) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (year !== since) onChange(year);
  };

  const label = since ? t("account.editor.year.label", { year: since, years: span }) : t("account.editor.year.empty");

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {variant === "field" ? (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="onb-input flex w-auto min-w-[12rem] items-center justify-between gap-3 text-left"
        >
          <span className={since ? "text-ink" : "text-ink-3"}>{since ?? t("account.experience.none")}</span>
          <Icon name="chevronDown" size={16} className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="edit-zone inline-flex h-[34px] items-center gap-1.5 text-[13px] text-ink-2 lg:h-[30px] lg:text-[13.5px]"
        >
          <Icon name="briefcase" size={14} className="text-ink-3" />
          <span className={since ? "text-ink" : "text-ink-3"}>{label}</span>
          <Icon
            name="chevronDown"
            size={14}
            strokeWidth={2.2}
            className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {open && (
        <div className="menu-panel popover-rise absolute left-0 top-[calc(100%+8px)] z-40 w-[296px] max-w-[calc(100vw-2rem)] rounded-[18px] p-3.5 lg:w-[300px]">
          <div className="flex items-center justify-between gap-2">
            <span id={titleId} className="text-sm font-semibold text-ink">
              {t("account.editor.year.title")}
            </span>
            {span && <span className="text-xs text-ink-3">{t("account.editor.year.experience", { years: span })}</span>}
          </div>
          <div role="listbox" aria-labelledby={titleId} className="mt-3 grid grid-cols-4 gap-1.5">
            {years.map((year) => {
              const on = year === since;
              return (
                <button
                  key={year}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => pick(year)}
                  className={`h-[38px] rounded-[10px] border text-[13px] font-semibold transition-colors lg:h-9 ${
                    on
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-line/[0.06] bg-raised text-ink hover:border-line/20"
                  }`}
                >
                  {year}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-2.5 h-9 w-full rounded-[10px] text-[13px] font-medium text-ink-3 transition-colors hover:bg-line/[0.05] hover:text-ink-2"
          >
            {t("account.editor.year.none")}
          </button>
        </div>
      )}
    </div>
  );
}
