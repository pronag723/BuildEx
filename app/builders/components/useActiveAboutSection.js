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
// sections in between, so the clicked section is pinned until the page has
// stopped moving, and the underline doesn't flicker through them on the way.
// Both waits are counted in rendered frames, not milliseconds — a busy page
// that hasn't drawn the frames its scroll runs on must not lose the pin early —
// and `scrollend` is no use: it also fires when one smooth scroll is cut short
// by the next (ours, then Next's), halfway there.
const SETTLE_FRAMES = 10; // still this long after moving: it has arrived
const START_FRAMES = 30; // never moved in this long: no scroll is coming

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
    let frame = 0;
    const release = () => {
      pinned = false;
      // The page has only just stopped, and the observer reports it a task
      // later, so read where the line is now rather than its last report.
      atEnd = atPageEnd();
      // A clicked section stays marked when the page ran out before it could
      // bring it up to the line (a tall window): it is on screen, at the end.
      const target = pinnedTo && box(pinnedTo);
      if (atEnd && target && target.bottom > headerHeight() && target.top < window.innerHeight) return;
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
      cancelAnimationFrame(frame);
      let lastY = window.scrollY;
      let moved = false;
      let still = 0;
      const tick = () => {
        if (window.scrollY !== lastY) {
          lastY = window.scrollY;
          moved = true;
          still = 0;
        } else {
          still += 1;
        }
        if (still >= (moved ? SETTLE_FRAMES : START_FRAMES)) release();
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      atEnd = atPageEnd();
      if (!pinned) setActive(current());
    };
    window.addEventListener("scroll", onScroll, { passive: true });

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

      // Next's <Link> (the one that has already called preventDefault) does
      // not reliably move the page on a same-page click: it ignores a click on
      // the URL already showing — and the hash stays in the address bar after
      // the reader scrolls away by hand — and "About" from the foot of
      // /about#how-it-works changed the URL without scrolling to the top. So
      // the item was underlined but the page stayed put. Do the scroll here.
      // A plain <a href="#…"> is left to the browser, which always scrolls.
      // Neither call names a behaviour, so the page's scroll-behavior applies
      // (smooth, or instant under reduced motion).
      if (event.defaultPrevented) {
        const id = decodeURIComponent(url.hash.slice(1));
        if (!id) window.scrollTo({ top: 0 });
        else document.getElementById(id)?.scrollIntoView({ block: "start" });
      }
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
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      document.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [onAbout]);

  return onAbout ? active : null;
}
