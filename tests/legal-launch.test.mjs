import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// BuildEx is a directory. These tests guard the three ways that fact could
// quietly stop being true in the product: a legal document that promises more
// than the site does, a landing page that advertises a service that no longer
// exists, and a sign-in that records consent to neither.

const read = (path) => readFileSync(path, "utf8");
const auth = read("app/auth/components/AuthCard.jsx");
const legalDocs = read("app/legal/documents.js");
const legalApi = read("lib/legal/api.js");

// These tests read source files, but what matters is the COPY — the words a
// visitor sees. Comments explaining why a claim was removed are allowed to name
// the claim, so they are stripped before matching.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const HOME_COPY = [
  "app/home/data.js",
  "app/home/components/HeroSection.jsx",
  "app/home/components/HowItWorksSection.jsx",
  "app/home/components/FeaturesDeckSection.jsx",
  "app/home/components/WhyBuildExSection.jsx",
  "app/home/components/ProjectsSection.jsx",
  "app/home/components/SiteFooter.jsx"
].map((path) => [path, stripComments(read(path))]);

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the legal center covers the four documents the site still has", () => {
  for (const title of [
    "Terms of Use",
    "Privacy and Storage Policy",
    "Community and Copyright Policy",
    "Legal & Contact Notice"
  ]) {
    assert.match(legalDocs, new RegExp(escapeForRegExp(title)));
  }
  assert.match(legalDocs, /not affiliated with, endorsed by, sponsored by, or approved by Mojang Studios or Microsoft/);
});

// The withdrawn documents described a payment layer that no longer exists.
// Publishing them again would be a promise the code cannot keep.
test("the withdrawn payment, seller and licence documents are gone", () => {
  for (const title of [
    "Payment, Final-Sale and Dispute Policy",
    "Builder and Studio Terms",
    "Ready-Made Build License"
  ]) {
    assert.doesNotMatch(legalDocs, new RegExp(escapeForRegExp(title)));
  }
  // The terms may (and do) say BuildEx does NOT escrow money. What must never
  // come back is the promise that it does.
  assert.doesNotMatch(legalDocs, /funds are protected|protected until completion|escrow service|final sale/i);
  assert.doesNotMatch(legalApi, /recordCheckoutAcceptance|record_checkout_acceptance/);
});

test("the terms say what BuildEx is, and what it is not responsible for", () => {
  assert.match(legalDocs, /BuildEx is a directory/);
  assert.match(legalDocs, /BuildEx is not a party to any agreement between a client and a builder/);
  assert.match(legalDocs, /does not process, hold, escrow, transfer, release, or refund money/);
  assert.match(legalDocs, /does not verify a builder's identity/);
  assert.match(legalDocs, /does not mediate, arbitrate, investigate or decide disputes/);
});

// Someone must be able to read, on the landing page itself, that the deal is
// not with us — not only by clicking through to the terms.
test("the landing page states that deals and payments are direct", () => {
  const data = HOME_COPY.find(([path]) => path === "app/home/data.js")[1];
  assert.match(data, /All arrangements and payments happen directly between the client and the builder/);

  const hero = HOME_COPY.find(([path]) => path.endsWith("HeroSection.jsx"))[1];
  const steps = HOME_COPY.find(([path]) => path.endsWith("HowItWorksSection.jsx"))[1];
  for (const source of [hero, steps]) {
    assert.match(source, /DIRECTORY_DISCLAIMER/);
  }
});

test("the landing page makes no payment, protection or vetting claim", () => {
  // Phrases that can only ever be a claim. "escrow" is deliberately absent:
  // the page uses the word once, to say BuildEx does not do it, and the
  // required denials in the next test are what guard that side.
  const forbidden = [
    /protected payments?/i,
    /payment protection/i,
    /secure(?:ly)? pay/i,
    /pay nothing extra/i,
    /commission/i,
    /\bfees?\b/i,
    /\bbids?\b/i,
    /verified (?:review|builder|order)/i,
    /we (?:vet|verify|screen|check) /i,
    /guaranteed/i,
    /we guarantee/i,
    /\$\d/
  ];
  for (const [path, source] of HOME_COPY) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path} must not claim ${pattern}`);
    }
  }
});

test("the landing page denies the things BuildEx does not do", () => {
  const all = HOME_COPY.map(([, source]) => source).join("\n");
  assert.match(all, /BuildEx is not involved in them/);
  assert.match(all, /does not hold or handle money/);
  assert.match(all, /does not vet, verify or guarantee anyone/);
});

// Sign-in is one click, so the active "tick to continue" gate is gone. The
// consent itself is not: the notice sits directly under the buttons, links both
// policies, and stageAccountAcceptance still records the versions the user
// accepted, which flushes to record_legal_acceptance once they are signed in.
test("account creation records versioned consent shown at the point of sign-in", () => {
  assert.doesNotMatch(auth, /type="checkbox"/);
  assert.match(auth, /By continuing you confirm you are at least 13/);
  assert.match(auth, /\/legal\/terms\//);
  assert.match(auth, /\/legal\/privacy\//);
  assert.match(auth, /stageAccountAcceptance/);
  assert.match(legalApi, /record_legal_acceptance/);
});
