import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0075_ready_builds_marketplace.sql", "utf8");
const rlsFix = readFileSync("supabase/migrations/0078_fix_ready_build_purchase_rls.sql", "utf8");
const mediaFix = readFileSync("supabase/migrations/0079_ready_build_media_rpc.sql", "utf8");
const reorderFix = readFileSync("supabase/migrations/0080_ready_build_media_reorder_rpc.sql", "utf8");
const ownerReadFix = readFileSync("supabase/migrations/0083_ready_build_owner_asset_reads.sql", "utf8");
const zipValidationFix = readFileSync("supabase/migrations/0084_fix_ready_build_zip_validation.sql", "utf8");
const deletion = readFileSync("supabase/migrations/0085_delete_ready_builds.sql", "utf8");
const invoice = readFileSync("supabase/functions/create-invoice/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/payment-webhook/index.ts", "utf8");
const readyBuildApi = readFileSync("lib/readyBuilds/api.js", "utf8");
const readyBuildCard = readFileSync("app/builders/components/ReadyBuildCard.jsx", "utf8");
const readyBuildDetail = readFileSync("app/build/components/ReadyBuildDetailPage.jsx", "utf8");
const readyBuildCheckout = readFileSync("app/build/checkout/components/ReadyBuildCheckoutPage.jsx", "utf8");

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

test("ready-build image reordering is owner-checked outside browser RLS", () => {
  assert.match(reorderFix, /function public\.reorder_ready_build_media/);
  assert.match(reorderFix, /set row_security = off/);
  assert.match(reorderFix, /builder_id = auth\.uid\(\)/);
  assert.match(reorderFix, /with ordinality/);
  assert.match(reorderFix, /grant execute on function public\.reorder_ready_build_media\(uuid, uuid\[\]\) to authenticated/);
});

test("ready-build version uploads use insert-only storage writes", () => {
  const uploadVersion = readyBuildApi.match(/export async function uploadReadyBuildVersion[\s\S]*?\n}/)?.[0] || "";
  assert.match(uploadVersion, /from\(PREVIEW_BUCKET\)\.upload/);
  assert.match(uploadVersion, /from\(WORLD_BUCKET\)\.upload/);
  assert.doesNotMatch(uploadVersion, /upsert:\s*true/);
});

test("builders can read their own ready-build storage objects", () => {
  assert.match(ownerReadFix, /for select to authenticated/);
  assert.match(ownerReadFix, /public\.can_manage_ready_build/);
});

test("ready-build ZIP validation avoids escaped regular expressions", () => {
  assert.match(zipValidationFix, /lower\(right\(btrim\(p_file_name\), 4\)\) <> '\.zip'/);
  assert.doesNotMatch(zipValidationFix, /p_file_name !~\*/);
});

test("only owners can delete unsold ready builds and stored assets are removed first", () => {
  assert.match(deletion, /builder_id = auth\.uid\(\)/);
  assert.match(deletion, /Builds with purchase history cannot be deleted/);
  assert.match(deletion, /set is_active = false/);
  assert.match(deletion, /grant execute on function public\.delete_ready_build\(uuid\) to authenticated/);
  const deleteApi = readyBuildApi.match(/export async function deleteReadyBuild[\s\S]*?\n}/)?.[0] || "";
  assert.match(deleteApi, /prepare_ready_build_delete/);
  assert.match(deleteApi, /storage\.from\(bucket\)\.remove\(paths\)/);
  assert.match(deleteApi, /rpc\("delete_ready_build"/);
});

test("ready-build cards surface creator rank and keep price in the footer", () => {
  assert.match(readyBuildCard, /builderName/);
  assert.match(readyBuildCard, /rank\.label/);
  assert.match(readyBuildCard, /formatPrice\(listing\.price_kopecks\)/);
  assert.doesNotMatch(readyBuildCard, /3D preview included/);
});

test("ready-build detail reveals the complete profile-style layout", () => {
  assert.match(readyBuildDetail, /IntersectionObserver/);
  assert.match(readyBuildDetail, /Build gallery/);
  assert.match(readyBuildDetail, /About this build/);
  assert.match(readyBuildDetail, /View builder profile/);
  assert.match(readyBuildDetail, /Message builder/);
  assert.match(readyBuildDetail, /build\/checkout/);
  assert.match(readyBuildDetail, /createPortal/);
  assert.match(readyBuildDetail, /useGradientBackground/);
  assert.doesNotMatch(readyBuildDetail, /getPaymentOptions/);
});

test("ready-build checkout owns payment selection and purchase creation", () => {
  assert.match(readyBuildCheckout, /Choose a network/);
  assert.match(readyBuildCheckout, /getPaymentOptions/);
  assert.match(readyBuildCheckout, /createReadyBuildPurchase/);
  assert.match(readyBuildCheckout, /createReadyBuildInvoice/);
  assert.match(readyBuildCheckout, /Complete your purchase/);
});
