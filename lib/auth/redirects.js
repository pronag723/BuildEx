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

/** Where someone lands when sign-in had no destination of its own. */
const AFTER_LOGIN_HOME = "/account";

/**
 * Where a user goes the moment the auth handshake finishes.
 *
 * Signing in is a single click with no registration behind it: `ensureProfile`
 * creates a usable `profiles` row (role: null) straight from the OAuth
 * metadata, so a freshly signed-in visitor can already browse, favorite and
 * message builders.
 *
 * Two cases:
 *
 *   • They were heading somewhere specific — an auth-gated CTA put the page in
 *     `?redirect=` (e.g. Message on a builder's profile). Honour it, so the
 *     click that sent them to /login still completes.
 *   • They just signed in, with nowhere in particular to be. Send them to their
 *     profile rather than the homepage, so a new account has an obvious place
 *     to carry on setting itself up.
 *
 * Becoming a builder stays an explicit opt-in from /account, so `profile` does
 * not influence the destination. It stays in the signature because every caller
 * has it and a future gate may want it.
 */
export function resolvePostLoginPath(profile, target) {
  const safeTarget = sanitizeRedirect(target);
  return safeTarget === DEFAULT_AFTER_LOGIN ? AFTER_LOGIN_HOME : safeTarget;
}

export function buildLoginUrl(currentPath, basePath = "") {
  const target = sanitizeRedirect(currentPath);
  const prefix = basePath || "";
  if (target === DEFAULT_AFTER_LOGIN) return `${prefix}/login`;
  return `${prefix}/login?redirect=${encodeURIComponent(target)}`;
}

export const DEFAULT_REDIRECT = DEFAULT_AFTER_LOGIN;
