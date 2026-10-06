"use client";

import { useState, useRef, useEffect } from "react";
import { SORT_OPTIONS } from "../data/builders";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// A small "Sort: Recommended ▾" control beside the result count, opening a
// plain list with a check on the current choice. The per-option coloured icon
// tiles and the "Default" badge it used to carry are gone — two options do not
// need a legend.
export default function CatalogSort({ sort, onSortChange }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const current = SORT_OPTIONS.find((o) => o.key === sort) || SORT_OPTIONS[0];

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
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="btn btn-ghost btn-sm gap-1 pr-2 font-medium"
      >
        <span className="text-ink-3">{t("catalog.sort.label")}</span>
        <span className="text-ink">{t(`catalog.sort.${current.key}`)}</span>
        <Icon
          name="chevronDown"
          size={15}
          className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        role="listbox"
        aria-label={t("catalog.sort.aria")}
        className={`menu-panel absolute right-0 top-[calc(100%+6px)] w-56 p-1 origin-top-right transition-[opacity,transform] duration-150 ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
      >
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sort;
          return (
            <button
              key={opt.key}
              role="option"
              aria-selected={active}
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onSortChange(opt.key);
                setOpen(false);
              }}
              className={`flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm transition-colors ${
                active ? "text-ink font-medium" : "text-ink-2 hover:bg-line/[0.06] hover:text-ink"
              }`}
            >
              {t(`catalog.sort.${opt.key}`)}
              {active && <Icon name="check" size={15} className="text-accent-ink" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
