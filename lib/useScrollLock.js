"use client";

import { useEffect } from "react";

// Module-scoped counter so multiple simultaneously-open overlays don't clobber
// each other: the body stays locked until the LAST one unlocks, and the original
// overflow is only restored once.
let lockCount = 0;
let savedOverflow = "";

/**
 * Lock body scroll while `active` is true (e.g. a full-screen modal / lightbox
 * dimming the page behind it). Restores the page's previous overflow when the
 * last lock releases. Mirrors the inline pattern in FiltersMobileModal.
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;

    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
      }
    };
  }, [active]);
}
