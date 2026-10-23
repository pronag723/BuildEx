"use client";

// Passwordless email sign-in: the address gets a 6-digit code, the person types
// it here. Sign-in and sign-up are the same step, and both answers look the
// same, so the form never reveals whether an address has an account.
//
// Step "email": address + Turnstile + Send code.
// Step "code":  the code in six boxes, Resend code after a 60-second countdown
//               (with a fresh Turnstile, since tokens are single-use), Use a
//               different email.
//
// The six boxes are drawn over ONE transparent input rather than being six
// inputs: autocomplete="one-time-code", pasting a whole code and mobile autofill
// all fill a single field, and focus never has to hop between boxes.
//
// Errors show inside the form, next to the field they are about. AuthCard owns
// the pending state shared with the OAuth buttons, and redirects once the
// session lands — this form never redirects.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth/AuthContext";
import { emailRetryAfter, friendlyAuthError } from "../../../lib/auth/errors";
import { stageAccountAcceptance } from "../../../lib/legal/api";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import Turnstile, { TURNSTILE_SITE_KEY } from "./Turnstile";

const CODE_LENGTH = 6;
// Supabase refuses a second email to the same address within 60 seconds
// (Authentication → Emails → SMTP settings → minimum interval).
const RESEND_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Spinner({ size = 18 }) {
  return (
    <span
      className="rounded-full border-2 border-current border-t-transparent opacity-70 animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

// A pasted email line ("Your code is 123 456") → its six digits.
function codeFromText(text) {
  const run = /(?<!\d)\d{6}(?!\d)/.exec(text);
  return (run ? run[0] : text.replace(/\D/g, "")).slice(0, CODE_LENGTH);
}

export default function EmailCodeForm({ disabled, pending, onPending }) {
  const { sendEmailCode, verifyEmailCode } = useAuth();
  const t = useT();
  const turnstileRef = useRef(null);
  const codeInputRef = useRef(null);

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [codeFocused, setCodeFocused] = useState(false);
  // The last code was rejected: the boxes turn red until the next digit.
  const [codeRejected, setCodeRejected] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);

  const needsCaptcha = Boolean(TURNSTILE_SITE_KEY);
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const counting = step === "code" && secondsLeft > 0;
  const busy = Boolean(pending);

  useEffect(() => {
    if (!counting) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  function startCountdown(seconds) {
    const at = Date.now();
    setNow(at);
    setResendAt(at + seconds * 1000);
  }

  async function send(address, kind) {
    if (busy) return;
    setError(null);
    setNotice(null);
    onPending(kind);
    stageAccountAcceptance();

    const { error: sendError } = await sendEmailCode(address, { captchaToken: captchaToken || undefined });
    // Tokens are single-use: get a fresh one whatever the answer was.
    turnstileRef.current?.reset();
    onPending(null);

    if (sendError) {
      setError(friendlyAuthError(sendError));
      const wait = emailRetryAfter(sendError);
      if (wait && kind === "resend") startCountdown(wait);
      return;
    }

    setSentTo(address);
    setCode("");
    setCodeRejected(false);
    startCountdown(RESEND_SECONDS);
    setStep("code");
    if (kind === "resend") setNotice(t("auth.email.resent"));
  }

  function handleSend(event) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError(t("auth.errors.email_address_invalid"));
      return;
    }
    send(address, "send");
  }

  async function verify(value) {
    if (busy || value.length !== CODE_LENGTH) return;
    setError(null);
    setNotice(null);
    onPending("verify");
    const { error: verifyError } = await verifyEmailCode(sentTo, value);
    if (verifyError) {
      onPending(null);
      setError(friendlyAuthError(verifyError));
      setCodeRejected(true);
      setCode("");
      codeInputRef.current?.focus();
    }
    // On success "verify" stays pending until AuthCard's redirect.
  }

  function handleCodeChange(event) {
    const next = event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (codeRejected && next) {
      setCodeRejected(false);
      setError(null);
    }
    setCode(next);
    if (next.length === CODE_LENGTH && next !== code) verify(next);
  }

  function handleCodePaste(event) {
    const text = event.clipboardData?.getData("text") || "";
    if (text.replace(/\D/g, "").length < CODE_LENGTH) return;
    event.preventDefault();
    const next = codeFromText(text);
    setCode(next);
    verify(next);
  }

  // The boxes only draw the value, so the caret always sits at its end.
  function keepCaretAtEnd(event) {
    const el = event.currentTarget;
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end);
  }

  function changeEmail() {
    setError(null);
    setNotice(null);
    setCode("");
    setCodeRejected(false);
    setStep("email");
  }

  const turnstile = needsCaptcha && (
    <>
      <Turnstile
        ref={turnstileRef}
        lang={t.lang}
        onToken={(token) => {
          setCaptchaToken(token);
          if (token) setCaptchaFailed(false);
        }}
        onLoadError={() => setCaptchaFailed(true)}
      />
      {captchaFailed && <p className="text-xs leading-5 text-danger">{t("auth.email.captchaLoadFailed")}</p>}
    </>
  );
  const errorBanner = error && (
    <div role="alert" className="auth-banner auth-banner-error">
      {error}
    </div>
  );
  const captchaReady = !needsCaptcha || Boolean(captchaToken);

  if (step === "email") {
    return (
      <form onSubmit={handleSend} noValidate className="flex flex-col gap-3">
        <label htmlFor="auth-email" className="text-sm font-medium text-ink">
          {t("auth.email.label")}
        </label>
        <input
          id="auth-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("auth.email.placeholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={disabled || busy}
          className="input h-11 text-[15px]"
        />
        {errorBanner}
        {turnstile}
        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={disabled || busy || !email.trim() || !captchaReady}
        >
          {pending === "send" ? <Spinner /> : <Icon name="mail" size={17} />}
          {t("auth.email.send")}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          verify(code);
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm leading-relaxed text-ink-2">
          {t.rich("auth.email.sentTo", { email: <span className="font-medium text-ink break-all">{sentTo}</span> })}
        </p>
        <label htmlFor="auth-code" className="text-sm font-medium text-ink">
          {t("auth.email.codeLabel")}
        </label>
        <div className="relative">
          <input
            ref={codeInputRef}
            id="auth-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            value={code}
            onChange={handleCodeChange}
            onPaste={handleCodePaste}
            onSelect={keepCaretAtEnd}
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            disabled={disabled}
            readOnly={pending === "verify"}
            aria-invalid={codeRejected || undefined}
            className="otp-input"
          />
          <div className="otp-cells" aria-hidden="true">
            {Array.from({ length: CODE_LENGTH }, (_, i) => {
              const digit = code[i] || "";
              const active = codeFocused && pending !== "verify" && i === Math.min(code.length, CODE_LENGTH - 1);
              const state = codeRejected ? " is-error" : active ? " is-active" : digit ? " is-filled" : "";
              return (
                <span key={i} className={`otp-cell${state}`}>
                  {digit || (active && <span className="otp-caret" />)}
                </span>
              );
            })}
          </div>
        </div>
        {errorBanner}
        {notice && (
          <p role="status" className="text-xs leading-5 text-ink-2">
            {notice}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={disabled || busy || code.length !== CODE_LENGTH}
        >
          {pending === "verify" && <Spinner />}
          {t("auth.email.verify")}
        </button>
      </form>

      <p className="text-xs leading-5 text-ink-3">{t("auth.email.checkSpam")}</p>

      {!counting && turnstile}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => send(sentTo, "resend")}
          disabled={disabled || busy || counting || !captchaReady}
          className="btn btn-ghost btn-sm -ml-3"
        >
          {pending === "resend" ? <Spinner size={14} /> : <Icon name="refresh" size={14} />}
          {counting ? t("auth.email.resendIn", { seconds: secondsLeft }) : t("auth.email.resend")}
        </button>
        <button
          type="button"
          onClick={changeEmail}
          disabled={busy}
          className="btn btn-ghost btn-sm -mr-3"
        >
          {t("auth.email.differentEmail")}
        </button>
      </div>
    </div>
  );
}
