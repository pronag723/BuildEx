"use client";

import { getSupabaseClient } from "../supabase/client";
import { rewriteUrlsDeep } from "../supabase/storageUrl";

const IMAGE_BUCKET = "ready_build_images";
const WORLD_BUCKET = "ready_build_worlds";
const PREVIEW_BUCKET = "ready_build_previews";
const MAX_WORLD_BYTES = 200 * 1024 * 1024;

function safeName(name, fallback) {
  return String(name || fallback).replace(/[\\/]/g, "_").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 80) || fallback;
}

export { MAX_WORLD_BYTES };

function normalizeListing(listing) {
  if (!listing) return null;
  const isStudio = Boolean(listing.studio_id || listing.studio);
  const studioSeller = listing.studio
    ? {
        ...listing.studio,
        username: listing.studio.slug,
        display_name: listing.studio.name,
        avatar_url: listing.studio.logo_url,
        provider_type: "studio",
      }
    : null;
  return {
    ...listing,
    seller_type: isStudio ? "studio" : "builder",
    seller: isStudio ? studioSeller : listing.builder,
    // Compatibility for existing cards/detail views while they migrate to seller.
    builder: isStudio ? studioSeller : listing.builder,
  };
}

function normalizeListings(rows) {
  return (rewriteUrlsDeep(rows || []) || []).map(normalizeListing);
}

export async function listReadyBuilds() {
  const supabase = getSupabaseClient();
  if (!supabase) return { listings: [], error: null };
  const { data, error } = await supabase.from("ready_builds").select("id,title,description,style,price_kopecks,created_at,builder_id,studio_id,minecraft_edition,minecraft_version,file_format,included_content,dependencies,license_version,media:ready_build_media(id,storage_path,url,alt,position),builder:profiles!ready_builds_builder_id_fkey(username,display_name,avatar_url,builder:builder_profiles(rank)),studio:studios!ready_builds_studio_id_fkey(id,name,slug,logo_url,status)").eq("is_active", true).order("created_at", { ascending: false });
  return { listings: normalizeListings(data), error: error || null };
}

export async function getReadyBuild(id) {
  const supabase = getSupabaseClient();
  if (!supabase || !id) return { listing: null, error: null };
  const { data, error } = await supabase.from("ready_builds").select("id,title,description,style,price_kopecks,is_active,created_at,builder_id,studio_id,current_version_id,minecraft_edition,minecraft_version,file_format,included_content,dependencies,license_version,media:ready_build_media(id,storage_path,url,alt,position),version:ready_build_versions!ready_builds_current_version_fk(id,world_file_name,world_size_bytes,preview_path,preview_meta),builder:profiles!ready_builds_builder_id_fkey(username,display_name,avatar_url,builder:builder_profiles(rank)),studio:studios!ready_builds_studio_id_fkey(id,name,slug,logo_url,status)").eq("id", id).maybeSingle();
  return { listing: normalizeListing(rewriteUrlsDeep(data)), error: error || null };
}

export async function listMyReadyBuilds(ownerType = "builder") {
  const supabase = getSupabaseClient();
  if (!supabase) return { listings: [], error: null };
  let query = supabase.from("ready_builds").select("id,title,description,style,price_kopecks,is_active,created_at,builder_id,studio_id,current_version_id,minecraft_edition,minecraft_version,file_format,included_content,dependencies,license_version,media:ready_build_media(id,storage_path,url,alt,position),version:ready_build_versions!ready_builds_current_version_fk(id,world_file_name,world_size_bytes,preview_path,preview_meta),purchases:ready_build_purchases(id,status,seller_earnings_kopecks),builder:profiles!ready_builds_builder_id_fkey(username,display_name,avatar_url,builder:builder_profiles(rank)),studio:studios!ready_builds_studio_id_fkey(id,name,slug,logo_url,status)");
  if (ownerType === "studio") {
    const { data: studio, error: studioError } = await supabase.rpc("get_my_managed_studio");
    if (studioError || !studio?.id) return { listings: [], error: studioError || new Error("Studio not found") };
    query = query.eq("studio_id", studio.id);
  } else {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) return { listings: [], error: new Error("Not authenticated") };
    query = query.eq("builder_id", auth.user.id);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  return { listings: normalizeListings(data), error: error || null };
}

export async function listMyReadyBuildPurchases() {
  const supabase = getSupabaseClient();
  if (!supabase) return { purchases: [], error: null };
  const { data, error } = await supabase.from("ready_build_purchases").select("id,title_snapshot,price_kopecks,status,paid_at,created_at,builder_id,studio_id,listing:ready_builds(id,style,media:ready_build_media(url,alt,position)),builder:profiles!ready_build_purchases_builder_id_fkey(username,display_name,avatar_url),studio:studios!ready_build_purchases_studio_id_fkey(id,name,slug,logo_url)").order("created_at", { ascending: false });
  return { purchases: rewriteUrlsDeep(data || []), error: error || null };
}

export async function createReadyBuild({ title, description, style, priceCents, ownerType = "builder" }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { listingId: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("create_ready_build", { p_title: title, p_description: description, p_style: style, p_price_kopecks: priceCents, p_owner_type: ownerType });
  return { listingId: data || null, error: error || null };
}

export async function saveReadyBuild({ id, title, description, style, priceCents, active, minecraftEdition, minecraftVersion, fileFormat, includedContent, dependencies }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error: disclosureError } = await supabase.rpc("set_ready_build_disclosures", { p_listing: id, p_edition: minecraftEdition, p_version: minecraftVersion, p_file_format: fileFormat, p_included_content: includedContent, p_dependencies: dependencies, p_license_version: "1.0" });
  if (disclosureError) return { error: disclosureError };
  const { error } = await supabase.rpc("update_ready_build", { p_listing: id, p_title: title, p_description: description, p_style: style, p_price_kopecks: priceCents, p_active: !!active });
  return { error: error || null };
}

