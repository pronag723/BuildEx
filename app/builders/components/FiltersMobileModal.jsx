"use client";

import { useEffect } from "react";
import CatalogFilters from "./CatalogFilters";

export default function FiltersMobileModal({ open, onClose, ...filterProps }) {
  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
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
      className={`fixed inset-0 z-[90] lg:hidden ${open ? "" : "pointer-events-none"}`}
      aria-modal={open}
      aria-hidden={!open}
      role="dialog"
      aria-label="Filter options"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute inset-y-0 left-0 w-[min(320px,90vw)] flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full glass border-r border-white/10 overflow-hidden">
          {/* Modal header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
            <h2 className="font-semibold">Filter Offers</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
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
          <div className="flex-1 overflow-y-auto px-5 py-2 catalog-sidebar">
            <CatalogFilters {...filterProps} />
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/[0.08] flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-[#4ade80] text-black font-semibold rounded-2xl text-sm green-glow hover:scale-[1.02] transition-transform"
            >
              Show Results
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
