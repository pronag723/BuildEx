"use client";

// The Legal Center body. It lives in a client component so it can follow the
// interface language; app/legal/page.jsx stays a server component for its
// metadata. Document titles and summaries come from documents.js (English) or
// documents.ru.js (Russian translation) — see legalDocumentsFor().

import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Copyright,
  FileText,
  Landmark,
  LockKeyhole,
  Scale
} from "lucide-react";
import LegalReturnLink from "./LegalReturnLink";
import { legalSlugs } from "./documents";
import { legalDocumentsFor, legalEffectiveFor } from "./documents.ru";
import { useT } from "../../lib/i18n/LanguageProvider";

const documentIcons = {
  terms: Scale,
  privacy: LockKeyhole,
  community: Copyright,
  "legal-notice": Landmark
};

export default function LegalIndexView() {
  const t = useT();
  const documents = legalDocumentsFor(t.lang);
  const effective = legalEffectiveFor(t.lang);

  return (
    <main className="relative z-10 px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<span className="text-sm font-semibold text-gray-400">{t("legal.back")}</span>}>
          <LegalReturnLink />
        </Suspense>

        <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[#111512]/90 px-6 py-10 shadow-2xl shadow-black/30 sm:px-10 sm:py-14 lg:px-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#4ade80]/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#86efac]">
              <BadgeCheck size={14} aria-hidden="true" />
              {t("legal.officialPolicies")}
            </div>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{t("legal.centerTitle")}</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
              {t("legal.centerBody")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm text-gray-400">
              <span className="inline-flex items-center gap-2 text-gray-200"><FileText size={16} className="text-[#4ade80]" aria-hidden="true" />{t("legal.documentCount", { count: legalSlugs.length })}</span>
              <span>{t("legal.effective", { date: effective })}</span>
              <span>{t("legal.languageLabel")}</span>
            </div>
            {t.lang !== "en" && (
              <p className="mt-4 text-xs leading-5 text-gray-500">{t("legal.translationNote")}</p>
            )}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="legal-documents-heading">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#4ade80]">{t("legal.policiesEyebrow")}</p>
              <h2 id="legal-documents-heading" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{t("legal.findDocument")}</h2>
            </div>
            <p className="hidden text-sm text-gray-500 sm:block">{t("legal.currentAsOf", { date: effective })}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {legalSlugs.map((slug, index) => {
              const doc = documents[slug];
              const DocumentIcon = documentIcons[slug] || FileText;
              return (
                <Link key={slug} href={`/legal/${slug}/`} className="group flex min-h-64 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#4ade80]/40 hover:bg-[#4ade80]/[0.055] hover:shadow-xl hover:shadow-[#4ade80]/[0.04]">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80]"><DocumentIcon size={21} strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className="text-xs font-medium tabular-nums text-gray-600">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-bold leading-snug text-white transition-colors group-hover:text-[#86efac]">{doc.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-gray-400">{doc.summary}</p>
                  <div className="mt-6 flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs text-gray-500">
                    <span>{t("legal.version", { version: doc.version })}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-gray-300 transition-colors group-hover:text-[#4ade80]">{t("legal.read")} <ArrowUpRight size={14} aria-hidden="true" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-12 flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-lg font-bold text-white">{t("legal.helpTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">{t("legal.helpBody")}</p>
          </div>
          <a href="mailto:mcbuildex@gmail.com" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#4ade80] px-5 py-3 text-sm font-bold text-[#07120a] transition hover:bg-[#86efac]">mcbuildex@gmail.com</a>
        </section>
      </div>
    </main>
  );
}
