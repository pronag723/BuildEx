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
 * Signing in is a single click with no registration behind it: `ensureProfile`
 * creates a usable `profiles` row (role: null) straight from the OAuth
 * metadata, so a freshly signed-in visitor can already browse, favorite and
 * message builders.
 *
 * Two cases:
 *
 *   • They were heading somewhere specific — an auth-gated CTA put the page in
 *     `?redirect=` (e.g. Message on a builder's profile, or the builder setup
 *     steps). Honour it, so the click that sent them to /login still completes.
 *   • They just signed in, with nowhere in particular to be. Send them to the
 *     feed. It used to be /account, which left clients on a page about
 *     themselves with nothing to do; builders now find "Become a builder" in
 *     the feed and the menu instead (BecomeBuilderPrompt, navItems).
 *
 * `profile` does not influence the destination. It stays in the signature
 * because every caller has it and a future gate may want it.
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
