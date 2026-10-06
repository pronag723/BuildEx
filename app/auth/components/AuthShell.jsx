"use client";

import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import ThemeToggle from "../../components/ThemeToggle";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import LanguageSwitcher from "../../../lib/i18n/LanguageSwitcher";

// Sign-in pages: the site header without the navigation (there is one thing
// to do here) and a narrow centred column.
export default function AuthShell({ children }) {
  const t = useT();

  const actions = (
    <>
      <LanguageSwitcher />
      <ThemeToggle />
      <Link href="/" className="btn btn-ghost btn-sm hidden sm:inline-flex">
        <Icon name="arrowLeft" size={15} />
        {t("nav.backToSite")}
      </Link>
    </>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader actions={actions} />
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
