"use client";

import { steps } from "../data";
import { useT } from "../../../lib/i18n/LanguageProvider";

export default function HowItWorksSection() {
  const t = useT();
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-7xl scroll-mt-[calc(var(--header-h)+1rem)] px-4 sm:px-6 lg:px-8"
    >
      <div className="border-t border-line/[0.08] py-14 sm:py-20">
        <h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">{t("about.how.heading")}</h2>

        <ol className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-10">
          {steps.map((step, i) => (
            <li key={step.key} className="border-t border-line/15 pt-5">
              <span className="font-mark text-sm font-semibold tabular-nums text-accent-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-base font-semibold">{t(`about.how.steps.${step.key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(`about.how.steps.${step.key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