export async function deleteReadyBuild(id) {
  const supabase = getSupabaseClient();
  if (!supabase || !id) return { error: new Error("Missing listing") };

  const { data, error: prepareError } = await supabase.rpc("prepare_ready_build_delete", { p_listing: id });
  if (prepareError) return { error: prepareError };
  const assets = Array.isArray(data) ? data[0] : data;
  const removals = [
    [IMAGE_BUCKET, assets?.image_paths || []],
    [WORLD_BUCKET, assets?.world_paths || []],
    [PREVIEW_BUCKET, assets?.preview_paths || []],
  ];
  for (const [bucket, paths] of removals) {
    if (!paths.length) continue;
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) return { error };
  }

  const { error } = await supabase.rpc("delete_ready_build", { p_listing: id });
  return { error: error || null };
}

export async function uploadReadyBuildImage(listingId, file, position) {
  const supabase = getSupabaseClient();
  if (!supabase || !listingId || !file) return { error: new Error("Missing image or listing") };
  const path = `${listingId}/${Date.now()}-${safeName(file.name, "image.jpg")}`;
  const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { cacheControl: "3600", contentType: file.type || "image/jpeg" });
  if (uploadError) return { error: uploadError };
  const { data: urlData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  const { data, error } = await supabase.rpc("attach_ready_build_media", {
    p_listing: listingId,
    p_storage_path: path,
    p_url: urlData.publicUrl,
    p_alt: file.name,
    p_position: position,
  });
  return { id: data || null, error: error || null };
}

export async function deleteReadyBuildImage(listingId, image) {
  const supabase = getSupabaseClient();
  if (!supabase || !listingId || !image?.id || !image?.storage_path) {
    return { error: new Error("Missing image details") };
  }
  const { error: storageError } = await supabase.storage.from(IMAGE_BUCKET).remove([image.storage_path]);
  if (storageError) return { error: storageError };
  const { error } = await supabase.from("ready_build_media").delete().eq("id", image.id).eq("listing_id", listingId);
  return { error: error || null };
}

export async function reorderReadyBuildImages(listingId, mediaIds) {
  const supabase = getSupabaseClient();
  if (!supabase || !listingId) return { error: new Error("Missing listing") };
  const { error } = await supabase.rpc("reorder_ready_build_media", {
    p_listing: listingId,
    p_media_ids: mediaIds,
  });
  return { error: error || null };
}

export async function uploadReadyBuildVersion(listingId, worldFile, previewBytes, previewMeta) {
  const supabase = getSupabaseClient();
  if (!supabase || !listingId || !worldFile || !previewBytes) return { error: new Error("World file and 3D preview are required") };
  if (worldFile.size > MAX_WORLD_BYTES) return { error: new Error("World file is larger than 200 MB") };
  const stamp = Date.now();
  const worldPath = `${listingId}/${stamp}-${safeName(worldFile.name, "world.zip")}`;
  const previewPath = `${listingId}/${stamp}-preview.bxv`;
  const { error: previewError } = await supabase.storage.from(PREVIEW_BUCKET).upload(previewPath, previewBytes, { contentType: "application/gzip" });
  if (previewError) return { error: previewError };
  const { error: worldError } = await supabase.storage.from(WORLD_BUCKET).upload(worldPath, worldFile, { contentType: worldFile.type || "application/zip" });
  if (worldError) return { error: worldError };
  const { error } = await supabase.rpc("attach_ready_build_version", { p_listing: listingId, p_world_path: worldPath, p_file_name: worldFile.name, p_size: worldFile.size, p_preview_path: previewPath, p_preview_meta: previewMeta || {} });
  return { error: error || null };
}

export async function getReadyBuildPreviewUrl(path, expiresInSec = 300) {
  const supabase = getSupabaseClient();
  if (!supabase || !path) return { url: null, error: null };
  const { data, error } = await supabase.storage.from(PREVIEW_BUCKET).createSignedUrl(path, expiresInSec);
  return { url: data?.signedUrl || null, error: error || null };
}

export async function createReadyBuildPurchase(listingId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { purchaseId: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("create_ready_build_purchase", { p_listing: listingId });
  return { purchaseId: data || null, error: error || null };
}

export async function createReadyBuildInvoice(purchaseId, payCurrency) {
  const supabase = getSupabaseClient();
  if (!supabase) return { checkoutUrl: null, error: new Error("Supabase not configured") };
  const returnUrl = typeof window !== "undefined" ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}/orders/` : undefined;
  const { data, error } = await supabase.functions.invoke("create-invoice", { body: { readyBuildPurchaseId: purchaseId, returnUrl, payCurrency } });
  return { checkoutUrl: data?.checkoutUrl || null, error: error || (!data?.checkoutUrl ? new Error("No checkout URL returned") : null) };
}

export async function getReadyBuildDownloadUrl(purchaseId, expiresInSec = 300) {
  const supabase = getSupabaseClient();
  if (!supabase) return { url: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_ready_build_download", { p_purchase: purchaseId });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.storage_path) return { url: null, error: error || new Error("This download is not available yet") };
  const { data: urlData, error: urlError } = await supabase.storage.from(WORLD_BUCKET).createSignedUrl(row.storage_path, expiresInSec, { download: row.file_name });
  return { url: urlData?.signedUrl || null, error: urlError || null };
}
