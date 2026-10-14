"use client";

import { useLayoutEffect, useRef } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Glides an element between its old and new height when `trigger` changes
// (e.g. a card swapping its read view for an edit form), then hands the
// height back to the layout, so at rest nothing about the element changes.
// Reversing mid-glide starts from wherever it is. Instant under reduced
// motion.
export function useAnimatedHeight(ref, trigger, duration = 500) {
  const settled = useRef(null);
  const animating = useRef(false);
  const mounted = useRef(false);

  // The height at rest, kept current between triggers (fonts, images and
  // typing can change it without a trigger).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      if (!animating.current) settled.current = el.getBoundingClientRect().height;
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!mounted.current) {
      mounted.current = true;
      return undefined;
    }

    const from = animating.current ? el.getBoundingClientRect().height : settled.current;
    el.style.transition = "none";
    el.style.height = "";
    const to = el.getBoundingClientRect().height;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from == null || Math.abs(from - to) < 1) {
      el.style.transition = "";
      el.style.overflow = "";
      animating.current = false;
      settled.current = to;
      return undefined;
    }

    el.style.height = `${from}px`;
    el.style.overflow = "hidden";
    void el.offsetHeight; // lock in the start height before transitioning
    el.style.transition = `height ${duration}ms ${EASE}`;
    el.style.height = `${to}px`;
    animating.current = true;

    function finish() {
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      el.style.height = "";
      el.style.overflow = "";
      el.style.transition = "";
      animating.current = false;
      settled.current = el.getBoundingClientRect().height;
    }
    function onEnd(event) {
      if (event.target === el && event.propertyName === "height") finish();
    }
    el.addEventListener("transitionend", onEnd);
    // transitionend never comes in a hidden tab; don't leave the height pinned.
    const timer = setTimeout(finish, duration + 120);

    return () => {
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
    };
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps
}
