"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Studios data layer (BuildEx Studios partner program)
// Thin wrappers over the studio tables + RPCs added in
// supabase/migrations/0026_studios.sql. Same { data, error } convention as
// lib/disputes/api.js / lib/admin/api.js — never throws on a missing or
// misconfigured Supabase client; resolves to a null/empty result instead.
//
// Reads of the public storefront reuse the builder feed mappers so a studio's
// builders render with the exact same BuilderCard shape as /builders.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";
import { rewriteStorageUrl } from "../supabase/storageUrl";
import { PROFILE_SELECT, mapRow } from "../../app/builders/data/fetchBuilders";

const STUDIO_COLUMNS =
  "id, name, slug, logo_url, bio, studio_share_bps, promo_bps, status, notes, created_at";

function mapStudioRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug != null ? String(row.slug) : null,
    logo_url: rewriteStorageUrl(row.logo_url) || null,
    bio: row.bio || "",
    studio_share_bps: Number(row.studio_share_bps) || 0,
    promo_bps: Number(row.promo_bps) || 0,
    status: row.status || "active",
    notes: row.notes || "",
    created_at: row.created_at || null,
  };
}

// ─── Builder-facing ─────────────────────────────────────────────────────────

// Validate a studio code at the identity step WITHOUT consuming a slot
// (migration 0027). Returns { studio, error } — studio = { name, slug, logo_url,
// promo_bps } when usable. The code is only actually consumed at onboarding
// completion via finalizeStudioCode, so an abandoned registration never burns a
// slot. The RPC enforces "one studio per builder" + active/unexpired/has-room.
export async function validateStudioCode(code) {
  const supabase = getSupabaseClient();
  if (!supabase) return { studio: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("validate_studio_code", {
    p_code: code,
  });
  if (error) return { studio: null, error };
  return { studio: data || null, error: null };
}

// Consume the pending studio code (builder_profiles.pending_studio_code) at the
// moment onboarding completes. Best-effort: resolves to { studio: null } when
// there's nothing to apply (no code, already joined, or the code filled up),
// never blocking completion. Returns { studio, error }.
export async function finalizeStudioCode() {
  const supabase = getSupabaseClient();
  if (!supabase) return { studio: null, error: null };

  const { data, error } = await supabase.rpc("finalize_studio_code");
  if (error) return { studio: null, error };
  return { studio: data || null, error: null };
}

// ─── Public storefront reads ────────────────────────────────────────────────

// A single studio by slug (case-insensitive via the citext column). RLS returns
// only active studios to the public. Returns { studio, error } — null if no
// active studio matches.
export async function fetchStudio(slug) {
  const supabase = getSupabaseClient();
  if (!supabase || !slug) return { studio: null, error: null };

  const { data, error } = await supabase
    .from("studios")
    .select(STUDIO_COLUMNS)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (error) return { studio: null, error };
  return { studio: mapStudioRow(data), error: null };
}

// Every builder linked to a studio, mapped into the BuilderCard shape. Unlike
// the main feed this does NOT hide "busy" builders — a studio storefront shows
// its full roster (same rationale as a direct profile link). Returns
// { builders, error }.
export async function fetchStudioBuilders(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase || !studioId) return { builders: [], error: null };

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("builder.studio_id", studioId)
    .not("onboarding_completed_at", "is", null)
    .not("username", "is", null);

  if (error) return { builders: [], error };
  const builders = (data || []).filter((row) => row.builder).map(mapRow);
  return { builders, error: null };
}

// ─── Admin (is_admin gated; RPCs/RLS re-check server-side) ───────────────────

export async function listStudios() {
  const supabase = getSupabaseClient();
  if (!supabase) return { studios: [], error: null };

  const { data, error } = await supabase
    .from("studios")
    .select(STUDIO_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) return { studios: [], error };
  return { studios: (data || []).map(mapStudioRow), error: null };
}

export async function listStudioCodes(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase || !studioId) return { codes: [], error: null };

  const { data, error } = await supabase
    .from("studio_codes")
    .select("id, studio_id, code, max_redemptions, redemptions_used, expires_at, status, created_at")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false });

  if (error) return { codes: [], error };
  return {
    codes: (data || []).map((c) => ({ ...c, code: String(c.code) })),
    error: null,
  };
}

export async function listStudioOverrides(studioId) {
  const supabase = getSupabaseClient();
  if (!supabase || !studioId) return { overrides: [], error: null };

  const { data, error } = await supabase
    .from("studio_overrides")
    .select("id, order_id, builder_id, amount_cents, status, created_at, paid_at")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false });

  if (error) return { overrides: [], error };
  return { overrides: data || [], error: null };
}

export async function createStudio({ name, slug, logoUrl, bio, shareBps, promoBps }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { id: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("admin_create_studio", {
    p_name: name,
    p_slug: slug,
    p_logo_url: logoUrl || null,
    p_bio: bio || null,
    p_share_bps: shareBps,
    p_promo_bps: promoBps,
  });
  if (error) return { id: null, error };
  return { id: data, error: null };
}

export async function updateStudio({ id, name, logoUrl, bio, shareBps, promoBps }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_update_studio", {
    p_id: id,
    p_name: name,
    p_logo_url: logoUrl || null,
    p_bio: bio || null,
    p_share_bps: shareBps,
    p_promo_bps: promoBps,
  });
  return { error: error || null };
}

export async function setStudioStatus({ id, status }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_set_studio_status", {
    p_id: id,
    p_status: status,
  });
  return { error: error || null };
}

export async function createStudioCode({ studioId, code, maxRedemptions, expiresAt }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { id: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("admin_create_studio_code", {
    p_studio: studioId,
    p_code: code,
    p_max_redemptions: maxRedemptions,
    p_expires_at: expiresAt || null,
  });
  if (error) return { id: null, error };
  return { id: data, error: null };
}

export async function setCodeStatus({ id, status }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_set_code_status", {
    p_id: id,
    p_status: status,
  });
  return { error: error || null };
}

export async function markOverridePaid({ id }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };

  const { error } = await supabase.rpc("admin_mark_override_paid", { p_id: id });
  return { error: error || null };
}
