"use client";

import { useEffect, useRef } from "react";

// Closes a popover on a press outside `ref` or on Escape. `refs` may hold more
// than one element (an anchored popover and its trigger, a portalled sheet).
// Escape is handled on the capture phase so a dialog underneath doesn't also
// take it.
export function useDismiss(refs, open, onClose) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const list = Array.isArray(refs) ? refs : [refs];
    const inside = (target) => list.some((r) => r.current && r.current.contains(target));
    const onPointerDown = (event) => {
      if (!inside(event.target)) close.current("outside");
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close.current("escape");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
