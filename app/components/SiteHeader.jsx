"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "../../lib/i18n/LanguageProvider";
import { useSlidingIndicator } from "../../lib/ui/useSlidingIndicator";

// The one header every page uses: a full-width bar that sticks to the top of
// the viewport, with the wordmark, an optional row of navigation links and a
// slot for controls on the right. It replaced five near-identical floating
// "pill" headers (feed, about, sign-in, onboarding, legal) that each kept their
// own copy of the logo, theme switch and spacing.
//
// It sits in the page flow, so pages no longer pad their content down by a
// guessed header height.
export function Wordmark({ className = "" }) {
  return (
    <span className={`wordmark ${className}`}>
      build<span className="text-accent">ex</span>
    </span>
  );
}

// The row of links. The current page (aria-current="page") is underlined by
// one accent bar that slides from link to link, and from page to page: each
// page mounts its own header, so the bar's last spot is remembered across
// them (see lib/ui/useSlidingIndicator.js).
function HeaderNav({ children }) {
  const t = useT();
  const { containerRef, barRef } = useSlidingIndicator('[aria-current="page"]', {
    rememberAs: "site-header",
  });

  return (
    <nav
      ref={containerRef}
      aria-label={t("common.mainNav")}
      className="relative hidden lg:flex items-center gap-1"
    >
      {children}
      <span ref={barRef} className="slide-indicator nav-indicator" aria-hidden="true" />
    </nav>
  );
}

// `overScene` names a full-bleed picture at the top of the page (the /about
// hero) that the header may lie over. While it does, the header is see-through:
// clear at the very top of the page, frosted once the page scrolls under it,
// and the ordinary bar again once the picture has gone by. Returns "top",
// "scrolled" or null (not over it). The first render says "top", so the
// static HTML of a page opened at the top is already right.
function useOverScene(sceneId, headerRef) {
  const [state, setState] = useState(sceneId ? "top" : null);

  useEffect(() => {
    const scene = sceneId && document.getElementById(sceneId);
    if (!scene) {
      setState(null);
      return undefined;
    }
    const update = () => {
      const over = scene.getBoundingClientRect().bottom > headerRef.current.offsetHeight;
      setState(!over ? null : window.scrollY > 0 ? "scrolled" : "top");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sceneId, headerRef]);

  return state;
}

export default function SiteHeader({ nav = null, actions = null, overScene = null }) {
  const t = useT();
  const headerRef = useRef(null);
  const sceneState = useOverScene(overScene, headerRef);

  return (
    <header
      ref={headerRef}
      className={sceneState ? "site-header on-scene" : "site-header"}
      data-over-scene={sceneState ?? undefined}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label={t("common.logoHome")}
          className="flex-shrink-0 rounded-md"
        >
          <Wordmark />
        </Link>

        {nav && <HeaderNav>{nav}</HeaderNav>}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">{actions}</div>
      </div>
    </header>
  );
}
