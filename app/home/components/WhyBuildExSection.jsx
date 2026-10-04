"use client";

import { withBase } from "../utils";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// The testimonials that used to live here were invented, and a page being
// rewritten to stop making claims we cannot back is no place for invented
// endorsements. What replaced them is the plainest thing we can put on the
// page: the two lists below, which say exactly what this site does and does
// not do. They match app/legal/documents.js word for word in substance. The
// lists themselves are `about.why.does` / `about.why.doesNot` in the
// dictionaries (lib/i18n/messages/<lang>/about.mjs).

function ClaimList({ tone, title, items }) {
  const isPositive = tone === "positive";
  return (
    <div className="p-5 sm:p-8">
      <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
        <Icon
          name={isPositive ? "check" : "close"}
          size={18}
          strokeWidth={2.2}
          className={`flex-shrink-0 ${
            isPositive ? "text-[#4ade80]" : "text-gray-500"
          }`}
        />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <ul className="space-y-2 sm:space-y-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2.5 text-sm text-gray-400 leading-relaxed"
          >
            <span
              className={`mt-[7px] h-1 w-1 flex-shrink-0 rounded-full ${
                isPositive ? "bg-[#4ade80]" : "bg-gray-600"
              }`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WhyBuildExSection({ onAnchorClick }) {
  const t = useT();
  return (
    <section id="why-buildex" className="py-16 sm:py-24 reveal">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-4xl font-semibold text-center mb-7 sm:mb-10">
          {t.rich("about.why.heading", {
            brand: <>Build<span className="text-[#4ade80]">Ex</span></>,
          })}
        </h2>

        {/* One panel split by a shared divider, rather than two separate cards.
            The old version was two `glass rounded-3xl p-8` boxes in a grid that
            CSS had forced to three columns, leaving a phantom empty column on
            every desktop screen. */}
        <div className="glass rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07]">
          <ClaimList tone="positive" title={t("about.why.doesTitle")} items={t("about.why.does")} />
          <ClaimList
            tone="negative"
            title={t("about.why.doesNotTitle")}
            items={t("about.why.doesNot")}
          />
        </div>

        <div className="mt-7 sm:mt-10 text-center">
          <a
            href={withBase("/")}
            onClick={(event) => onAnchorClick?.(event, "/")}
            className="inline-block px-7 py-3 sm:px-8 sm:py-4 bg-[#4ade80] text-black font-semibold rounded-full hover:scale-105 transition-all green-glow"
          >
            {t("about.browseBuilders")}
          </a>
        </div>
      </div>
    </section>
  );
}
