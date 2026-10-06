"use client";

import { withBase } from "../utils";
import { usePathname } from "next/navigation";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Wordmark } from "../../components/SiteHeader";

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

  const link = "text-ink-2 hover:text-ink transition-colors";

  return (
    <footer className="site-footer border-t border-line/[0.08]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 text-sm sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-12 lg:px-8">
        <div className="min-w-0 lg:max-w-xl">
          <div className="flex items-baseline gap-3">
            <Wordmark className="!text-base" />
            <p className="text-ink-3">{t("footer.copyright")}</p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            {t("footer.disclaimer")}
          </p>
        </div>
        {/* lg:max-w-sm lets longer (translated) link labels wrap onto a second
            row instead of squeezing the disclaimer column. */}
        <nav
          aria-label={t("footer.legalAria")}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:flex-shrink-0 lg:justify-end lg:max-w-sm"
        >
          <a href={legalCenterHref} className={link}>
            {t("footer.legalCenter")}
          </a>
          <a href={withBase("/legal/terms/")} className={link}>
            {t("footer.terms")}
          </a>
          <a href={withBase("/legal/privacy/")} className={link}>
            {t("footer.privacy")}
          </a>
          <a href={withBase("/legal/community/")} className={link}>
            {t("footer.community")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
