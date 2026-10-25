"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Works read layer
// A work is one build on a builder's profile: several photos, a title, a
// description, co-authors and the price tier it was made under (migration
// 0106_builder_works.sql). This file only reads; RLS decides what each caller
// may see — a hidden builder's works and moderator-removed works are withheld
// from everyone but their builder and admins, so nothing here filters for that.
//
// Every embed names its foreign key. portfolio_images and work_coauthors each
// reference both works and profiles, which gives PostgREST more than one way
// to join those tables; an unnamed embed is how 0101 emptied the feed
// (300 / PGRST201).
//
// Like lib/favorites/api.js, every function resolves to an empty result instead
// of throwing when Supabase is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteStorageUrl } from "../supabase/storageUrl";

// The profile grid shows the featured work plus this many per "Show more".
export const WORKS_PAGE_SIZE = 12;

const WORK_COLUMNS =
  "id, builder_id, title, description, mc_version, size_label, duration_days, " +
  "price_tier_id, position, is_pinned, likes_count, views_count, created_at";

const COAUTHORS_EMBED =
  "coauthors:work_coauthors!work_coauthors_work_id_fkey(id, name, role, position, " +
  "coauthor:profiles!work_coauthors_coauthor_id_fkey(id, username, display_name, avatar_url))";

// `!inner` on photos drops works that have no photo yet, so a page of results
// is always a page of things the grid can show and "Show more" counts line up.
const photosEmbed = (inner) =>
  `photos:portfolio_images!portfolio_images_work_id_fkey${inner ? "!inner" : ""}(id, url, position, alt)`;

const workSelect = ({ withEmpty = false } = {}) =>
  `${WORK_COLUMNS}, ${photosEmbed(!withEmpty)}, ${COAUTHORS_EMBED}`;

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

export function mapWork(row) {
  if (!row) return null;
  return {
    id: row.id,
    builderId: row.builder_id,
    title: row.title || null,
    description: row.description || null,
    version: row.mc_version || null,
    size: row.size_label || null,
    durationDays: row.duration_days ?? null,
    priceTierId: row.price_tier_id || null,
    position: row.position ?? 0,
    pinned: !!row.is_pinned,
    likes: row.likes_count ?? 0,
    views: row.views_count ?? 0,
    createdAt: row.created_at || null,
    photos: (row.photos || [])
      .slice()
      .sort(byPosition)
      .map((p) => ({ id: p.id, url: rewriteStorageUrl(p.url), alt: p.alt || null })),
    coauthors: (row.coauthors || [])
      .slice()
      .sort(byPosition)
      .map((c) => ({
        id: c.id,
        name: c.name || null,
        role: c.role || null,
        // Null when the credit is free text, or when the credited builder's
        // profile is not visible to this caller.
        profile: c.coauthor
          ? {
              id: c.coauthor.id,
              username: c.coauthor.username,
              displayName: c.coauthor.display_name || c.coauthor.username,
              avatarUrl: rewriteStorageUrl(c.coauthor.avatar_url) || null,
            }
          : null,
      })),
  };
}

export function mapPriceTier(row) {
  if (!row) return null;
  return {
    id: row.id,
    builderId: row.builder_id,
    name: row.name,
    description: row.description || null,
    daysMin: row.days_min ?? null,
    daysMax: row.days_max ?? null,
    priceFromCents: row.price_from_cents,
    position: row.position ?? 0,
  };
}

// One page of a builder's works: the pinned one first, then the builder's own
// order. `from`/`to` are inclusive row offsets (PostgREST range), so the
// default first page is the featured work plus WORKS_PAGE_SIZE more.
export async function fetchWorks(builderId, { from = 0, to = WORKS_PAGE_SIZE, withEmpty = false } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { works: [], error: null };

  const { data, error } = await supabase
    .from("works")
    .select(workSelect({ withEmpty }))
    .eq("builder_id", builderId)
    .order("is_pinned", { ascending: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error) return { works: [], error };
  return { works: (data || []).map(mapWork), error: null };
}

// How many works the grid can show (works with at least one photo).
export async function fetchWorksCount(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { count: 0, error: null };

  const { count, error } = await supabase
    .from("works")
    .select(`id, ${photosEmbed(true)}`, { count: "exact", head: true })
    .eq("builder_id", builderId);

  return { count: count ?? 0, error: error || null };
}

export async function fetchWork(workId) {
  const supabase = getSupabaseClient();
  if (!supabase || !workId) return { work: null, error: null };

  const { data, error } = await supabase
    .from("works")
    .select(workSelect({ withEmpty: true }))
    .eq("id", workId)
    .maybeSingle();

  if (error) return { work: null, error };
  return { work: mapWork(data), error: null };
}

export async function fetchPriceTiers(builderId) {
  const supabase = getSupabaseClient();
  if (!supabase || !builderId) return { tiers: [], error: null };

  const { data, error } = await supabase
    .from("builder_price_tiers")
    .select("id, builder_id, name, description, days_min, days_max, price_from_cents, position")
    .eq("builder_id", builderId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return { tiers: [], error };
  return { tiers: (data || []).map(mapPriceTier), error: null };
}
