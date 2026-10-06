"use client";

// The legal pages' header: the site header with the language and theme
// switches and a link back to the Legal Center. A client component so the
// layout can stay a server one.

import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import ThemeToggle from "../components/ThemeToggle";
import LanguageSwitcher from "../../lib/i18n/LanguageSwitcher";
import { useT } from "../../lib/i18n/LanguageProvider";

export default function LegalHeader() {
  const t = useT();
  return (
    <SiteHeader
      actions={
        <>
          <LanguageSwitcher />
          <ThemeToggle />
          <Link href="/legal/" className="btn btn-ghost btn-sm">
            {t("footer.legalCenter")}
          </Link>
        </>
      }
    />
  );
}
