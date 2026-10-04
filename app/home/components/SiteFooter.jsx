"use client";

import { withBase } from "../utils";
import { usePathname } from "next/navigation";
import { useT } from "../../../lib/i18n/LanguageProvider";

// This footer is the ONE place the directory disclaimer still appears outside
// the legal documents. It used to be repeated in the hero, again under the
// How It Works steps and again in the profile contact sidebar; those copies
// were crowding the interface, so this is now the single canonical statement.
// The sentence itself is `footer.disclaimer` in lib/i18n/messages/<lang>/
// footer.mjs. Do not remove it without reading app/legal/documents.js first —
// the landing copy has to stay consistent with what the legal pages promise.
export default function SiteFooter() {
  const pathname = usePathname();
  const t = useT();
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
            {t("footer.copyright")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            {t("footer.disclaimer")}
          </p>
        </div>
        {/* lg:max-w-sm lets longer (translated) link labels wrap onto a second
            row instead of squeezing the disclaimer column; the English row is
            narrower than the cap. */}
        <nav
          aria-label={t("footer.legalAria")}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:flex-shrink-0 lg:justify-end lg:max-w-sm"
        >
          <a href={legalCenterHref} className="hover:text-white">
            {t("footer.legalCenter")}
          </a>
          <a href={withBase("/legal/terms/")} className="hover:text-white">
            {t("footer.terms")}
          </a>
          <a href={withBase("/legal/privacy/")} className="hover:text-white">
            {t("footer.privacy")}
          </a>
          <a href={withBase("/legal/community/")} className="hover:text-white">
            {t("footer.community")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
