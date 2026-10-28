// Number, price, duration and age helpers for works and price tiers. Plain .mjs
// (no React, no Supabase) so node --test can import it directly.

import { localeFor } from "../i18n/format.mjs";

// The year Minecraft was first released; nobody has been building longer.
export const FIRST_BUILD_YEAR = 2009;

/** "980", "9.8K" / "9,8 тыс." — likes and view counters. */
export function formatCount(n, lang) {
  const value = Number.isFinite(n) ? n : 0;
  if (Math.abs(value) < 1000) return String(Math.trunc(value));
  return new Intl.NumberFormat(localeFor(lang), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * "₽2,000" / "2 000 ₽" — whole rubles. Prices are stored in kopecks (the
 * column is still named price_from_cents from when they were dollars).
 */
export function formatPrice(kopecks, lang) {
  const value = Number.isFinite(kopecks) ? kopecks : 0;
  return new Intl.NumberFormat(localeFor(lang), {
    style: "currency",
    currency: "RUB",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value / 100));
}

/**
 * Full years since `buildingSince` (a calendar year), or null when unset or
 * out of range. 0 means "started this year".
 */
export function experienceYears(buildingSince, now = new Date()) {
  const since = Number(buildingSince);
  const year = now.getFullYear();
  if (!Number.isInteger(since) || since < FIRST_BUILD_YEAR || since > year) return null;
  return year - since;
}

/**
 * A duration range as display text plus the number a plural form should agree
 * with: (2, 4) → { text: "2–4", count: 4 }, (3, null) → { text: "3", count: 3 }.
 * Null when neither end is set.
 */
export function daysRange(min, max) {
  const lo = Number.isFinite(min) && min > 0 ? min : null;
  const hi = Number.isFinite(max) && max > 0 ? max : null;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null && lo !== hi) return { text: `${lo}–${hi}`, count: hi };
  const one = lo ?? hi;
  return { text: String(one), count: one };
}

const RELATIVE_STEPS = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** "2 days ago" / "2 дня назад", "yesterday" / "вчера". */
export function relativeAgo(iso, lang, now = Date.now()) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  const rtf = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: "auto" });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return rtf.format(0, "second");
}
