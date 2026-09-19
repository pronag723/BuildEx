const DEFAULT_AFTER_LOGIN = "/";

const SAFE_PATH = /^\/(?!\/)[^?#\s]*(\?[^\s#]*)?$/;

export function sanitizeRedirect(value) {
  if (!value || typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  if (!SAFE_PATH.test(value)) return DEFAULT_AFTER_LOGIN;
  if (value.startsWith("/login") || value.startsWith("/auth/")) {
    return DEFAULT_AFTER_LOGIN;
  }
  return value;
}

/**
 * Where a user goes the moment the auth handshake finishes.
 *
 * Signing in is now a single click with nothing behind it: `ensureProfile`
 * creates a usable `profiles` row (role: null) straight from the OAuth
 * metadata, so a freshly signed-in visitor is already able to browse, favorite
 * and message builders. There is no registration to detour through — this
 * always returns the page the user was trying to reach.
 *
 * Becoming a builder is an explicit opt-in from /account, not a fork in the
 * login flow, so `profile` no longer influences the destination. It stays in
 * the signature because every caller has it and a future gate may want it.
 */
export function resolvePostLoginPath(profile, target) {
  return sanitizeRedirect(target);
}

export function buildLoginUrl(currentPath, basePath = "") {
  const target = sanitizeRedirect(currentPath);
  const prefix = basePath || "";
  if (target === DEFAULT_AFTER_LOGIN) return `${prefix}/login`;
  return `${prefix}/login?redirect=${encodeURIComponent(target)}`;
}

export const DEFAULT_REDIRECT = DEFAULT_AFTER_LOGIN;
