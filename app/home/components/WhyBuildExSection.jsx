"use client";

import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// The testimonials that used to live here were invented, and a page being
// rewritten to stop making claims we cannot back is no place for invented
// endorsements. What replaced them is the plainest thing we can put on the
// page: the two lists below, which say exactly what this site does and does
// not do. They match app/legal/documents.js word for word in substance. The
// lists themselves are `about.why.does` / `about.why.doesNot` in the
// dictionaries (lib/i18n/messages/<lang>/about.mjs).

function ClaimList({ positive, title, items }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2">
            <Icon
              name={positive ? "check" : "close"}
              size={16}
              strokeWidth={2}
              className={`mt-0.5 flex-shrink-0 ${positive ? "text-accent-ink" : "text-danger"}`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WhyBuildExSection() {
  const t = useT();
  return (
    <section
      id="why-buildex"
      className="mx-auto max-w-7xl scroll-mt-[calc(var(--header-h)+1rem)] px-4 sm:px-6 lg:px-8"
    >
      <div className="border-t border-line/[0.08] py-14 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">{t("about.why.heading")}</h2>
          <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
            <ClaimList positive title={t("about.why.doesTitle")} items={t("about.why.does")} />
            <ClaimList title={t("about.why.doesNotTitle")} items={t("about.why.doesNot")} />
          </div>
        </div>
      </div>
    </section>
  );
}
