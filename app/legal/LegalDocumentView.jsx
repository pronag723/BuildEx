"use client";

// One legal document, in the interface language. The Russian text is a
// convenience translation (documents.ru.js) and says so at the top; the
// English document remains the version that applies. Section anchors are
// always built from the English headings so a shared #link works in both.

import Link from "next/link";
import { legalDocuments } from "./documents";
import { legalDocumentsFor, legalEffectiveFor } from "./documents.ru";
import { Icon } from "../../lib/icons";
import { useT } from "../../lib/i18n/LanguageProvider";

function sectionId(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function LegalDocumentView({ slug }) {
  const t = useT();
  const source = legalDocuments[slug];
  const doc = legalDocumentsFor(t.lang)[slug] || source;
  const effective = legalEffectiveFor(t.lang);
  const anchor = (index) => sectionId(source.sections[index][0]);

  return (
    <main className="px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <nav aria-label={t("profile.breadcrumb")} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
          <Link href="/legal/" className="transition-colors hover:text-ink">{t("footer.legalCenter")}</Link>
          <Icon name="chevronRight" size={14} className="opacity-60" />
          <span className="truncate text-ink-2">{doc.title}</span>
        </nav>

        <header className="mt-6 max-w-3xl border-b border-line/[0.08] pb-8">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em] sm:text-[2.25rem]">{doc.title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2 sm:text-base">{doc.summary}</p>
          <p className="mt-4 text-sm text-ink-3">
            {t("legal.version", { version: doc.version })}
            <span aria-hidden="true"> · </span>
            {t("legal.effective", { date: effective })}
          </p>
          {t.lang !== "en" && (
            <p className="mt-3 max-w-3xl text-xs leading-5 text-ink-3">{t("legal.translationNote")}</p>
          )}
        </header>

        <div className="mt-8 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
          <aside className="hidden lg:block">
            <nav aria-label={t("legal.onThisPage")} className="sticky top-[calc(var(--header-h)+1.5rem)]">
              <p className="mb-3 text-[13px] font-medium text-ink-3">{t("legal.onThisPage")}</p>
              <ol className="space-y-2 border-l border-line/10">
                {doc.sections.map(([heading], index) => (
                  <li key={heading}>
                    <a href={`#${anchor(index)}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-sm leading-5 text-ink-3 transition-colors hover:border-line/40 hover:text-ink">
                      {heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="min-w-0 max-w-3xl">
            <div className="space-y-10">
              {doc.sections.map(([heading, paragraphs], index) => (
                <section key={heading} id={anchor(index)} className="scroll-mt-[calc(var(--header-h)+1.5rem)]">
                  <h2 className="flex items-baseline gap-3 text-lg font-semibold tracking-[-0.01em] sm:text-xl">
                    <span className="font-mark text-sm tabular-nums text-ink-3">{String(index + 1).padStart(2, "0")}</span>
                    {heading}
                  </h2>
                  <div className="mt-3 space-y-4 text-[15px] leading-7 text-ink-2">
                    {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-14 flex flex-col gap-4 border-t border-line/[0.08] pt-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">{t("legal.questionsTitle")}</h2>
                <p className="mt-1 text-sm text-ink-2">{t("legal.questionsBody")}</p>
              </div>
              <a href="mailto:mcbuildex@gmail.com" className="btn btn-secondary flex-shrink-0">
                <Icon name="mail" size={16} />
                mcbuildex@gmail.com
              </a>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
