import { translate } from "../i18n/translate.mjs";

// OAuth error codes with a friendly message in the `auth.errors` dictionary.
const FRIENDLY = new Set([
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  "invalid_request",
  "otp_expired",
  "email_not_confirmed",
  "provider_email_needs_verification"
]);

const friendly = (code) => translate(`auth.errors.${code}`);

export function friendlyAuthError(input) {
  if (!input) return null;

  if (typeof input === "string") {
    return FRIENDLY.has(input) ? friendly(input) : translate("auth.errors.generic");
  }

  const code = input.code || input.error || input.name;
  if (code && FRIENDLY.has(code)) return friendly(code);

  const message = input.message || input.error_description;
  if (typeof message === "string" && message.length < 140) {
    return message.replace(/^Error:\s*/i, "");
  }

  return translate("auth.errors.generic");
}
