import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0075_ready_builds_marketplace.sql", "utf8");
const rlsFix = readFileSync("supabase/migrations/0078_fix_ready_build_purchase_rls.sql", "utf8");
const mediaFix = readFileSync("supabase/migrations/0079_ready_build_media_rpc.sql", "utf8");
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

test("ready-build purchase creation bypasses RLS only inside the guarded RPC", () => {
  assert.match(rlsFix, /security definer/);
  assert.match(rlsFix, /set row_security = off/);
  assert.match(rlsFix, /auth\.uid\(\) = v_listing\.builder_id/);
  assert.match(rlsFix, /grant execute on function public\.create_ready_build_purchase\(uuid\) to authenticated/);
});

test("ready-build image metadata is written through an owner-checked RPC", () => {
  assert.match(mediaFix, /function public\.attach_ready_build_media/);
  assert.match(mediaFix, /set row_security = off/);
  assert.match(mediaFix, /builder_id = auth\.uid\(\)/);
  assert.match(mediaFix, /p_storage_path !~ \('\^' \|\| p_listing::text/);
  assert.match(mediaFix, /grant execute on function public\.attach_ready_build_media\(uuid, text, text, text, int\) to authenticated/);
});
