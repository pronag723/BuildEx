const DEFAULT_AFTER_LOGIN = "/";

const SAFE_PATH = /^\/(?!\/)[^?#\s]*(\?[^\s#]*)?$/;

export function sanitizeRedirect(value) {
  if (!value || typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  if (!SAFE_PATH.test(value)) return DEFAULT_AFTER_LOGIN;
  if (value.startsWith("/login") || value.startsWith("/signup") || value.startsWith("/auth/")) {
    return DEFAULT_AFTER_LOGIN;
  }
  return value;
}

/**
 * After a successful login we may need to detour through /onboarding before
 * sending the user to their originally-requested page. Returns the path that
 * should immediately follow the auth handshake.
 *
 *   - Onboarding incomplete → /onboarding (with `?redirect=` preserved so the
 *     OnboardingGate can route the user to their original destination after
 *     they finish setting up their profile).
 *   - Onboarding complete → the sanitized `target`.
 */
export function resolvePostLoginPath(profile, target) {
  const safeTarget = sanitizeRedirect(target);
  if (!profile) return safeTarget;
  if (!profile.role || !profile.onboarding_completed_at) {
    if (safeTarget && safeTarget !== DEFAULT_AFTER_LOGIN) {
      return `/onboarding?redirect=${encodeURIComponent(safeTarget)}`;
    }
    return "/onboarding";
  }
  return safeTarget;
}

export function buildLoginUrl(currentPath, basePath = "") {
  const target = sanitizeRedirect(currentPath);
  const prefix = basePath || "";
  if (target === DEFAULT_AFTER_LOGIN) return `${prefix}/login`;
  return `${prefix}/login?redirect=${encodeURIComponent(target)}`;
}

export const DEFAULT_REDIRECT = DEFAULT_AFTER_LOGIN;
