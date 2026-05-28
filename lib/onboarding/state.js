// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Onboarding step machine
// Given a profile (+ optional builder_profile + portfolio count), determine
// what step the user is currently on. Used by /onboarding root to fan out.
// ─────────────────────────────────────────────────────────────────────────────

import { HANDLE_REGEX } from "./constants";

export const STEPS = {
  role:               "/onboarding",
  identity:           "/onboarding/identity",
  clientProfile:      "/onboarding/profile",
  builderIdentity:    "/onboarding/builder/identity",
  builderExpertise:   "/onboarding/builder/expertise",
  builderStyles:      "/onboarding/builder/styles",
  builderPortfolio:   "/onboarding/builder/portfolio",
  complete:           "/onboarding/complete",
};

const VALID_ROLES = new Set(["client", "builder", "both"]);

function hasValidHandle(p) {
  return Boolean(p?.username) && HANDLE_REGEX.test(String(p.username).toLowerCase());
}

function hasValidDisplayName(p) {
  return Boolean(p?.display_name) && String(p.display_name).trim().length >= 2;
}

function isClient(role) {
  return role === "client" || role === "both";
}

function isBuilder(role) {
  return role === "builder" || role === "both";
}

/**
 * Returns the route path the user should be on next.
 *
 * @param {object|null} profile          row from public.profiles
 * @param {object|null} builderProfile   row from public.builder_profiles (or null)
 * @param {number}      portfolioCount   number of portfolio_images rows
 */
export function resolveNextStep(profile, builderProfile, portfolioCount = 0) {
  // No row yet OR no role chosen → step 1
  if (!profile || !VALID_ROLES.has(profile.role)) return STEPS.role;

  // Already finished
  if (profile.onboarding_completed_at) return null;

  // Display name + @handle are now collected together with avatar/bio on the
  // profile setup page — no separate identity step.

  // Client-only branch
  if (isClient(profile.role) && !isBuilder(profile.role)) {
    return STEPS.clientProfile;
  }

  // Builder (or both) branch
  if (isBuilder(profile.role)) {
    if (
      !builderProfile ||
      !hasValidDisplayName(profile) ||
      !hasValidHandle(profile)
    ) {
      return STEPS.builderIdentity;
    }
    const tools = Array.isArray(builderProfile.tools) ? builderProfile.tools : [];
    if (tools.length === 0) {
      return STEPS.builderExpertise;
    }
    const styles = Array.isArray(builderProfile.specialties) ? builderProfile.specialties : [];
    const buildTypes = Array.isArray(builderProfile.build_types) ? builderProfile.build_types : [];
    if (styles.length === 0 || buildTypes.length === 0) return STEPS.builderStyles;
    if (portfolioCount === 0) return STEPS.builderPortfolio;
  }

  return STEPS.complete;
}

/**
 * True when onboarding is finished — used by AuthContext to short-circuit
 * the gate on every page load after the first.
 */
export function isOnboardingComplete(profile) {
  return Boolean(profile?.onboarding_completed_at);
}

/**
 * Progress (0..1) for the top step indicator. Heuristic — does not need to be
 * exact, just monotonically increasing as the user advances.
 */
export function stepProgress(stepPath, role) {
  const builderOrder = [
    STEPS.role,
    STEPS.builderIdentity,
    STEPS.builderExpertise,
    STEPS.builderStyles,
    STEPS.builderPortfolio,
    STEPS.complete,
  ];
  const clientOrder = [
    STEPS.role,
    STEPS.clientProfile,
    STEPS.complete,
  ];
  const order = isBuilder(role) ? builderOrder : clientOrder;
  const i = order.indexOf(stepPath);
  if (i < 0) return 0;
  return i / (order.length - 1);
}

/** Ordered step list — used by the visual step indicator. */
export function stepsForRole(role) {
  if (isBuilder(role)) {
    return [
      { path: STEPS.role,             label: "Role" },
      { path: STEPS.builderIdentity,  label: "Profile" },
      { path: STEPS.builderExpertise, label: "Expertise" },
      { path: STEPS.builderStyles,    label: "Styles" },
      { path: STEPS.builderPortfolio, label: "Portfolio" },
    ];
  }
  return [
    { path: STEPS.role,          label: "Role" },
    { path: STEPS.clientProfile, label: "Profile" },
  ];
}
