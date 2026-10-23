export default {
  title: "Log in or sign up",
  subtitle:
    "Use Discord, Google or a code sent to your email. If you're new, your account is created automatically and you come straight back here.",
  notConfigured:
    "Authentication isn't configured yet. Add {url} and {key} to {file} and restart the dev server.",
  notConfiguredShort: "Auth is not configured. Add Supabase keys to .env.local.",
  continueWith: "Continue with {provider}",
  or: "or",
  // Email-code sign-in (app/auth/components/EmailCodeForm.jsx).
  email: {
    label: "Email",
    placeholder: "you@example.com",
    send: "Send code",
    // {email} is the address, emphasised by the form.
    sentTo: "We sent a 6-digit code to {email}. It expires in 10 minutes.",
    codeLabel: "Sign-in code",
    verify: "Sign in",
    resend: "Resend code",
    resendIn: "Resend code in {seconds}s",
    resent: "We sent a new code. Only the newest one works.",
    differentEmail: "Use a different email",
    checkSpam: "Can't find it? Check your spam folder.",
    captchaLoadFailed:
      "The security check couldn't load. Turn off any content blocker for this page and reload it.",
  },
  // {terms} and {privacy} are the two policy links, spliced in by AuthCard.
  consent:
    "By continuing you confirm you are at least 13 and have any consent required by local law, and you accept the {terms} and acknowledge the {privacy}.",
  termsLink: "Terms of Use",
  privacyLink: "Privacy Policy",
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
    otp_expired: "That code is wrong or has expired. Check it, or send a new one.",
    email_not_confirmed: "Confirm your email address before signing in.",
    provider_email_needs_verification: "Confirm your email with the provider, then try again.",
    code_wait: {
      one: "Please wait {count} second before requesting another code.",
      other: "Please wait {count} seconds before requesting another code.",
    },
    over_email_send_rate_limit:
      "Too many sign-in emails were sent recently. Try again later, or continue with Discord or Google.",
    over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
    captcha_failed: "The security check didn't pass. Wait for it to finish, then try again.",
    email_address_invalid: "Enter a valid email address.",
    email_unavailable: "Email sign-in isn't available right now. Continue with Discord or Google.",
    generic: "Something went wrong while signing you in. Please try again.",
  },
};
