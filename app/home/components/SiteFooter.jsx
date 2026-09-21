"use client";

import { withBase } from "../utils";
import { usePathname } from "next/navigation";
import { DIRECTORY_DISCLAIMER } from "../data";

// This footer is the ONE place the directory disclaimer still appears outside
// the legal documents. It used to be repeated in the hero, again under the
// How It Works steps and again in the profile contact sidebar; those copies
// were crowding the interface, so this is now the single canonical statement.
// Do not remove it without reading app/legal/documents.js first — the landing
// copy has to stay consistent with what the legal pages promise.
export default function SiteFooter() {
  const pathname = usePathname();
  const legalCenterHref = pathname.startsWith("/legal")
    ? withBase("/legal/")
    : `${withBase("/legal/")}?from=${encodeURIComponent(pathname)}`;

  return (
    <footer className="site-footer site-footer-enter border-t border-white/10 bg-black/70 py-8">
      {/* Everything here used to be `shrink-0 whitespace-nowrap` inside an
          `overflow-x-auto` with the scrollbar hidden — roughly 1000px of content
          in a 327px box on a phone, which put the legal links off-screen with no
          scrollbar to reveal them. It wraps now. */}
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 text-sm text-gray-400 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10 lg:px-8">
        <div className="min-w-0 lg:max-w-xl">
          <p className="font-medium text-gray-300">
            © 2026 BuildEx — a directory of Minecraft builders.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            {DIRECTORY_DISCLAIMER}
          </p>
        </div>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:flex-shrink-0 lg:justify-end"
        >
          <a href={legalCenterHref} className="hover:text-white">
            Legal Center
          </a>
          <a href={withBase("/legal/terms/")} className="hover:text-white">
            Terms
          </a>
          <a href={withBase("/legal/privacy/")} className="hover:text-white">
            Privacy
          </a>
          <a href={withBase("/legal/community/")} className="hover:text-white">
            Community &amp; copyright
          </a>
        </nav>
      </div>
    </footer>
  );
}
