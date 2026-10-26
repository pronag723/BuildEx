"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Work and price-list editing
// The builder's own writes: works, their photos and co-authors, price tiers.
// RLS limits every write to the caller's own rows (0106); the multi-row
// changes — orders, the mosaic layout, a whole co-author list — go through
// the RPCs in 0109/0110 so they land together or not at all.
//
// Photos are portfolio_images rows with work_id set. Files go to the
// portfolios bucket at the flat <uid>/<file> path the account-deletion purge
// expects, through the same compress-then-upload helper as the avatar.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteStorageUrl } from "../supabase/storageUrl";
import { BUCKETS } from "../onboarding/constants";
import { uploadPortfolioImage } from "../onboarding/api";
import { mapPriceTier, mapWork, orderWorks, withLayoutFallback, workColumns } from "./api";

const notConfigured = () => ({ message: "Supabase not configured" });

const workEditSelect = (withLayout) =>
  `${workColumns(withLayout)}, removed_at, ` +
  "photos:portfolio_images!portfolio_images_work_id_fkey(id, url, position, alt, storage_path), " +
  "coauthors:work_coauthors!work_coauthors_work_id_fkey(id, name, role, position, " +
  "coauthor:profiles!work_coauthors_coauthor_id_fkey(id, username, display_name, avatar_url))";

function mapEditableWork(row) {
  const work = mapWork(row);
  work.removed = Boolean(row.removed_at);
  // storage_path is kept beside each photo so a removed photo's file can be
  // deleted too.
  const paths = new Map((row.photos || []).map((p) => [p.id, p.storage_path]));
  work.photos = work.photos.map((p) => ({ ...p, storagePath: paths.get(p.id) || null }));
  return work;
}

// Every work the builder owns — untitled, photo-less and taken-down ones too.
export async function fetchMyWorks(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { works: [], error: null };
  const { data, error } = await withLayoutFallback((withLayout) =>
    orderWorks(supabase.from("works").select(workEditSelect(withLayout)).eq("builder_id", userId), withLayout)
  );
  if (error) return { works: [], error };
  return { works: (data || []).map(mapEditableWork), error: null };
}

const workRow = (fields) => ({
  title: fields.title?.trim() || null,
  description: fields.description?.trim() || null,
  mc_version: fields.version?.trim() || null,
  size_label: fields.size?.trim() || null,
  duration_days: fields.durationDays ? Number(fields.durationDays) : null,
  price_tier_id: fields.priceTierId || null,
});

export async function createWork(userId, fields, position) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { id: null, error: notConfigured() };
  const { data, error } = await supabase
    .from("works")
    .insert({ builder_id: userId, position: position ?? 0, ...workRow(fields) })
    .select("id")
    .single();
  return { id: data?.id || null, error: error || null };
}

export async function updateWork(workId, fields) {
  const supabase = getSupabaseClient();
  if (!supabase || !workId) return { error: notConfigured() };
  const { error } = await supabase.from("works").update(workRow(fields)).eq("id", workId);
  return { error: error || null };
}

// Files first (Storage keeps no link to the row, so they would be orphaned
// and stay public), then the row — which cascades to photos and credits.
export async function deleteWork(work) {
  const supabase = getSupabaseClient();
  if (!supabase || !work?.id) return { error: notConfigured() };
  const paths = (work.photos || []).map((p) => p.storagePath).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKETS.portfolios).remove(paths);
  const { error } = await supabase.from("works").delete().eq("id", work.id);
  return { error: error || null };
}

export async function addWorkPhoto(userId, workId, file, position, onProgress) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || !workId) return { photo: null, error: notConfigured() };
  const { url, path, error: uploadError } = await uploadPortfolioImage(supabase, userId, file, onProgress);
  if (uploadError || !url) return { photo: null, error: uploadError || { message: "Image upload failed" } };
  const { data, error } = await supabase
    .from("portfolio_images")
    .insert({
      builder_id: userId,
      work_id: workId,
      url,
      storage_path: path,
      position,
      alt: file.name.replace(/\.[a-z0-9]+$/i, ""),
    })
    .select("id, url, position")
    .single();
  if (error) {
    // The row was refused (e.g. the 10-photo cap): take the file back down.
    await supabase.storage.from(BUCKETS.portfolios).remove([path]);
    return { photo: null, error };
  }
  return { photo: { id: data.id, url: rewriteStorageUrl(data.url), storagePath: path }, error: null };
}

export async function removeWorkPhoto(photo) {
  const supabase = getSupabaseClient();
  if (!supabase || !photo?.id) return { error: notConfigured() };
  if (photo.storagePath) await supabase.storage.from(BUCKETS.portfolios).remove([photo.storagePath]);
  const { error } = await supabase.from("portfolio_images").delete().eq("id", photo.id);
  return { error: error || null };
}

