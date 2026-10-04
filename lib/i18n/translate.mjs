// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — translation core
//
// The site ships one static HTML file per route (`output: "export"`), so the
// language is client state, exactly like the theme: the page renders in
// English, then LanguageProvider switches it to the stored choice. Nothing here
// touches routing.
//
// Dictionaries live in ./messages/<lang>/<namespace>.mjs and are addressed as
// "namespace.path.to.key". Values are:
//   • strings, with `{name}` placeholders;
//   • plural objects ({ one, few, many, other }), picked by `vars.count`
//     through Intl.PluralRules — Russian needs one/few/many, English one/other;
//   • arrays or plain objects for structured copy (lists, cards).
//
// This file is plain .mjs (no JSX) so `node --test` can import it directly.
// ─────────────────────────────────────────────────────────────────────────────

import { messages } from "./messages/index.mjs";

export const LANGS = ["en", "ru"];
export const DEFAULT_LANG = "en";
export const STORAGE_KEY = "lang";

export function normalizeLang(value) {
  return value === "ru" ? "ru" : "en";
}

/** First-visit guess from the browser's preferred language. */
export function detectLang(preferred) {
  const first = Array.isArray(preferred) ? preferred.find(Boolean) : preferred;
  return /^ru(?:-|$)/i.test(first || "") ? "ru" : DEFAULT_LANG;
}

// The language non-React callers (validators, error helpers in lib/) should
// speak. LanguageProvider updates it BEFORE it re-renders, so anything computed
// during that render already sees the new value.
let currentLang = DEFAULT_LANG;

export function getLang() {
  return currentLang;
}

export function setCurrentLang(lang) {
  currentLang = normalizeLang(lang);
}

function resolve(tree, key) {
  let node = tree;
  for (const part of key.split(".")) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
}

const pluralRules = {};

export function pluralCategory(lang, count) {
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  if (!pluralRules[locale]) pluralRules[locale] = new Intl.PluralRules(locale);
  return pluralRules[locale].select(count);
}

function isPluralObject(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.other === "string"
  );
}

/** Raw dictionary value for `key`, with English as the fallback language. */
export function lookup(lang, key, vars) {
  let value = resolve(messages[normalizeLang(lang)], key);
  if (value === undefined && lang !== DEFAULT_LANG) value = resolve(messages[DEFAULT_LANG], key);
  if (value === undefined) return key;
  if (isPluralObject(value) && vars && typeof vars.count === "number") {
    value = value[pluralCategory(lang, vars.count)] ?? value.other;
  }
  return value;
}

export function hasKey(lang, key) {
  return resolve(messages[normalizeLang(lang)], key) !== undefined;
}

export function interpolate(template, vars) {
  if (typeof template !== "string" || !vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Split a template into an array of text and variable values, so a `{name}`
 * can be a React element (a link, a coloured span). Strings are returned
 * unchanged; the React wrapper in LanguageProvider turns the array into
 * children.
 */
export function richParts(template, vars) {
  if (typeof template !== "string") return [template];
  if (!vars) return [template];
  const parts = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let match;
  while ((match = re.exec(template)) !== null) {
    if (match.index > last) parts.push(template.slice(last, match.index));
    const name = match[1];
    parts.push(Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match[0]);
    last = re.lastIndex;
  }
  if (last < template.length) parts.push(template.slice(last));
  return parts;
}

/** Translate outside React (lib/ helpers). Uses the provider's current language. */
export function translate(key, vars, lang = currentLang) {
  return interpolate(lookup(lang, key, vars), vars);
}
