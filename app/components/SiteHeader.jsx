"use client";

import Link from "next/link";
import { useT } from "../../lib/i18n/LanguageProvider";

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

export default function SiteHeader({ nav = null, actions = null }) {
  const t = useT();

  return (
    <header className="site-header">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label={t("common.logoHome")}
          className="flex-shrink-0 rounded-md"
        >
          <Wordmark />
        </Link>

        {nav && (
          <nav aria-label={t("common.mainNav")} className="hidden lg:flex items-center gap-1">
            {nav}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">{actions}</div>
      </div>
    </header>
  );
}
