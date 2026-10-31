// Brief (ТЗ) and order helpers with no React and no Supabase, so node --test
// can import them. The vocabulary here mirrors the CHECK constraints and the
// validation in migration 0114 — change both together.

import { localeFor } from "../i18n/format.mjs";

export const BRIEF_LIMITS = {
  title: 80,
  description: 2000,
  extra: 500,
  styles: 3,
  refs: 10,
  size: 5000,
  height: 512,
  budget: 10_000_000,
};

// Labels: `buildTypes.<key>` and `styles.<key>`, shared with the catalog.
export const BRIEF_BUILD_TYPES = [
  "spawn", "lobby", "hub", "arena", "map", "terrain", "kingdom", "village", "decoration", "commission",
];

export const BRIEF_STYLES = [
  "medieval", "fantasy", "sci-fi", "cyberpunk", "modern", "realistic", "organic", "terrain", "pvp", "other",
];

// Labels: `orders.delivery.<key>`.
export const BRIEF_DELIVERY = ["schem", "litematic", "world", "server"];

export const BRIEF_VERSIONS = ["1.21", "1.20", "1.19", "1.16", "1.12"];

// Footprint presets in blocks. Labels are the numbers themselves.
export const SIZE_PRESETS = [
  [50, 50],
  [100, 100],
  [200, 200],
  [500, 500],
];

// Budget shortcuts, whole rubles; `null` on one end means open-ended.
// Labels: `orders.budget.presets.<key>`.
export const BUDGET_PRESETS = [
  { key: "upTo10", min: null, max: 10_000 },
  { key: "from10to30", min: 10_000, max: 30_000 },
  { key: "from30to60", min: 30_000, max: 60_000 },
  { key: "over60", min: 60_000, max: null },
];

// Labels: `orders.declineReasons.<key>`.
export const DECLINE_REASONS = ["busy", "style", "budget", "other"];

export const ACTIVE_STATUSES = ["pending", "offered", "in_progress", "delivered"];

export function emptyBrief() {
  return {
    title: "",
    build_type: "",
    styles: [],
    size_w: "",
    size_l: "",
    size_h: "",
    edition: "java",
    mc_version: "",
    deadline: "",
    budget_min_rub: "",
    budget_max_rub: "",
    budget_open: false,
    delivery: "",
    refs: [],
    description: "",
    extra: "",
  };
}

// A brief row from the database → the editable form shape.
export function briefToForm(row) {
  if (!row) return emptyBrief();
  const str = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    title: row.title || "",
    build_type: row.build_type || "",
    styles: Array.isArray(row.styles) ? row.styles : [],
    size_w: str(row.size_w),
    size_l: str(row.size_l),
    size_h: str(row.size_h),
    edition: row.edition || "java",
    mc_version: row.mc_version || "",
    deadline: row.deadline || "",
    budget_min_rub: str(row.budget_min_rub),
    budget_max_rub: str(row.budget_max_rub),
    budget_open: Boolean(row.budget_open),
    delivery: row.delivery || "",
    refs: Array.isArray(row.refs) ? row.refs : [],
    description: row.description || "",
    extra: row.extra || "",
  };
}

const digits = (v) => String(v ?? "").replace(/\D+/g, "");

