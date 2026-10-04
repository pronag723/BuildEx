"use client";

// The header language control. From `sm` up it is a two-segment EN | RU pill
// the same height as the theme switch beside it; on phones the header is
// already carrying the theme switch, the account controls and the burger, so it
// collapses to a single button that shows the current language and flips it.
// Exactly one of the two is displayed at any width — switched in globals.css
// (`.lang-switch-full` / `.lang-switch-compact`), because Tailwind only scans
// app/ for class names and this file lives in lib/.

import { useLanguage, useT } from "./LanguageProvider";
import { LANGS } from "./translate.mjs";

const NAMES = { en: "English", ru: "Русский" };

export default function LanguageSwitcher({ className = "" }) {
  const { lang, setLang } = useLanguage();
  const t = useT();
  const next = lang === "ru" ? "en" : "ru";

  return (
    <>
      <div
        role="group"
        aria-label={t("common.language")}
        className={`lang-switch lang-switch-full ${className}`}
      >
        {LANGS.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={lang === code}
            aria-label={NAMES[code]}
            onClick={() => setLang(code)}
            className={`lang-switch-option ${lang === code ? "is-active" : ""}`}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setLang(next)}
        aria-label={t("common.languageToggle", {
          current: t(`common.langName.${lang}`),
          next: t(`common.langName.${next}`),
        })}
        className={`lang-switch lang-switch-compact ${className}`}
      >
        {lang.toUpperCase()}
      </button>
    </>
  );
}