async function rpc(name, args) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: notConfigured() };
  const { error } = await supabase.rpc(name, args);
  return { error: error || null };
}

export const reorderWorks = (ids) => rpc("reorder_my_works", { p_ids: ids });
export const reorderWorkPhotos = (workId, ids) => rpc("reorder_work_photos", { p_work: workId, p_ids: ids });

// The mosaic's order and sizes in one call (0110). Until that migration has
// run the function doesn't exist (PGRST202): the order still saves through
// reorder_my_works, and `sizesSaved: false` tells the caller the sizes didn't.
export async function saveWorksLayout(ids, sizes) {
  const { error } = await rpc("save_my_works_layout", { p_ids: ids, p_sizes: sizes });
  if (error?.code !== "PGRST202") return { error, sizesSaved: !error };
  const { error: orderError } = await reorderWorks(ids);
  return { error: orderError, sizesSaved: false };
}
export const reorderPriceTiers = (ids) => rpc("reorder_my_price_tiers", { p_ids: ids });

// items: [{ coauthorId?, name?, role? }] in display order.
export const saveWorkCoauthors = (workId, items) =>
  rpc("save_work_coauthors", {
    p_work: workId,
    p_items: items.map((c) => ({
      coauthor_id: c.coauthorId || null,
      name: c.coauthorId ? null : c.name?.trim() || null,
      role: c.role?.trim() || null,
    })),
  });

// Builders to credit, by @handle or name. Visible builders only — the 0101
// policy already hides hidden ones, and the inner join drops non-builders.
export async function searchBuilders(query, excludeId) {
  const supabase = getSupabaseClient();
  const term = String(query || "").trim().replace(/^@/, "").replace(/[,()%_\\]/g, "");
  if (!supabase || term.length < 2) return { builders: [], error: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, builder:builder_profiles!builder_profiles_id_fkey!inner(id)")
    .not("onboarding_completed_at", "is", null)
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(8);
  if (error) return { builders: [], error };
  return {
    builders: (data || [])
      .filter((p) => p.id !== excludeId && p.username)
      .map((p) => ({
        id: p.id,
        username: p.username,
        displayName: p.display_name || p.username,
        avatarUrl: rewriteStorageUrl(p.avatar_url) || null,
      })),
    error: null,
  };
}

// Works other builders credited the caller on, for "Tagged in".
export async function fetchTaggedWorks(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { works: [], error: null };
  const { data, error } = await supabase
    .from("work_coauthors")
    .select(
      "id, role, work:works!work_coauthors_work_id_fkey(id, title, " +
        "builder:profiles!works_builder_id_fkey(username, display_name))"
    )
    .eq("coauthor_id", userId);
  if (error) return { works: [], error };
  return {
    works: (data || [])
      .filter((row) => row.work)
      .map((row) => ({
        id: row.work.id,
        title: row.work.title,
        role: row.role || null,
        builder: row.work.builder
          ? { username: row.work.builder.username, displayName: row.work.builder.display_name || row.work.builder.username }
          : null,
      })),
    error: null,
  };
}

export const removeMeFromWork = (workId) => rpc("remove_me_from_work", { p_work: workId });

// ─── Price tiers ────────────────────────────────────────────────────────────
const tierRow = (fields) => ({
  name: fields.name.trim(),
  description: fields.description?.trim() || null,
  days_min: fields.daysMin ? Number(fields.daysMin) : null,
  days_max: fields.daysMax ? Number(fields.daysMax) : null,
  price_from_cents: Math.round(Number(fields.priceFrom) * 100),
});

export async function createPriceTier(userId, fields, position) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { tier: null, error: notConfigured() };
  const { data, error } = await supabase
    .from("builder_price_tiers")
    .insert({ builder_id: userId, position: position ?? 0, ...tierRow(fields) })
    .select("id, builder_id, name, description, days_min, days_max, price_from_cents, position")
    .single();
  return { tier: data ? mapPriceTier(data) : null, error: error || null };
}

export async function updatePriceTier(tierId, fields) {
  const supabase = getSupabaseClient();
  if (!supabase || !tierId) return { error: notConfigured() };
  const { error } = await supabase.from("builder_price_tiers").update(tierRow(fields)).eq("id", tierId);
  return { error: error || null };
}

export async function deletePriceTier(tierId) {
  const supabase = getSupabaseClient();
  if (!supabase || !tierId) return { error: notConfigured() };
  const { error } = await supabase.from("builder_price_tiers").delete().eq("id", tierId);
  return { error: error || null };
}
