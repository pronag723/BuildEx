"use client";

import { builderSteps } from "../../../lib/onboarding/state";

// Matches `.step-dot { width: 28px }` in globals.css — the label row measures
// against the dots, so the two have to agree.
const DOT_PX = 28;

/**
 * Visual step indicator across the top of every onboarding step.
 * Renders a row of dots (current / completed / upcoming) connected by a
 * progress bar that fills as the user advances.
 */
export default function StepHeader({ currentStep }) {
  const steps = builderSteps();
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => s.path === currentStep)
  );
  const progress = steps.length > 1 ? currentIdx / (steps.length - 1) : 0;

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className="inline-flex items-center gap-2 glass px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-widest text-gray-300">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
          Step {currentIdx + 1} of {steps.length}
        </span>
        <span className="text-gray-500 hidden sm:inline">Builder setup</span>
      </div>

      <div className="step-track" aria-label="Onboarding progress">
        {steps.map((s, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={s.path} className="flex items-center flex-1 last:flex-none">
              <div
                className={`step-dot ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`}
                aria-current={isActive ? "step" : undefined}
                title={s.label}
              >
                {isDone ? (
                  <svg
                    viewBox="0 0 12 10"
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M1 5l3.5 3.5L11 1" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>

              {i < steps.length - 1 && (
                <div
                  className="step-bar mx-2 sm:mx-3"
                  style={{
                    "--bar-progress":
                      i < currentIdx
                        ? 1
                        : i === currentIdx
                        ? Math.max(0, progress * steps.length - i)
                        : 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Labels are positioned against the dots, not laid out as their own
          flex row. The track's items are [dot + bar] pairs, so a dot sits at
          the LEFT edge of its box — a label centered inside that same box
          lands between two dots instead of under one. Each dot is
          DOT_PX wide and the row is `n - 1` equal gaps, so dot i's centre is
          `i/(n-1)` of the way across the space the dots span, plus half a dot.
          The first and last labels hug the edges so they can't overflow. */}
      <div className="hidden sm:block relative mt-3 h-4">
        {steps.map((s, i) => {
          const isFirst = i === 0;
          const isLast = i === steps.length - 1;
          const position = isFirst
            ? { left: 0, textAlign: "left" }
            : isLast
            ? { right: 0, textAlign: "right" }
            : {
                left: `calc(${i / (steps.length - 1)} * (100% - ${DOT_PX}px) + ${DOT_PX / 2}px)`,
                transform: "translateX(-50%)",
                textAlign: "center",
              };
          return (
            <span
              key={s.path}
              className={`absolute top-0 whitespace-nowrap text-[11px] font-medium tracking-wide transition-colors ${
                i === currentIdx
                  ? "text-[#4ade80]"
                  : i < currentIdx
                  ? "text-gray-300"
                  : "text-gray-500"
              }`}
              style={position}
            >
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
