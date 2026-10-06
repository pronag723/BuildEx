"use client";

import { useEffect, useRef } from "react";
import CatalogFilters from "./CatalogFilters";
import { useScrollLock } from "../../../lib/useScrollLock";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// The filter drawer (all widths): slides in from the right over a dimmed page.
export default function FiltersMobileModal({
  open,
  onClose,
  resultCount,
  ...filterProps
}) {
  const t = useT();
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Lock body scroll while open. The shared hook ref-counts, so closing this
  // never unlocks the page while another overlay still holds it.
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      id="catalog-filter-drawer"
      className={`fixed inset-0 z-[90] ${open ? "" : "pointer-events-none"}`}
      aria-modal={open}
      aria-hidden={!open}
      role="dialog"
      aria-label={t("catalog.filterOptions")}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute inset-y-0 right-0 flex w-[min(380px,92vw)] flex-col border-l border-line/10 bg-surface shadow-pop transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-[var(--header-h)] flex-shrink-0 items-center justify-between border-b border-line/[0.08] px-5">
          <h2 className="text-base font-semibold">{t("catalog.filters")}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon -mr-2"
            aria-label={t("catalog.closeFilters")}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="catalog-sidebar flex-1 overflow-y-auto px-5 py-2">
          <CatalogFilters {...filterProps} />
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-line/[0.08] px-5 py-4 safe-bottom">
          {filterProps.activeFilterCount > 0 && (
            <button type="button" onClick={filterProps.onClearAll} className="btn btn-ghost btn-lg">
              {t("catalog.clearAll")}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn btn-primary btn-lg flex-1">
            {t("catalog.showResults", { count: resultCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
