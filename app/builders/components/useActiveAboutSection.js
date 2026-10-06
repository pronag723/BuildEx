"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isAboutPath } from "./navItems";

// Which /about section the header should mark as current: "projects",
// "how-it-works", or null (the hero and "why BuildEx", which belong to the
// plain "About" item). See isNavActive() in ./navItems.js.
//
// The URL can't tell us this: usePathname() carries no hash, and a same-page
// <Link href="/about#projects"> moves the page with history.pushState, which
// fires no `hashchange`. So it is a scroll-spy: an IntersectionObserver whose
// root is shrunk to a one-pixel line part-way down the visible page, under the
// sticky header. Whichever watched section crosses that line is current.
//
// One exception: at the very end of the page the line may still sit in "How
// it works" (the closing section is short), but what the reader has reached
// is the end, which belongs to "About".

export const ABOUT_SECTIONS = ["projects", "how-it-works"];

// Where the detection line sits, as a fraction of the viewport below the header.
const LINE = 0.38;

// After a click (or a visit to /about#…) the page smooth-scrolls through the
// sections in between, so the clicked section is pinned until the scroll ends
// and the underline doesn't flicker through them on the way. The end is the
// `scrollend` event where there is one, else this long without a scroll event.
const SETTLE_MS = 160;
// …and if no scroll starts at all (already there), the pin lifts after this
// many rendered frames. Frames, not milliseconds: a busy page that has not yet
// drawn the frame its scroll starts on must not lose the pin early.
const START_FRAMES = 30;

function headerHeight() {
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue("--header-h").trim();
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return value.endsWith("rem") ? n * parseFloat(getComputedStyle(root).fontSize) : n;
}

const sectionFromHash = (hash) => {
  const id = (hash || "").replace(/^#/, "");
  return ABOUT_SECTIONS.includes(id) ? id : null;
};

const samePage = (a, b) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

const atPageEnd = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

export function useActiveAboutSection() {
  const pathname = usePathname();
  const onAbout = isAboutPath(pathname);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!onAbout) return undefined;

    const crossing = new Set();
    let line = 0;
    let atEnd = atPageEnd();
    const current = () => (atEnd ? null : ABOUT_SECTIONS.find((id) => crossing.has(id)) ?? null);
    const box = (id) => document.getElementById(id)?.getBoundingClientRect();

    let pinned = false;
    let pinnedTo = null;
    let settle = 0;
    let startFrame = 0;
    const release = () => {
      pinned = false;
      // A clicked section stays marked while it is on screen, even when the
      // page ran out before it reached the top (a tall window, a short page).
      const target = pinnedTo && box(pinnedTo);
      if (target && target.bottom > headerHeight() && target.top < window.innerHeight) return;
      // The scroll has only just stopped, and the observer reports it a task
      // later, so read where the line is now rather than its last report.
      atEnd = atPageEnd();
      const under = ABOUT_SECTIONS.find((id) => {
        const r = box(id);
        return r && r.top <= line && r.bottom > line;
      });
      setActive(atEnd ? null : under ?? null);
    };
    const pin = (section) => {
      pinned = true;
      pinnedTo = section;
      setActive(section);
      clearTimeout(settle);
      cancelAnimationFrame(startFrame);
      // Lift the pin if no scroll ever came. Once the page has moved, a
      // scroll is under way and its scroll/scrollend events lift it instead.
      const startY = window.scrollY;
      let frames = 0;
      const tick = () => {
        if (!pinned || window.scrollY !== startY) return;
        if (++frames >= START_FRAMES) release();
        else startFrame = requestAnimationFrame(tick);
      };
      startFrame = requestAnimationFrame(tick);
    };

    const hasScrollEnd = "onscrollend" in window;
    const onScroll = () => {
      atEnd = atPageEnd();
      if (pinned) {
        clearTimeout(settle);
        if (!hasScrollEnd) settle = setTimeout(release, SETTLE_MS);
      } else {
        setActive(current());
      }
    };
    const onScrollEnd = () => {
      if (!pinned) return;
      clearTimeout(settle);
      release();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", onScrollEnd);

    let observer = null;
    const observe = () => {
      observer?.disconnect();
      const vh = window.innerHeight;
      const header = headerHeight();
      line = Math.round(header + (vh - header) * LINE);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) crossing.add(entry.target.id);
            else crossing.delete(entry.target.id);
          }
          if (!pinned) setActive(current());
        },
        { rootMargin: `-${line}px 0px -${Math.max(0, vh - line - 1)}px 0px` }
      );
      for (const id of ABOUT_SECTIONS) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }
    };

    // A direct visit to /about#projects is right before the first callback.
    const fromHash = sectionFromHash(window.location.hash);
    if (fromHash) pin(fromHash);
    observe();

    // Any same-page link — the header, the mobile menu, the hero's buttons —
    // names where the page is about to scroll to. Next's <Link> has already
    // called preventDefault() by the time the click reaches the document.
    const onClick = (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !samePage(url.pathname, window.location.pathname)) return;
      pin(sectionFromHash(url.hash));
    };
    document.addEventListener("click", onClick);

    let resizeFrame = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        atEnd = atPageEnd();
        observe();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      observer?.disconnect();
      clearTimeout(settle);
      cancelAnimationFrame(startFrame);
      cancelAnimationFrame(resizeFrame);
      document.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", onResize);
    };
  }, [onAbout]);

  return onAbout ? active : null;
}
