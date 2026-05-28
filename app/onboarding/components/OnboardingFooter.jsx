"use client";

/**
 * Bottom navigation strip for every onboarding step.
 *
 * Props:
 *   - onBack:        called when the back button is pressed (optional)
 *   - onNext:        called when the primary button is pressed
 *   - nextLabel:     defaults to "Continue"
 *   - backLabel:     defaults to "Back"
 *   - nextDisabled:  disables the primary button
 *   - isSaving:      shows spinner inside the primary button
 *   - helper:        optional small text under the buttons (e.g. "Press Enter…")
 *   - skipLabel:     if provided, shows a subtle ghost link in the middle
 *   - onSkip:        handler for the skip link
 */
export default function OnboardingFooter({
  onBack,
  onNext,
  nextLabel = "Continue",
  backLabel = "Back",
  nextDisabled = false,
  isSaving = false,
  helper,
  skipLabel,
  onSkip,
}) {
  return (
    <>
      <div className="onb-footer">
        <div className="flex items-center gap-2">
          {onBack && (
            <button type="button" onClick={onBack} className="onb-btn-ghost">
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13L5 8l5-5" />
              </svg>
              {backLabel}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {skipLabel && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              {skipLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isSaving}
            aria-disabled={nextDisabled || isSaving}
            className="onb-btn-primary"
          >
            {isSaving && (
              <span
                className="w-3.5 h-3.5 rounded-full border-2 border-black/40 border-t-black animate-spin"
                aria-hidden="true"
              />
            )}
            {nextLabel}
            {!isSaving && (
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3l5 5-5 5" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {helper && <p className="text-xs text-gray-500 mt-3 text-right">{helper}</p>}
    </>
  );
}
