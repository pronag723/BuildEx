import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { messages } from "../lib/i18n/messages/index.mjs";
import { lookup, translate } from "../lib/i18n/translate.mjs";

// The English dictionary is the source of truth; the Russian one has to have
// exactly the same shape, or a key silently falls back to English (or worse,
// renders as its own name). These tests also check that every key the code
// asks for exists, and that Russian plurals pick the right form.

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

const isPlural = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  typeof v.other === "string" &&
  Object.keys(v).every((k) => PLURAL_FORMS.has(k));

const isLeaf = (v) => typeof v === "string" || isPlural(v);

const placeholders = (v) => {
  const strings = typeof v === "string" ? [v] : Object.values(v);
  return [...new Set(strings.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
};

function compare(en, ru, path, problems) {
  if (isLeaf(en) || isLeaf(ru)) {
    if (!isLeaf(en) || !isLeaf(ru)) {
      problems.push(`${path}: one side is text, the other is not`);
      return;
    }
    for (const [lang, value] of [["en", en], ["ru", ru]]) {
      const strings = typeof value === "string" ? [value] : Object.values(value);
      if (strings.some((s) => !s.trim())) problems.push(`${path}: empty ${lang} string`);
    }
    const a = placeholders(en);
    const b = placeholders(ru);
    if (a.join() !== b.join()) problems.push(`${path}: placeholders differ (en ${a}, ru ${b})`);
    return;
  }
  if (Array.isArray(en) || Array.isArray(ru)) {
    if (!Array.isArray(en) || !Array.isArray(ru) || en.length !== ru.length) {
      problems.push(`${path}: lists differ in length`);
      return;
    }
    en.forEach((item, i) => compare(item, ru[i], `${path}[${i}]`, problems));
    return;
  }
  const keys = new Set([...Object.keys(en), ...Object.keys(ru)]);
  for (const key of keys) {
    const next = path ? `${path}.${key}` : key;
    if (!(key in en)) problems.push(`${next}: only in ru`);
    else if (!(key in ru)) problems.push(`${next}: missing from ru`);
    else compare(en[key], ru[key], next, problems);
  }
}

test("the Russian dictionary has exactly the English shape", () => {
  const problems = [];
  compare(messages.en, messages.ru, "", problems);
  assert.deepEqual(problems, []);
});

test("Russian plurals pick one / few / many", () => {
  const forms = (key) => [1, 3, 5, 11, 21, 22, 25].map((count) => translate(key, { count }, "ru"));
  assert.deepEqual(forms("card.builds"), [
    "1 работа", "3 работы", "5 работ", "11 работ", "21 работа", "22 работы", "25 работ",
  ]);
  assert.deepEqual(forms("about.hero.online").map((s) => s.split(" ").slice(0, 2).join(" ")), [
    "1 билдер", "3 билдера", "5 билдеров", "11 билдеров", "21 билдер", "22 билдера", "25 билдеров",
  ]);
  // English keeps its two forms.
  assert.equal(translate("card.builds", { count: 1 }, "en"), "1 build");
  assert.equal(translate("card.builds", { count: 2 }, "en"), "2 builds");
});

test("a missing Russian key falls back to English, never to nothing", () => {
  assert.equal(lookup("ru", "nav.builders"), "Билдеры");
  assert.equal(lookup("en", "nav.builders"), "Builders");
  assert.equal(lookup("ru", "no.such.key"), "no.such.key");
});

// ── Every key the code names must exist ──────────────────────────────────────

const ROOTS = ["app", "lib"];
const SOURCE = /\.(?:js|jsx|mjs)$/;
const NAMESPACES = Object.keys(messages.en);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(name) && !path.includes(join("lib", "i18n", "messages"))) out.push(path);
  }
  return out;
}

const resolves = (key) => {
  let node = messages.en;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return false;
    node = node[part];
  }
  return node !== undefined;
};

test("every dictionary key named in the code exists", () => {
  // Any string literal shaped like "<namespace>.<path>" — t("…"), t.rich("…"),
  // translate("…"), fallback keys and keys held in state all look like this.
  const literal = new RegExp(`["'\`]((?:${NAMESPACES.join("|")})\\.[A-Za-z0-9_.-]+)["'\`]`, "g");
  const missing = [];
  for (const file of ROOTS.flatMap((root) => walk(root))) {
    const source = readFileSync(file, "utf8");
    for (const [, key] of source.matchAll(literal)) {
      if (!key.endsWith(".") && !resolves(key)) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("vocabularies the UI looks up by key are all translated", () => {
  const keysIn = (path, block) => {
    const source = readFileSync(path, "utf8");
    const body = source.slice(source.indexOf(block));
    const end = body.indexOf("];");
    return [...body.slice(0, end).matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
  };
  const expectKeys = (keys, namespace) => {
    for (const key of keys) {
      for (const lang of ["en", "ru"]) {
        assert.ok(
          key.split(".").reduce((n, p) => n?.[p], messages[lang][namespace]) !== undefined,
          `${lang}.${namespace}.${key} is missing`
        );
      }
    }
  };
  expectKeys(keysIn("app/builders/data/offers.js", "export const STYLES"), "styles");
  expectKeys(keysIn("app/builders/data/offers.js", "export const BUILD_TYPES"), "buildTypes");
  expectKeys(keysIn("app/builders/components/navItems.js", "export const catalogNavItems"), "nav");
  expectKeys(keysIn("app/home/data.js", "export const navItems"), "nav");
  expectKeys(keysIn("app/builders/data/builders.js", "export const SORT_OPTIONS").map((k) => `sort.${k}`), "catalog");
  expectKeys(keysIn("app/home/data.js", "export const projects").map((k) => `projects.items.${k}`), "about");
  expectKeys(keysIn("app/home/data.js", "export const steps").map((k) => `how.steps.${k}`), "about");
  expectKeys(keysIn("lib/onboarding/contactLinks.js", "const PLATFORMS").map((k) => `${k}.label`), "platforms");
});

test("the Russian legal documents mirror the English ones", () => {
  // documents.ru.js imports documents.js, which imports lib/legal/constants —
  // all plain ESM, read here as text to avoid a typeless-package warning.
  const en = readFileSync("app/legal/documents.js", "utf8");
  const ru = readFileSync("app/legal/documents.ru.js", "utf8");
  // One entry per document, in order: how many sections it has.
  const sectionCounts = (source) =>
    source
      .split(/^ {2}(?:"[\w-]+"|\w+): \{/m)
      .slice(1)
      .map((chunk) => (chunk.match(/^ {6}\["/gm) || []).length);
  assert.deepEqual(sectionCounts(ru), sectionCounts(en));
  assert.match(ru, /BuildEx не является стороной какого-либо соглашения между клиентом и билдером/);
  assert.match(ru, /не связан с Mojang Studios или Microsoft/);
});
