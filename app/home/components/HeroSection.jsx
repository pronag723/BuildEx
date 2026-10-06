"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchBuilders } from "../../builders/data/fetchBuilders";
import { useT } from "../../../lib/i18n/LanguageProvider";

export default function HeroSection() {
  // Real directory figures for the line under the buttons. We reuse
  // fetchBuilders (which already applies the visibility rules and sets
  // `online` from last_seen_at) instead of writing a bespoke count query, and
  // render nothing until it resolves so no number is ever invented.
  const t = useT();
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchBuilders().then(({ builders }) => {
      if (!alive) return;
      const list = builders || [];
      if (list.length > 0) {
        setCounts({ listed: list.length, online: list.filter((b) => b.online).length });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="max-w-[16ch] text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[2.75rem] lg:text-[3.25rem]">
          {t("about.hero.title")}
        </h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-2">
          {t("about.hero.body")}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link href="/" className="btn btn-primary btn-lg">
            {t("about.browseBuilders")}
          </Link>
          <a href="#how-it-works" className="btn btn-ghost btn-lg">
            {t("about.hero.howItWorks")}
          </a>
        </div>
        {counts && (
          <p className="mt-6 text-sm text-ink-3">
            {t("about.hero.listed", { count: counts.listed })}
            {counts.online > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {t("about.hero.online", { count: counts.online })}
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