/** "25 000" typed with spaces or dots → 25000; "" → null. */
export function parseRub(value) {
  const d = digits(value);
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

/**
 * Problems that stop a brief from being sent, as dictionary keys under
 * `orders.errors`. The server checks the same things; this only spares a
 * round trip and lets the form say what is wrong next to the field.
 */
export function briefErrors(form, today = new Date()) {
  const errors = {};
  if (!BRIEF_BUILD_TYPES.includes(form.build_type)) errors.build_type = "needType";
  if (form.title.trim().length > BRIEF_LIMITS.title) errors.title = "titleLong";
  if (form.styles.length > BRIEF_LIMITS.styles) errors.styles = "tooManyStyles";
  const min = parseRub(form.budget_min_rub);
  const max = parseRub(form.budget_max_rub);
  if (!form.budget_open && min !== null && max !== null && min > max) errors.budget = "budgetOrder";
  if ((min ?? 0) > BRIEF_LIMITS.budget || (max ?? 0) > BRIEF_LIMITS.budget) errors.budget = "budgetHigh";
  for (const key of ["size_w", "size_l"]) {
    const n = parseRub(form[key]);
    if (n !== null && (n < 1 || n > BRIEF_LIMITS.size)) errors.size = "sizeRange";
  }
  const h = parseRub(form.size_h);
  if (h !== null && (h < 1 || h > BRIEF_LIMITS.height)) errors.size = "heightRange";
  if (form.mc_version && !/^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$/.test(form.mc_version.trim())) {
    errors.mc_version = "badVersion";
  }
  if (form.deadline) {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const d = new Date(`${form.deadline}T00:00:00`);
    if (Number.isNaN(d.getTime()) || d < start) errors.deadline = "pastDeadline";
  }
  if (form.description.length > BRIEF_LIMITS.description) errors.description = "descriptionLong";
  if (form.extra.length > BRIEF_LIMITS.extra) errors.extra = "extraLong";
  return errors;
}

/** The form → the JSON send_brief / update_brief take. */
export function briefPayload(form, fallbackTitle = "") {
  const intOrNull = (v) => parseRub(v);
  return {
    title: (form.title.trim() || fallbackTitle).slice(0, BRIEF_LIMITS.title),
    build_type: form.build_type,
    styles: form.styles.slice(0, BRIEF_LIMITS.styles),
    size_w: intOrNull(form.size_w),
    size_l: intOrNull(form.size_l),
    size_h: intOrNull(form.size_h),
    edition: form.edition || null,
    mc_version: form.mc_version.trim() || null,
    deadline: form.deadline || null,
    budget_min_rub: form.budget_open ? null : intOrNull(form.budget_min_rub),
    budget_max_rub: form.budget_open ? null : intOrNull(form.budget_max_rub),
    budget_open: Boolean(form.budget_open),
    delivery: form.delivery || null,
    refs: form.refs.slice(0, BRIEF_LIMITS.refs),
    description: form.description.trim(),
    extra: form.extra.trim(),
  };
}

/** 30000 → "30 000 ₽" (ru) / "₽30,000" (en). */
export function formatRub(value, lang) {
  if (value === null || value === undefined || value === "") return "";
  return new Intl.NumberFormat(localeFor(lang), {
    style: "currency",
    currency: "RUB",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

/**
 * The budget as one line, or null when none was given:
 * "25 000–35 000 ₽", "до 10 000 ₽" / "up to ₽10,000", "от 60 000 ₽".
 * `t` supplies the "up to" / "from" / "let the builder price it" wording.
 */
export function budgetText({ budget_min_rub: min, budget_max_rub: max, budget_open: open }, lang, t) {
  if (open) return t("orders.budget.open");
  const lo = min === "" ? null : min;
  const hi = max === "" ? null : max;
  if (lo != null && hi != null) {
    if (Number(lo) === Number(hi)) return formatRub(hi, lang);
    const n = new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: 0 });
    const range = `${n.format(Number(lo))}–${n.format(Number(hi))}`;
    return lang === "ru" ? `${range} ₽` : `₽${range}`;
  }
  if (hi != null) return t("orders.budget.upTo", { amount: formatRub(hi, lang) });
  if (lo != null) return t("orders.budget.from", { amount: formatRub(lo, lang) });
  return null;
}

/** "200 × 200", "200 × 200 × 60", or null. */
export function sizeText({ size_w: w, size_l: l, size_h: h }) {
  const parts = [w, l].filter((v) => v !== null && v !== undefined && v !== "");
  if (parts.length < 2) return null;
  return h ? `${w} × ${l} × ${h}` : `${w} × ${l}`;
}

/** An ISO date ("2026-11-06") → "6 нояб." / "Nov 6", in the reader's language. */
export function shortDate(iso, lang) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(localeFor(lang), { month: "short", day: "numeric" }).format(d);
}

/**
 * Is the builder's price inside what the client asked for? Mirrors
 * take_order(): only then does taking the order start it straight away.
 */
export function insideBrief(brief, price, deadline) {
  if (!brief || brief.budget_open) return false;
  const ceiling = brief.budget_max_rub ?? brief.budget_min_rub;
  if (ceiling === null || ceiling === undefined || !price) return false;
  if (Number(price) > Number(ceiling)) return false;
  if (brief.deadline && deadline && deadline > brief.deadline) return false;
  return true;
}

/** The order that the strip above the thread shows: the newest still open. */
export function activeOrder(orders) {
  const open = (orders || []).filter((o) => ACTIVE_STATUSES.includes(o.status));
  return open.length ? open[open.length - 1] : null;
}
