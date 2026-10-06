"use client";

import { useState } from "react";
import Link from "next/link";
import CatalogNavbar from "../../../components/CatalogNavbar";
import CatalogMobileMenu from "../../../components/CatalogMobileMenu";
import { useT } from "../../../../../lib/i18n/LanguageProvider";

export default function BuilderNotFound({ provider = "builder" }) {
  const isStudio = provider === "studio";
  const t = useT();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <main className="flex items-center justify-center px-4 py-20">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">
            {isStudio ? t("profile.notFound.studioTitle") : t("profile.notFound.title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            {isStudio ? t("profile.notFound.studioBody") : t("profile.notFound.body")}
          </p>
          <Link href="/" className="btn btn-secondary mt-6">
            {isStudio ? t("profile.notFound.studioCta") : t("profile.notFound.cta")}
          </Link>
        </div>
      </main>
    </div>
  );
}
