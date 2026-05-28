"use client";

import { stepsForRole } from "../../../lib/onboarding/state";

/**
 * Visual step indicator across the top of every onboarding step.
 * Renders a row of dots (current / completed / upcoming) connected by a
 * progress bar that fills as the user advances.
 */
export default function StepHeader({ currentStep, role }) {
  const steps = stepsForRole(role);
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
        <span className="text-gray-500 hidden sm:inline">
          {role
            ? role === "builder"
              ? "Builder setup"
              : role === "both"
              ? "Builder + client setup"
              : "Client setup"
            : "Welcome to BuildEx"}
        </span>
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

      <div className="hidden sm:flex justify-between mt-3 px-1">
        {steps.map((s, i) => (
          <span
            key={s.path}
            className={`text-[11px] font-medium tracking-wide transition-colors ${
              i === currentIdx
                ? "text-[#4ade80]"
                : i < currentIdx
                ? "text-gray-300"
                : "text-gray-500"
            }`}
            style={{
              flex: i < steps.length - 1 ? "1 1 0" : "0 0 auto",
              textAlign: i === 0 ? "left" : i === steps.length - 1 ? "right" : "center",
            }}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
