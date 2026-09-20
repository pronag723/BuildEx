// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder onboarding step machine
// Signing in no longer has anything behind it: a visitor gets a usable profiles
// row the moment they authenticate. What remains here is the BUILDER opt-in —
// three steps someone walks through after clicking "Create a builder profile"
// on their account page — and the logic that resumes a half-finished one.
// ─────────────────────────────────────────────────────────────────────────────

import { HANDLE_REGEX } from "./constants";

export const STEPS = {
  builderIdentity:  "/onboarding/builder/identity",
  builderStyles:    "/onboarding/builder/styles",
  builderPortfolio: "/onboarding/builder/portfolio",
  complete:         "/onboarding/complete",
};

/** The first step of builder onboarding — the only entrance to the flow. */
export const BUILDER_ONBOARDING_START = STEPS.builderIdentity;

function hasValidHandle(p) {
  return Boolean(p?.username) && HANDLE_REGEX.test(String(p.username).toLowerCase());
}

function hasValidDisplayName(p) {
  return Boolean(p?.display_name) && String(p.display_name).trim().length >= 2;
}

/**
 * Returns the builder-onboarding step the user should be on next, or null when
 * they have already finished.
 *
 * "Is this person a builder?" is decided by the existence of a
 * `builder_profiles` row, never by `profiles.role` — role is a legacy column
 * that existing accounts still carry values in.
 *
 * @param {object|null} profile          row from public.profiles
 * @param {object|null} builderProfile   row from public.builder_profiles (or null)
 * @param {number}      portfolioCount   number of portfolio_images rows
 */
export function resolveNextStep(profile, builderProfile, portfolioCount = 0) {
  if (!profile) return STEPS.builderIdentity;

  // Already finished.
  if (profile.onboarding_completed_at) return null;

  if (
    !builderProfile ||
    !hasValidDisplayName(profile) ||
    !hasValidHandle(profile)
  ) {
    return STEPS.builderIdentity;
  }

  // Step 2 asks for styles and nothing else. Build types, tools, response time
  // and availability are no longer collected, so they must NOT gate the flow —
  // a half-finished account that never set them would otherwise be stuck on a
  // screen that no longer asks the question.
  const styles = Array.isArray(builderProfile.specialties) ? builderProfile.specialties : [];
  if (styles.length === 0) return STEPS.builderStyles;

  if (portfolioCount === 0) return STEPS.builderPortfolio;

  return STEPS.complete;
}

/** Ordered step list — used by the visual step indicator. */
export const STEP_ORDER = [
  STEPS.builderIdentity,
  STEPS.builderStyles,
  STEPS.builderPortfolio,
  STEPS.complete,
];

/** The three steps shown in the header indicator. */
export function builderSteps() {
  return [
    { path: STEPS.builderIdentity,  label: "Profile" },
    { path: STEPS.builderStyles,    label: "Styles" },
    { path: STEPS.builderPortfolio, label: "Portfolio" },
  ];
}
