"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — language state
//
// The static HTML is always English, so the first client render is English too
// (anything else would be a hydration mismatch). A layout effect then applies
// the stored choice — or, on a first visit, the browser's language — before the
// browser paints. The inline script in app/layout.js hides <body> for Russian
// visitors until that happens, so they never see the English text flash.
//
// The choice lives in localStorage under "lang": it survives client navigation
// (this provider sits in the root layout), full reloads, the plain <a href>
// links some headers use, and is mirrored into other open tabs.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LANG,
  STORAGE_KEY,
  detectLang,
  interpolate,
  lookup,
  normalizeLang,
  richParts,
  setCurrentLang,
} from "./translate.mjs";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const LanguageContext = createContext({ lang: DEFAULT_LANG, setLang: () => {} });

function readInitialLang() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ru") return stored;
  } catch {
    // Storage blocked (private mode, sandboxed iframe): fall through to detection.
  }
  const nav = typeof navigator !== "undefined" ? navigator : null;
  return detectLang(nav ? nav.languages || [nav.language] : []);
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);

  const apply = useCallback((next) => {
    const value = normalizeLang(next);
    // Module store first: lib/ helpers called during the re-render read it.
    setCurrentLang(value);
    setLangState(value);
    if (typeof document !== "undefined") document.documentElement.lang = value;
  }, []);

  useIsomorphicLayoutEffect(() => {
    apply(readInitialLang());
    // The state update above re-renders synchronously before paint, so the
    // page is already in the right language when it becomes visible.
    document.documentElement.classList.remove("i18n-pending");
  }, [apply]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key === STORAGE_KEY && (event.newValue === "en" || event.newValue === "ru")) {
        apply(event.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [apply]);

  const setLang = useCallback(
    (next) => {
      const value = normalizeLang(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch {
        // Not persisted, but the switch still applies for this page view.
      }
      apply(value);
    },
    [apply]
  );

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

function makeT(lang) {
  // t("ns.key", { name }) → string (or the raw array/object for structured copy)
  const t = (key, vars) => interpolate(lookup(lang, key, vars), vars);
  // t.rich("ns.key", { link: <a/> }) → React children with elements spliced in
  t.rich = (key, vars) =>
    createElement(Fragment, null, ...richParts(lookup(lang, key, vars), vars));
  t.lang = lang;
  return t;
}

/** The translation function for the current language. Re-renders on switch. */
export function useT() {
  const { lang } = useContext(LanguageContext);
  return useMemo(() => makeT(lang), [lang]);
}
