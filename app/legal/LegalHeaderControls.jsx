"use client";

// The right-hand side of the legal pages' header: the language switch and the
// "Legal Center" pill. A client component so the layout can stay a server one.

import Link from "next/link";
import LanguageSwitcher from "../../lib/i18n/LanguageSwitcher";
import { useT } from "../../lib/i18n/LanguageProvider";

export default function LegalHeaderControls() {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      {/* The legal header is dark in both themes, so the switch keeps its dark
          styling even when the rest of the site is light. */}
      <LanguageSwitcher className="lang-switch-on-dark" />
      <Link href="/legal/" className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-[#4ade80]/30 hover:text-white">{t("footer.legalCenter")}</Link>
    </div>
  );
}
