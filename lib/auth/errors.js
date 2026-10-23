import { translate } from "../i18n/translate.mjs";

// OAuth and Supabase Auth error codes with a friendly message in the
// `auth.errors` dictionary.
const FRIENDLY = new Set([
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  "invalid_request",
  "otp_expired",
  "email_not_confirmed",
  "provider_email_needs_verification",
  "captcha_failed",
  "over_request_rate_limit",
  "email_address_invalid"
]);

// Email sign-in switched off in Supabase (Sign In / Providers → Email).
const EMAIL_UNAVAILABLE = new Set(["otp_disabled", "email_provider_disabled", "signup_disabled"]);

const friendly = (code) => translate(`auth.errors.${code}`);

// Supabase answers a code requested too soon with 429
// over_email_send_rate_limit and "…you can only request this after 42
// seconds." The project-wide hourly email cap uses the same code with "Email
// rate limit exceeded", so the seconds are what tell the two apart.
export function emailRetryAfter(error) {
  const match = /after (\d+) seconds?/i.exec(error?.message || "");
  return match ? Number(match[1]) : null;
}

// Older Auth servers send no `code`, and a malformed address comes back as the
// generic validation_failed; for those, read the message.
function codeFromMessage(message) {
  if (/token has expired or is invalid|otp.*(expired|invalid)/i.test(message)) return "otp_expired";
  if (/captcha/i.test(message)) return "captcha_failed";
  if (/after \d+ seconds?|email rate limit/i.test(message)) return "over_email_send_rate_limit";
  if (/invalid.*email|email.*invalid|validate email/i.test(message)) return "email_address_invalid";
  return null;
}

export function friendlyAuthError(input) {
  if (!input) return null;

  if (typeof input === "string") {
    return FRIENDLY.has(input) ? friendly(input) : translate("auth.errors.generic");
  }

  const message = input.message || input.error_description;
  let code = input.code || input.error || null;
  if ((!code || code === "validation_failed") && typeof message === "string") {
    code = codeFromMessage(message) || code;
  }
  code = code || input.name;

  if (code === "over_email_send_rate_limit") {
    const seconds = emailRetryAfter(input);
    return seconds
      ? translate("auth.errors.code_wait", { count: seconds })
      : friendly("over_email_send_rate_limit");
  }
  if (EMAIL_UNAVAILABLE.has(code)) return friendly("email_unavailable");
  if (code && FRIENDLY.has(code)) return friendly(code);

  if (typeof message === "string" && message.length < 140) {
    return message.replace(/^Error:\s*/i, "");
  }

  return translate("auth.errors.generic");
}
