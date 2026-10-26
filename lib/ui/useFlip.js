"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

export const FLIP_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

// FLIP for a set of children that change position or size: call `capture()`
// right before the state change that moves them; after React commits, each
// child that moved is played from where it was to where it is now. Children
// are found by `data-flip-id`. `capture(skipId)` leaves one child alone (the
// tile under the pointer, which positions itself).
//
// A child caught mid-glide is measured where it currently appears, so a
// second change during a glide continues smoothly instead of jumping.
export function useFlip(containerRef, { disabled = false, duration = 340, easing = FLIP_EASING } = {}) {
  const pending = useRef(null);

  const capture = useCallback(
    (skipId = null) => {
      const root = containerRef.current;
      if (disabled || !root) return;
      const rects = new Map();
      root.querySelectorAll("[data-flip-id]").forEach((node) => {
        rects.set(node.dataset.flipId, node.getBoundingClientRect());
      });
      pending.current = { rects, skipId: skipId == null ? null : String(skipId) };
    },
    [containerRef, disabled]
  );

  // Runs after every commit; does nothing unless capture() came first.
  useLayoutEffect(() => {
    const root = containerRef.current;
    const job = pending.current;
    pending.current = null;
    if (!root || !job) return;
    root.querySelectorAll("[data-flip-id]").forEach((node) => {
      const id = node.dataset.flipId;
      const first = job.rects.get(id);
      if (!first || id === job.skipId) return;
      node._flip?.cancel();
      const last = node.getBoundingClientRect();
      if (!last.width || !last.height) return;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const sx = first.width / last.width;
      const sy = first.height / last.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
      node.style.transformOrigin = "0 0";
      node._flip = node.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: "none" }],
        { duration, easing }
      );
    });
  });

  return capture;
}
