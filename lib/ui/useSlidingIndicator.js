"use client";

import { useLayoutEffect, useRef } from "react";

// One underline per row of links or tabs that slides to the active item,
// instead of each item drawing (and dropping) its own. Used by the header nav
// (app/components/SiteHeader.jsx) and the /account tabs.
//
// The caller renders the row on `containerRef` (it must be positioned) and,
// inside it, one empty aria-hidden bar on `barRef`, styled by .slide-indicator.
// The hook finds the item matching `activeSelector` (`[aria-current="page"]`,
// `[aria-selected="true"]`) and puts the bar under its text, inset by the
// item's own left and right padding. With nothing active the bar fades out
// where it is rather than sliding away.
//
// It slides only when the active item changes. When the same item just moves
// or resizes (a language switch, an unread dot, a tab label that shortens on a
// phone, the web fonts swapping in, a window resize) the bar jumps with it, the
// way the text does. It re-measures:
//   - when the active item changes: a MutationObserver, so it does not matter
//     who changed it — a click, the router, the /about scroll-spy;
//   - when the row or any item changes size: a ResizeObserver;
//   - once document.fonts.ready resolves, and on window resize.
// A row that measures zero wide (the header nav is display:none below `lg`)
// is left alone, and the first placement after it reappears is not animated.
//
// `rememberAs` keeps the bar's last spot at module level under that name. The
// header is not in a shared layout — every page renders its own and it mounts
// afresh on each navigation — so its bar starts where the previous page's bar
// was and slides over on the next frame. Without a remembered spot the first
// placement is instant: the bar never slides in from the left edge or grows
// from nothing. Under reduced motion every move is instant (the global rule
// at the end of globals.css cuts the transitions).

const remembered = new Map();

// On a fresh page load the active item can still change for a moment while
// the page settles (the /about scroll-spy reading a restored scroll position
// or a #hash); for that long the bar jumps rather than slides.
const SETTLE_MS = 400;

export function useSlidingIndicator(activeSelector, { rememberAs } = {}) {
  const containerRef = useRef(null);
  const barRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const bar = barRef.current;
    if (!container || !bar) return undefined;

    const start = rememberAs ? remembered.get(rememberAs) : null;
    const settleUntil = start ? 0 : performance.now() + SETTLE_MS;
    let shown = null; // { x, width, visible } the bar is showing
    let shownItem = null;
    let wasHidden = false;
    let frame = 0;
    let alive = true;

    const measure = () => {
      const row = container.getBoundingClientRect();
      if (!row.width) return null;
      const item = container.querySelector(activeSelector);
      const rect = item?.getBoundingClientRect();
      if (!rect?.width) {
        return { item: null, x: shown?.x ?? 0, width: shown?.width ?? 0, visible: false };
      }
      const style = getComputedStyle(item);
      const padLeft = parseFloat(style.paddingLeft) || 0;
      const padRight = parseFloat(style.paddingRight) || 0;
      return {
        item,
        x: rect.left - row.left - container.clientLeft + padLeft,
        width: Math.max(0, rect.width - padLeft - padRight),
        visible: true,
      };
    };

    // "slide" lets the stylesheet transition everything; "fade" jumps to the
    // spot and only fades; "jump" has no transition at all.
    const apply = ({ x, width, visible }, mode) => {
      if (mode !== "slide") bar.style.transitionProperty = mode === "fade" ? "opacity" : "none";
      bar.style.transform = `translateX(${x}px)`;
      bar.style.width = `${width}px`;
      bar.style.opacity = visible ? "1" : "0";
      if (mode !== "slide") {
        // Commit these values before the transitions come back, so they are
        // where the next move starts rather than part of it.
        void bar.offsetWidth;
        bar.style.transitionProperty = "";
      }
      shown = { x, width, visible };
      if (rememberAs) remembered.set(rememberAs, shown);
    };

    const update = () => {
      frame = 0;
      const next = measure();
      if (!next) {
        wasHidden = true;
        return;
      }
      const same =
        shown && next.x === shown.x && next.width === shown.width && next.visible === shown.visible;
      if (!same) {
        let mode;
        if (!shown || wasHidden || performance.now() < settleUntil) mode = "jump";
        else if (!next.visible) mode = "slide"; // only the opacity changes: a fade-out in place
        else if (!shown.visible) mode = "fade"; // appears under its item, no slide
        else if (next.item !== shownItem) mode = "slide";
        else mode = "jump"; // the same item moved or resized
        apply(next, mode);
      }
      shownItem = next.item;
      wasHidden = false;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    if (start) {
      // Where the previous page's bar was; the next frame slides it over.
      apply(start, "jump");
      schedule();
    } else {
      update();
    }

    const resize = new ResizeObserver(schedule);
    const watchItems = () => {
      resize.disconnect();
      resize.observe(container);
      for (const child of container.children) if (child !== bar) resize.observe(child);
    };
    watchItems();

    const attributeFilter = [...activeSelector.matchAll(/\[([\w-]+)/g)].map((m) => m[1]);
    const mutations = new MutationObserver((records) => {
      if (records.some((r) => r.type === "childList" && r.target === container)) watchItems();
      schedule();
    });
    mutations.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter });

    document.fonts?.ready.then(() => {
      if (alive) schedule();
    });
    window.addEventListener("resize", schedule);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [activeSelector, rememberAs]);

  return { containerRef, barRef };
}
