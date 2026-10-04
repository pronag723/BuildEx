export default {
  title: "Welcome to BuildEx",
  subtitle:
    "One click and you're in. New here? Pick a provider — your account is created for you and you land right back where you were.",
  secureBadge: "Secure auth via Supabase",
  notConfigured:
    "Authentication isn't configured yet. Add {url} and {key} to {file} and restart the dev server.",
  notConfiguredShort: "Auth is not configured. Add Supabase keys to .env.local.",
  continueWith: "Continue with {provider}",
  // {terms} and {privacy} are the two policy links, spliced in by AuthCard.
  consent:
    "By continuing you confirm you are at least 13 and have any consent required by local law, and you accept the {terms} and acknowledge the {privacy}.",
  termsLink: "Terms of Use",
  privacyLink: "Privacy Policy",
  moreSoon: "More options soon",
  roadmap: "Email login, account linking, and 2FA are on the roadmap.",
  acceptanceRecorded:
    "Your acceptance is recorded with the applicable policy versions when your account is created.",
  callback: {
    notConfiguredTitle: "Authentication not configured",
    notConfiguredBody: "Add Supabase keys to {file} to enable sign-in.",
    stuckTitle: "Sign-in didn't finish",
    stuckBody:
      "If you refreshed this page, the one-time login code in the URL is no longer valid — please sign in again.",
    backToLogin: "Back to login",
    signingIn: "Signing you in…",
  },
  errors: {
    access_denied: "Login was cancelled. You can try again any time.",
    server_error: "The login provider had a hiccup. Please try again in a moment.",
    temporarily_unavailable: "Login is temporarily unavailable. Please try again shortly.",
    invalid_request: "That login link is no longer valid. Please start over.",
    otp_expired: "Your login link expired. Please request a new one.",
    email_not_confirmed: "Confirm your email address before signing in.",
    provider_email_needs_verification: "Confirm your email with the provider, then try again.",
    generic: "Something went wrong while signing you in. Please try again.",
  },
};
