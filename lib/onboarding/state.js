// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder onboarding step machine
// Signing in no longer has anything behind it: a visitor gets a usable profiles
// row the moment they authenticate. What remains here is the BUILDER opt-in —
// the steps someone walks through after clicking "Create a builder profile" on
// their account page — and the logic that resumes a half-finished one.
// ─────────────────────────────────────────────────────────────────────────────

import { HANDLE_REGEX } from "./constants";

export const STEPS = {
  builderIdentity:    "/onboarding/builder/identity",
  builderExpertise:   "/onboarding/builder/expertise",
  builderStyles:      "/onboarding/builder/styles",
  builderPortfolio:   "/onboarding/builder/portfolio",
  complete:           "/onboarding/complete",
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

  const tools = Array.isArray(builderProfile.tools) ? builderProfile.tools : [];
  if (tools.length === 0) return STEPS.builderExpertise;

  const styles = Array.isArray(builderProfile.specialties) ? builderProfile.specialties : [];
  const buildTypes = Array.isArray(builderProfile.build_types) ? builderProfile.build_types : [];
  if (styles.length === 0 || buildTypes.length === 0) return STEPS.builderStyles;

  if (portfolioCount === 0) return STEPS.builderPortfolio;

  return STEPS.complete;
}

/**
 * True when builder onboarding is finished.
 */
export function isOnboardingComplete(profile) {
  return Boolean(profile?.onboarding_completed_at);
}

/** Ordered step list — used by the visual step indicator. */
export const STEP_ORDER = [
  STEPS.builderIdentity,
  STEPS.builderExpertise,
  STEPS.builderStyles,
  STEPS.builderPortfolio,
  STEPS.complete,
];

/**
 * Progress (0..1) for the top step indicator. Heuristic — does not need to be
 * exact, just monotonically increasing as the user advances.
 */
export function stepProgress(stepPath) {
  const i = STEP_ORDER.indexOf(stepPath);
  if (i < 0) return 0;
  return i / (STEP_ORDER.length - 1);
}

/** The steps shown in the header indicator. */
export function builderSteps() {
  return [
    { path: STEPS.builderIdentity,  label: "Profile" },
    { path: STEPS.builderExpertise, label: "Expertise" },
    { path: STEPS.builderStyles,    label: "Styles" },
    { path: STEPS.builderPortfolio, label: "Portfolio" },
  ];
}
