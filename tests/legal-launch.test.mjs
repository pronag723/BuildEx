import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/0089_legal_launch_controls.sql");
const invoice = read("supabase/functions/create-invoice/index.ts");
const readyCheckout = read("app/build/checkout/components/ReadyBuildCheckoutPage.jsx");
const customCheckout = read("app/order/components/OrderPlacementPage.jsx");
const auth = read("app/auth/components/AuthCard.jsx");
const legalDocs = read("app/legal/documents.js");
const admin = read("app/admin/components/AdminPage.jsx");

test("legal center covers every launch document and the Minecraft disclaimer", () => {
  for (const title of ["Terms of Use", "Payment, Final-Sale and Dispute Policy", "Builder and Studio Terms", "Ready-Made Build License", "Privacy and Storage Policy", "Community and Copyright Policy", "Legal Notice"]) assert.match(legalDocs, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(legalDocs, /not affiliated with, endorsed by, sponsored by, or approved by Mojang Studios or Microsoft/);
});

test("account and both checkout types require active versioned consent", () => {
  assert.match(auth, /type="checkbox"/);
  assert.match(auth, /stageAccountAcceptance/);
  assert.match(readyCheckout, /acceptedFinalSale/);
  assert.match(readyCheckout, /immediateDelivery: true/);
  assert.match(customCheckout, /acceptedOrderTerms/);
  assert.match(customCheckout, /subjectType: "custom_order"/);
  assert.match(invoice, /legal_checkout_acceptances/);
  assert.ok(invoice.indexOf('from("legal_checkout_acceptances")') < invoice.indexOf("invoice = await createInvoice"), "consent must be checked before contacting the payment provider");
});

test("database enforces disclosures, seven-day appeals, and confirmed refunds", () => {
  assert.match(migration, /set_ready_build_disclosures/);
  assert.match(migration, /minecraft_edition/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /refund_records_provider_reference_idx/);
  assert.match(migration, /status in \('confirmed','failed'\)/);
  assert.match(migration, /No confirmed paid transaction exists/);
  assert.match(admin, /Record completed refund/);
  assert.match(admin, /!refundReference\.trim\(\)/);
});
