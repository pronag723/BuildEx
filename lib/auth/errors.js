const FRIENDLY = {
  access_denied: "Login was cancelled. You can try again any time.",
  server_error: "The login provider had a hiccup. Please try again in a moment.",
  temporarily_unavailable: "Login is temporarily unavailable. Please try again shortly.",
  invalid_request: "That login link is no longer valid. Please start over.",
  otp_expired: "Your login link expired. Please request a new one.",
  email_not_confirmed: "Confirm your email address before signing in.",
  provider_email_needs_verification: "Confirm your email with the provider, then try again."
};

export function friendlyAuthError(input) {
  if (!input) return null;

  if (typeof input === "string") {
    return FRIENDLY[input] || "Something went wrong while signing you in. Please try again.";
  }

  const code = input.code || input.error || input.name;
  if (code && FRIENDLY[code]) return FRIENDLY[code];

  const message = input.message || input.error_description;
  if (typeof message === "string" && message.length < 140) {
    return message.replace(/^Error:\s*/i, "");
  }

  return "Something went wrong while signing you in. Please try again.";
}
