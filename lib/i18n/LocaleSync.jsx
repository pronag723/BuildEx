"use client";

// Records the interface language as the account's email language the first
// time a signed-in user is seen, if the account has none yet. After that the
// stored value changes only when they use the header switch (LanguageSwitcher),
// so a language picked on purpose is never overwritten by whatever browser
// they happen to sign in from.
//
// One RPC per account per browser: a flag in localStorage remembers that it is
// done, and is only set once the server confirms it.

import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "./LanguageProvider";
import { initMyLocale } from "../notifications/emailSettings";

const FLAG_PREFIX = "buildex-locale-init:";

export default function LocaleSync() {
  const { status, user } = useAuth();
  const { lang } = useLanguage();
  const userId = user?.id || null;

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const flag = FLAG_PREFIX + userId;
    try {
      if (window.localStorage.getItem(flag)) return;
    } catch {
      // Storage blocked: just make the (idempotent) call.
    }
    let cancelled = false;
    initMyLocale(lang).then(({ locale }) => {
      if (cancelled || !locale) return;
      try {
        window.localStorage.setItem(flag, "1");
      } catch {}
    });
    return () => {
      cancelled = true;
    };
    // `lang` is read once, at the moment the account is first seen; a later
    // switch is saved by LanguageSwitcher instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId]);

  return null;
}
