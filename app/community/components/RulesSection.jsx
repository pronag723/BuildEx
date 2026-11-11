"use client";

// # rules: the Community and Copyright Policy, read inside the Community.
// Every channel's header links here with `&r=<anchor>` (its own section), so
// one tap lands on "Rule 4 · Showcase", scrolled into view and highlighted.
// The anchors are the legal page's (built from the English headings), so
// /legal/community#showcase and ?s=rules&r=showcase name the same section.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { legalDocuments } from "../../legal/documents";
import { legalDocumentsFor } from "../../legal/documents.ru";
import { sectionId } from "../../legal/sectionId";
import ChannelHeader from "./ChannelHeader";

const HIGHLIGHT_MS = 2400;

export default function RulesSection({ rule = null, onBack }) {
  const t = useT();
  const source = legalDocuments.community;
  const doc = legalDocumentsFor(t.lang).community || source;
  const anchors = source.sections.map(([heading]) => sectionId(heading));
  const [lit, setLit] = useState(null);

  // Scroll to the linked rule once it is on the page, and light it up briefly.
  useEffect(() => {
    if (!rule || !anchors.includes(rule)) return undefined;
    const el = document.getElementById(`rule-${rule}`);
    if (!el) return undefined;
    const frame = window.requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    setLit(rule);
    const timer = window.setTimeout(() => setLit(null), HIGHLIGHT_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    // anchors is derived from a static document
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule]);

  return (
    <>
      <ChannelHeader channel="rules" onBack={onBack} />
      <div className="px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
        <div className="max-w-3xl">
          <p className="text-[15px] leading-relaxed text-ink-2">{doc.summary}</p>
          <p className="mt-2 text-xs text-ink-3">
            {t("legal.version", { version: doc.version })}
            <span aria-hidden="true"> · </span>
            <Link href="/legal/community" className="underline underline-offset-2 hover:text-ink">
              {t("community.rules.fullPage")}
            </Link>
          </p>

          <ol className="mt-6 space-y-3">
            {doc.sections.map(([heading, paragraphs], index) => {
              const anchor = anchors[index];
              const on = lit === anchor;
              return (
                <li
                  key={anchor}
                  id={`rule-${anchor}`}
                  className={`scroll-mt-[calc(var(--header-h)+4.5rem)] rounded-xl border p-4 transition-colors duration-700 sm:p-5 ${
                    on ? "border-accent/60 bg-accent/[0.08]" : "border-line/[0.08]"
                  }`}
                >
                  <p className="text-xs font-medium text-ink-3">{t("community.rules.number", { n: index + 1 })}</p>
                  <h2 className="mt-1 flex items-center gap-2 text-base font-semibold tracking-[-0.01em] sm:text-lg">
                    {heading}
                  </h2>
                  <div className="mt-2 space-y-3 text-[14.5px] leading-7 text-ink-2">
                    {paragraphs.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>

          {t.lang !== "en" && <p className="mt-6 text-xs leading-5 text-ink-3">{t("legal.translationNote")}</p>}
        </div>
      </div>
    </>
  );
}
