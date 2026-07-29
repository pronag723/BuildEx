"use client";

import { useEffect, useRef } from "react";
import CatalogFilters from "./CatalogFilters";

export default function FiltersMobileModal({
  open,
  onClose,
  resultCount,
  ...filterProps
}) {
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      previousFocusRef.current = document.activeElement;
      closeButtonRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
      if (open) previousFocusRef.current?.focus();
    };
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
      aria-label="Filter options"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute inset-y-0 right-0 w-[min(400px,94vw)] flex flex-col transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0 opacity-100" : "translate-x-full opacity-70"
        }`}
      >
        <div className="flex flex-col h-full glass border-l border-white/10 overflow-hidden shadow-[-24px_0_80px_rgba(0,0,0,0.35)]">
          {/* Modal header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.08] flex-shrink-0">
            <div>
              <h2 className="font-semibold">Filters</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Refine builders and studios
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 hover:rotate-90 flex items-center justify-center transition-all duration-300"
              aria-label="Close filters"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 6l8 8M14 6l-8 8" />
              </svg>
            </button>
          </div>

          {/* Scrollable filter content */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-3 catalog-sidebar">
            <CatalogFilters {...filterProps} />
          </div>

          {/* Footer */}
          <div className="px-5 sm:px-6 py-4 border-t border-white/[0.08] flex-shrink-0 bg-black/10">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-[#4ade80] text-black font-semibold rounded-2xl text-sm green-glow hover:scale-[1.02] active:scale-[0.99] transition-transform duration-200"
            >
              Show {resultCount} {resultCount === 1 ? "provider" : "providers"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
