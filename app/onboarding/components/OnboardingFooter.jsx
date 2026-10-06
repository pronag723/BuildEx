"use client";

import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

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
 *   - helper:        optional small text under the buttons (e.g. what's missing)
 *   - skipLabel:     if provided, shows a subtle ghost link in the middle
 *   - onSkip:        handler for the skip link
 */
export default function OnboardingFooter({
  onBack,
  onNext,
  nextLabel,
  backLabel,
  nextDisabled = false,
  isSaving = false,
  helper,
  skipLabel,
  onSkip,
}) {
  const t = useT();

  return (
    <>
      <div className="onb-footer">
        <div>
          {onBack && (
            <button type="button" onClick={onBack} className="btn btn-ghost btn-lg -ml-3">
              <Icon name="arrowLeft" size={16} />
              {backLabel ?? t("onboarding.back")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {skipLabel && (
            <button type="button" onClick={onSkip} className="btn btn-ghost btn-lg">
              {skipLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isSaving}
            aria-disabled={nextDisabled || isSaving}
            className="btn btn-primary btn-lg"
          >
            {isSaving && (
              <span
                className="h-4 w-4 rounded-full border-2 border-accent-fg/30 border-t-accent-fg animate-spin"
                aria-hidden="true"
              />
            )}
            {nextLabel ?? t("onboarding.continue")}
          </button>
        </div>
      </div>
      {helper && <p className="mt-3 text-right text-xs text-ink-3">{helper}</p>}
    </>
  );
}
