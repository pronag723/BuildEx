"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Turnstile — the bot check in front of "Send code" (see "Bot check
// on the login page" in the privacy policy). Supabase verifies the token: it
// is passed to signInWithOtp as captchaToken, and CAPTCHA is switched on under
// Authentication → Attack Protection.
//
// Off unless the build has NEXT_PUBLIC_TURNSTILE_SITE_KEY: then nothing loads
// and no token is sent, so local dev works while CAPTCHA is off in Supabase.
// The order on a live site matters — turn CAPTCHA on in Supabase only after a
// build carrying the key is deployed, or every email sign-in is refused.
//
// The script is injected by this component, and only the login page renders
// it, so no other page talks to Cloudflare for this. Tokens are single-use:
// the caller resets the widget after every send.
//
// appearance "interaction-only": the check runs out of sight and the box only
// appears when Cloudflare wants a click. onInteractive(true/false) tells the
// caller when it shows and hides, so the caller can keep it out of the layout.
// ─────────────────────────────────────────────────────────────────────────────

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Turnstile's normal widget is 300px wide; "compact" fits narrower phones.
const NORMAL_MIN_WIDTH = 300;

let scriptPromise = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing")));
      script.onerror = () => {
        // Let a later mount try again (e.g. after a blocker is switched off).
        scriptPromise = null;
        script.remove();
        reject(new Error("turnstile_load_failed"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function siteTheme() {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

const Turnstile = forwardRef(function Turnstile({ lang, onToken, onInteractive, onLoadError }, ref) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const onInteractiveRef = useRef(onInteractive);
  const onLoadErrorRef = useRef(onLoadError);
  onTokenRef.current = onToken;
  onInteractiveRef.current = onInteractive;
  onLoadErrorRef.current = onLoadError;

  // Follow the header's theme switch; a re-render costs only a fresh token.
  const [theme, setTheme] = useState(null);
  useEffect(() => {
    setTheme(siteTheme());
    const observer = new MutationObserver(() => setTheme(siteTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        onTokenRef.current?.(null);
        if (widgetRef.current != null) window.turnstile?.reset(widgetRef.current);
      }
    }),
    []
  );

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !theme) return undefined;
    let cancelled = false;
    onTokenRef.current?.(null);
    onInteractiveRef.current?.(false);

    loadTurnstile()
      .then((turnstile) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        widgetRef.current = turnstile.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          action: "login",
          theme,
          language: lang === "ru" ? "ru" : "en",
          size: el.clientWidth >= NORMAL_MIN_WIDTH ? "flexible" : "compact",
          appearance: "interaction-only",
          callback: (token) => onTokenRef.current?.(token),
          "before-interactive-callback": () => onInteractiveRef.current?.(true),
          "after-interactive-callback": () => onInteractiveRef.current?.(false),
          "expired-callback": () => onTokenRef.current?.(null),
          "error-callback": () => onTokenRef.current?.(null)
        });
      })
      .catch(() => {
        if (!cancelled) onLoadErrorRef.current?.();
      });

    return () => {
      cancelled = true;
      onTokenRef.current?.(null);
      onInteractiveRef.current?.(false);
      if (widgetRef.current != null) {
        window.turnstile?.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [lang, theme]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="w-full" />;
});

export default Turnstile;
