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
const deletionRecovery = readFileSync("supabase/migrations/0086_restore_ready_build_delete_rpcs.sql", "utf8");
const publicPreviewReads = readFileSync("supabase/migrations/0087_public_ready_build_preview_reads.sql", "utf8");
const favoritesMigration = readFileSync("supabase/migrations/0088_ready_build_favorites.sql", "utf8");
const invoice = readFileSync("supabase/functions/create-invoice/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/payment-webhook/index.ts", "utf8");
const readyBuildApi = readFileSync("lib/readyBuilds/api.js", "utf8");
const readyBuildCard = readFileSync("app/builders/components/ReadyBuildCard.jsx", "utf8");
const readyBuildDetail = readFileSync("app/build/components/ReadyBuildDetailPage.jsx", "utf8");
const readyBuildCheckout = readFileSync("app/build/checkout/components/ReadyBuildCheckoutPage.jsx", "utf8");
const readyBuildEditor = readFileSync("app/account/ReadyBuildsSection.jsx", "utf8");
const catalogPage = readFileSync("app/builders/components/CatalogPage.jsx", "utf8");
const worldPreview = readFileSync("app/orders/components/WorldPreview.jsx", "utf8");
const smartText = readFileSync("lib/ui/SmartText.jsx", "utf8");
const favoritesApi = readFileSync("lib/favorites/api.js", "utf8");

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

test("ready-build deletion recovery recreates both RPCs and reloads the schema", () => {
  assert.match(deletionRecovery, /function public\.prepare_ready_build_delete/);
  assert.match(deletionRecovery, /function public\.delete_ready_build/);
  assert.match(deletionRecovery, /grant execute on function public\.prepare_ready_build_delete\(uuid\) to authenticated/);
  assert.match(deletionRecovery, /notify pgrst, 'reload schema'/);
});

test("active ready-build previews are readable by owners, other accounts, and guests", () => {
  assert.match(publicPreviewReads, /can_read_active_ready_build_preview/);
  assert.match(publicPreviewReads, /l\.is_active = true/);
  assert.match(publicPreviewReads, /bucket_id = 'ready_build_previews'/);
  assert.match(publicPreviewReads, /for select to anon, authenticated/);
  assert.doesNotMatch(publicPreviewReads, /ready_build_worlds/);
});

test("ready-build detail returns to the URL-selected feed and frames visible voxels", () => {
  assert.match(catalogPage, /setParams\(readParamsFromLocation\(\)\)/);
  assert.match(worldPreview, /getVisibleVoxelFrame/);
  assert.match(worldPreview, /0\.01/);
  assert.match(worldPreview, /0\.99/);
  assert.doesNotMatch(readyBuildDetail, /build-media-switch-indicator/);
});

test("long pasted links render with compact labels", () => {
  assert.match(smartText, /compactUrlLabel/);
  assert.match(smartText, /BuildEx ready-made build/);
  assert.match(smartText, /noopener noreferrer/);
});

test("ready-build cards surface creator rank and keep price in the footer", () => {
  assert.match(readyBuildCard, /builderName/);
  assert.match(readyBuildCard, /rank\.label/);
  assert.match(readyBuildCard, /formatPrice\(listing\.price_kopecks\)/);
  assert.doesNotMatch(readyBuildCard, /3D preview included/);
});

test("signed-in users can favorite individual ready-made builds", () => {
  assert.match(favoritesMigration, /ready_build_id uuid/);
  assert.match(favoritesMigration, /favorites_user_ready_build_unique/);
  assert.match(favoritesApi, /`ready_build:\$\{row\.ready_build_id\}`/);
  assert.match(readyBuildCard, /isFavorite\(listing\.id, "ready_build"\)/);
  assert.match(readyBuildCard, /toggleFavorite\(listing\.id, "ready_build"\)/);
  assert.match(readyBuildCard, /aria-pressed=\{favorited\}/);
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
  assert.doesNotMatch(readyBuildDetail, />Included<|>Dependencies</);
});

test("ready-build checkout owns payment selection and purchase creation", () => {
  assert.match(readyBuildCheckout, /Choose a currency/);
  assert.match(readyBuildCheckout, /liveMinimumUsd/);
  assert.match(readyBuildCheckout, /CoinLogo/);
  assert.match(readyBuildCheckout, /getPaymentOptions/);
  assert.match(readyBuildCheckout, /createReadyBuildPurchase/);
  assert.match(readyBuildCheckout, /createReadyBuildInvoice/);
  assert.match(readyBuildCheckout, /Complete your purchase/);
});

test("saving ready-build compatibility publishes drafts to the marketplace feed", () => {
  const editorSave = readyBuildEditor.match(/const save = async[\s\S]*?const previewSource/)?.[0] || "";
  assert.match(editorSave, /active: true/);
  assert.doesNotMatch(editorSave, /active: isEditing \? listing\.is_active : true/);
  assert.match(readyBuildEditor, /Save & publish/);
  assert.match(readyBuildEditor, /MINECRAFT_EDITIONS/);
  assert.doesNotMatch(readyBuildEditor, /<select required value=\{form\.minecraftEdition\}/);
});
