"use client";

// The Legal Center body. It lives in a client component so it can follow the
// interface language; app/legal/page.jsx stays a server component for its
// metadata. Document titles and summaries come from documents.js (English) or
// documents.ru.js (Russian translation) — see legalDocumentsFor().

import Link from "next/link";
import { Suspense } from "react";
import LegalReturnLink from "./LegalReturnLink";
import { legalSlugs } from "./documents";
import { legalDocumentsFor, legalEffectiveFor } from "./documents.ru";
import { Icon } from "../../lib/icons";
import { useT } from "../../lib/i18n/LanguageProvider";

export default function LegalIndexView() {
  const t = useT();
  const documents = legalDocumentsFor(t.lang);
  const effective = legalEffectiveFor(t.lang);

  return (
    <main className="px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={<span className="text-sm text-ink-3">{t("legal.back")}</span>}>
          <LegalReturnLink />
        </Suspense>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em] sm:text-[2.25rem]">{t("legal.centerTitle")}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2 sm:text-base">
            {t("legal.centerBody")}
          </p>
          <p className="mt-4 text-sm text-ink-3">
            {t("legal.effective", { date: effective })}
            <span aria-hidden="true"> · </span>
            {t("legal.languageLabel")}
          </p>
          {t.lang !== "en" && (
            <p className="mt-3 text-xs leading-5 text-ink-3">{t("legal.translationNote")}</p>
          )}
        </header>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2" aria-label={t("legal.documentCount", { count: legalSlugs.length })}>
          {legalSlugs.map((slug) => {
            const doc = documents[slug];
            return (
              <li key={slug}>
                <Link
                  href={`/legal/${slug}/`}
                  className="card group flex h-full flex-col p-5 transition-colors hover:border-line/25 sm:p-6"
                >
                  <h2 className="flex items-start justify-between gap-3 text-base font-semibold leading-snug">
                    {doc.title}
                    <Icon
                      name="arrowRight"
                      size={16}
                      className="mt-0.5 flex-shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
                    />
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-6 text-ink-2">{doc.summary}</p>
                  <p className="mt-4 text-xs text-ink-3">{t("legal.version", { version: doc.version })}</p>
                </Link>
              </li>
            );
          })}
        </ul>

        <section className="mt-10 flex flex-col gap-4 border-t border-line/[0.08] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">{t("legal.helpTitle")}</h2>
            <p className="mt-1 text-sm text-ink-2">{t("legal.helpBody")}</p>
          </div>
          <a href="mailto:mcbuildex@gmail.com" className="btn btn-secondary flex-shrink-0">
            <Icon name="mail" size={16} />
            mcbuildex@gmail.com
          </a>
        </section>
      </div>
    </main>
  );
}
