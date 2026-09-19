import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The checkout-consent and refund assertions were removed with the payment
// layer (the files they read no longer exist). What remains is the legal
// centre's own coverage and the account-level acceptance gate on sign-in.
// Stage 8 rewrites the legal documents and this file with them.

const read = (path) => readFileSync(path, "utf8");
const auth = read("app/auth/components/AuthCard.jsx");
const legalDocs = read("app/legal/documents.js");

test("legal center covers every launch document and the Minecraft disclaimer", () => {
  for (const title of ["Terms of Use", "Payment, Final-Sale and Dispute Policy", "Builder and Studio Terms", "Ready-Made Build License", "Privacy and Storage Policy", "Community and Copyright Policy", "Legal Notice"]) assert.match(legalDocs, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(legalDocs, /not affiliated with, endorsed by, sponsored by, or approved by Mojang Studios or Microsoft/);
});

test("account creation requires active versioned consent", () => {
  assert.match(auth, /type="checkbox"/);
  assert.match(auth, /stageAccountAcceptance/);
});
