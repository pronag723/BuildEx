// Locale-aware date and time helpers. The English output of each one is exactly
// what the components printed before localization ("now", "5m", "4h", "Mon",
// "Apr 3", "3:05 PM", "April 3, 2026"); Russian gets the ru-RU equivalents.

import { translate } from "./translate.mjs";

export function localeFor(lang) {
  return lang === "ru" ? "ru-RU" : "en-US";
}

/** Compact "now / 2m / 4h / Mon / Apr 3" stamp for inbox and notification rows. */
export function relativeStamp(iso, lang) {
  if (!iso) return "";
  const then = new Date(iso);
  const diff = Date.now() - then.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return translate("common.time.now", null, lang);
  if (min < 60) return translate("common.time.minutes", { n: min }, lang);
  const hr = Math.floor(min / 60);
  if (hr < 24) return translate("common.time.hours", { n: hr }, lang);
  const day = Math.floor(hr / 24);
  const locale = localeFor(lang);
  if (day < 7) return then.toLocaleDateString(locale, { weekday: "short" });
  return then.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function formatTime(iso, lang) {
  return new Date(iso).toLocaleTimeString(localeFor(lang), { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso, lang, options) {
  return new Date(iso).toLocaleDateString(localeFor(lang), options);
}

export function formatDateTime(iso, lang, options) {
  return new Date(iso).toLocaleString(localeFor(lang), options);
}
