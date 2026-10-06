"use client";

import { builderSteps } from "../../../lib/onboarding/state";
import { useT } from "../../../lib/i18n/LanguageProvider";

/**
 * Where you are in builder setup: "Step 1 of 3 · Profile" above one bar per
 * step. Done and current steps are filled; the rest are empty.
 */
export default function StepHeader({ currentStep }) {
  const t = useT();
  const steps = builderSteps();
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => s.path === currentStep)
  );
  const current = steps[currentIdx];

  return (
    <div className="mb-8" aria-label={t("onboarding.progress")}>
      <p className="text-[13px] text-ink-3">
        {t("onboarding.stepOf", { current: currentIdx + 1, total: steps.length })}
        {current && (
          <>
            <span aria-hidden="true"> · </span>
            <span className="font-medium text-ink-2">{t(`onboarding.steps.${current.key}`)}</span>
          </>
        )}
      </p>
      <ol className="mt-2.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li
            key={s.path}
            aria-current={i === currentIdx ? "step" : undefined}
            title={t(`onboarding.steps.${s.key}`)}
            className={`h-1 rounded-full transition-colors duration-300 ${
              i <= currentIdx ? "bg-accent" : "bg-line/[0.12]"
            }`}
          >
            <span className="sr-only">{t(`onboarding.steps.${s.key}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
