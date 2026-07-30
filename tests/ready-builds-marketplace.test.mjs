import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0075_ready_builds_marketplace.sql", "utf8");
const invoice = readFileSync("supabase/functions/create-invoice/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/payment-webhook/index.ts", "utf8");

test("ready-build purchases snapshot a version and only paid buyers can download", () => {
  assert.match(migration, /version_id uuid not null/);
  assert.match(migration, /world_path_snapshot text not null/);
  assert.match(migration, /buyer_id=auth\.uid\(\) and status='paid'/);
});

test("ready-build payment callbacks are namespaced and amount-checked", () => {
  assert.match(invoice, /readyBuildPurchaseId/);
  assert.match(invoice, /rb:\$\{order\.id\}/);
  assert.match(webhook, /startsWith\("rb:"\)/);
  assert.match(migration, /p_amount <> v\.price_kopecks/);
});

test("studios are rejected from ready-build publishing in the database", () => {
  assert.match(migration, /Only independent builders can publish ready-made builds/);
  assert.match(migration, /coalesce\(b\.profile_type, 'independent'\) = 'independent'/);
});
