// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Onboarding data layer
// All Supabase operations for the onboarding flow. Pure functions that take a
// Supabase client + the payload; never read auth state directly — the caller
// passes the user id.
// ─────────────────────────────────────────────────────────────────────────────

import { BUCKETS, HANDLE_REGEX } from "./constants";
import { compressImage, IMAGE_PRESETS } from "../images/compress";
import { rewriteUrlsDeep } from "../supabase/storageUrl";

// Per-query timeout. If a single Supabase call hangs (network issue,
// RLS recursion, misconfigured project), we want it to fail visibly
// instead of locking up the whole onboarding flow.
//
// 12 s tolerates Supabase free-tier cold starts (which can legitimately
// take 10–15 s on the first request after idle) without making the UI
// feel frozen. Anything tighter triggers spurious TIMEOUT errors on
// otherwise-fine projects — that's the root cause of the "{}" console
// errors users were seeing on first login.
const QUERY_TIMEOUT_MS = 12000;

// Normalize whatever the Supabase / fetch layer hands us into a plain object
// with the useful fields enumerable. Error instances (TypeError from fetch,
// AbortError, etc.) have `message`/`name`/`stack` as non-enumerable properties,
// which causes them to print as `{}` in DevTools — that's the bug behind the
// scary "profiles query failed: {}" console errors we were seeing.
function normalizeError(err, label) {
  if (!err) return null;
  // Already a plain Supabase-shaped error (e.g. PostgrestError) — return as-is
  // after ensuring at least `message` is enumerable.
  if (typeof err === "object" && (err.code || err.message || err.details)) {
    return {
      code: err.code || null,
      message: err.message || String(err) || "Unknown error",
      details: err.details ?? null,
      hint: err.hint ?? null,
      status: err.status ?? null,
      name: err.name || null,
    };
  }
  // Error instance from fetch / abort / etc.
  if (err instanceof Error) {
    return {
      code: err.name || "ERROR",
      message: err.message || `Network error while running ${label}`,
      name: err.name || null,
      stack: err.stack || null,
    };
  }
  // Anything else — coerce to string so it's never printed as bare `{}`.
  return {
    code: "UNKNOWN",
    message: typeof err === "string" ? err : `Unknown failure in ${label}`,
    raw: (() => {
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    })(),
  };
}

function withTimeout(promise, label) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        data: null,
        count: null,
        error: {
          code: "TIMEOUT",
          message: `${label} timed out after ${QUERY_TIMEOUT_MS}ms — Supabase REST endpoint is unreachable or extremely slow.`,
        },
      });
    }, QUERY_TIMEOUT_MS);
    promise.then((r) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      // Normalize an error coming back inside a normal Supabase response so
      // downstream logging actually shows something useful.
      if (r && r.error) resolve({ ...r, error: normalizeError(r.error, label) });
      else resolve(r);
    }, (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve({ data: null, count: null, error: normalizeError(err, label) });
    });
  });
}

// ─── Profile fetch ──────────────────────────────────────────────────────────
// `prefetchedProfile` lets callers (e.g. AccountPage) skip the profiles SELECT
// when AuthContext has already loaded and cached the row — that eliminates the
// duplicate concurrent profiles query that piled up on reload and made every
// request time out on slow Supabase.
export async function fetchOnboardingState(supabase, userId, { prefetchedProfile = null } = {}) {
  if (!supabase || !userId) {
    return { profile: null, builderProfile: null, portfolioCount: 0, error: null };
  }

  // Run the queries in parallel — they're independent. If one hangs, we still
  // get the others back within the timeout. When AuthContext has already
  // resolved the profile, skip its query entirely and reuse the cached row.
  const profilePromise = prefetchedProfile
    ? Promise.resolve({ data: prefetchedProfile, error: null })
    : withTimeout(
        supabase
          .from("profiles")
          .select(
            "id, username, display_name, avatar_url, banner_url, bio, role, interests, preferred_server_type, minecraft_username, onboarding_completed_at"
          )
          .eq("id", userId)
          .maybeSingle(),
        "profiles SELECT"
      );

  const [profileRes, builderRes, portfolioRes] = await Promise.all([
    profilePromise,
    withTimeout(
      // Select all columns rather than an explicit list. Naming a column that
      // hasn't been migrated yet (e.g. `tools` before 0004 is applied) makes
      // PostgREST return 400 for the WHOLE query, which would wipe out the
      // builder profile and bounce the user back to an earlier onboarding step.
      // `*` returns whatever columns exist and tolerates pending migrations.
      supabase
        .from("builder_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),
      "builder_profiles SELECT"
    ),
    withTimeout(
      supabase
        .from("portfolio_images")
        .select("id", { count: "exact", head: true })
        .eq("builder_id", userId),
      "portfolio_images COUNT"
    ),
  ]);

  // The profiles row is the only one the gate strictly needs.
  // Missing builder_profiles / portfolio_images is treated as "not started yet".
  if (profileRes.error) {
    // The caller already surfaces this through its own UI (retry button on
    // /account, error screen in OnboardingGate). Logging here just spams the
    // console — and under Next.js 16, console.error fires the dev overlay
    // for what is a handled, expected condition (slow Supabase / cold start).
    return {
      profile: null,
      builderProfile: null,
      portfolioCount: 0,
      error: profileRes.error,
    };
  }

  return {
    profile: rewriteUrlsDeep(profileRes.data) || null,
    builderProfile: builderRes.data || null,
    portfolioCount: portfolioRes.count || 0,
    error: null,
  };
}

// ─── Role ────────────────────────────────────────────────────────────────────
export async function saveRole(supabase, userId, role) {
  if (!["client", "builder", "both"].includes(role)) {
    return { error: { message: "Invalid role" } };
  }
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  return { error };
}

// ─── Handle availability ─────────────────────────────────────────────────────
export async function isHandleAvailable(supabase, handle, currentUserId) {
  const value = String(handle || "").toLowerCase();
  if (!HANDLE_REGEX.test(value)) {
    return { available: false, reason: "format" };
  }
  // Case-insensitive lookup (matches the unique index lower(username)).
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", value)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return { available: false, reason: "error", error };
  }
  if (!data) return { available: true };
  if (currentUserId && data.id === currentUserId) return { available: true, ownedBySelf: true };
  return { available: false, reason: "taken" };
}

// ─── Identity (display name + @handle) ──────────────────────────────────────
export async function saveIdentity(supabase, userId, { displayName, handle }) {
  const cleanHandle = String(handle || "").toLowerCase();
  if (!HANDLE_REGEX.test(cleanHandle)) {
    return { error: { message: "Handle format is invalid" } };
  }
  const cleanDisplayName = String(displayName || "").trim();
  if (cleanDisplayName.length < 2) {
    return { error: { message: "Display name is too short" } };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username: cleanHandle,
      display_name: cleanDisplayName,
    })
    .eq("id", userId);

  return { error };
}

// ─── Client profile ─────────────────────────────────────────────────────────
export async function saveClientProfile(supabase, userId, payload) {
  const update = {
    avatar_url: payload.avatarUrl ?? null,
    banner_url: payload.bannerUrl ?? null,
    bio: payload.bio ?? null,
    interests: Array.isArray(payload.interests) ? payload.interests : [],
    preferred_server_type: payload.serverType ?? null,
  };

  if (payload.displayName != null) {
    const cleanDisplayName = String(payload.displayName).trim();
    if (cleanDisplayName.length < 2) {
      return { error: { message: "Display name is too short" } };
    }
    update.display_name = cleanDisplayName;
  }

  if (payload.handle != null) {
    const cleanHandle = String(payload.handle).toLowerCase();
    if (!HANDLE_REGEX.test(cleanHandle)) {
      return { error: { message: "Handle format is invalid" } };
    }
    update.username = cleanHandle;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  return { error };
}

// ─── Builder profile (upsert) ───────────────────────────────────────────────
export async function upsertBuilderProfile(supabase, userId, patch) {
  const row = { id: userId, ...patch };
  const { error } = await supabase
    .from("builder_profiles")
    .upsert(row, { onConflict: "id" });
  return { error };
}

export async function saveBuilderIdentity(supabase, userId, payload) {
  // Identity touches the public profile, not builder_profiles.
  const profileUpdate = {
    avatar_url: payload.avatarUrl ?? null,
    banner_url: payload.bannerUrl ?? null,
    bio: payload.bio ?? null,
  };

  if (payload.displayName != null) {
    const cleanDisplayName = String(payload.displayName).trim();
    if (cleanDisplayName.length < 2) {
      return { error: { message: "Display name is too short" } };
    }
    profileUpdate.display_name = cleanDisplayName;
  }

  if (payload.handle != null) {
    const cleanHandle = String(payload.handle).toLowerCase();
    if (!HANDLE_REGEX.test(cleanHandle)) {
      return { error: { message: "Handle format is invalid" } };
    }
    profileUpdate.username = cleanHandle;
  }

  const { error: profileErr } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", userId);
  if (profileErr) return { error: profileErr };

  // Ensure a builder_profiles row exists so later steps can update it.
  const builderPatch = { tagline: payload.tagline ?? null };
  // Studios (migration 0027): stash the entered code as PENDING here — it isn't
  // consumed until onboarding completes (finalize_studio_code), so abandoning
  // setup never burns a code slot. `null` clears a previously entered code.
  if (payload.pendingStudioCode !== undefined) {
    builderPatch.pending_studio_code = payload.pendingStudioCode;
  }
  const { error: builderErr } = await upsertBuilderProfile(supabase, userId, builderPatch);
  return { error: builderErr };
}

export async function saveBuilderExpertise(supabase, userId, payload) {
  return upsertBuilderProfile(supabase, userId, {
    tools: Array.isArray(payload.tools) ? payload.tools : [],
    project_types: Array.isArray(payload.projectTypes) ? payload.projectTypes : [],
    response_time_hours: payload.responseTimeHours ?? null,
    availability_status: payload.availabilityStatus ?? "available",
    is_available: payload.availabilityStatus !== "busy",
  });
}

export async function saveBuilderStyles(supabase, userId, payload) {
  return upsertBuilderProfile(supabase, userId, {
    specialties: Array.isArray(payload.specialties) ? payload.specialties : [],
    build_types: Array.isArray(payload.buildTypes) ? payload.buildTypes : [],
  });
}

// Availability is edited on its own (top of the account page) so it can be
// toggled without re-saving the rest of the expertise block.
export async function saveBuilderAvailability(supabase, userId, availabilityStatus) {
  return upsertBuilderProfile(supabase, userId, {
    availability_status: availabilityStatus ?? "available",
    is_available: availabilityStatus !== "busy",
  });
}

// Builder-set pricing tiers. `rates` is { small|medium|large: { blocks, from, to } }.
export async function saveBuilderRates(supabase, userId, rates) {
  return upsertBuilderProfile(supabase, userId, {
    rates: rates && typeof rates === "object" ? rates : {},
  });
}

// ─── Completion ─────────────────────────────────────────────────────────────
export async function markOnboardingComplete(supabase, userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId);
  return { error };
}

// ─── Cancel onboarding ───────────────────────────────────────────────────────
// Discards the partial registration the user built during onboarding, restoring
// their profile to the blank slate a brand-new sign-in produces. The profiles
// row itself can't be deleted client-side — it has no RLS delete policy and is
// pinned to auth.users — so we null out everything onboarding collected and
// delete the builder_profiles row + portfolio images (which the owner *can*
// remove). The caller signs the user out afterwards, so next login starts the
// flow over from the role step.
export async function cancelOnboarding(supabase, userId) {
  if (!supabase || !userId) return { error: { message: "Not signed in" } };

  // Children of profiles first (FK / cascade order doesn't strictly matter here
  // since we're deleting them directly, but keeps intent clear).
  await supabase.from("portfolio_images").delete().eq("builder_id", userId);
  await supabase.from("builder_profiles").delete().eq("id", userId);

  const { error } = await supabase
    .from("profiles")
    .update({
      role: null,
      display_name: null,
      username: null,
      avatar_url: null,
      banner_url: null,
      bio: null,
      interests: [],
      preferred_server_type: null,
      onboarding_completed_at: null,
    })
    .eq("id", userId);

  return { error };
}

// ─── Account deletion ─────────────────────────────────────────────────────────
// Permanently deletes the signed-in user's auth account. Relies on the
// `delete_own_account` SECURITY DEFINER function (migration 0006); deleting the
// auth.users row cascades to profiles, builder_profiles and portfolio_images.
// The caller is responsible for signing the user out afterwards.
export async function deleteOwnAccount(supabase) {
  if (!supabase) return { error: { message: "Not connected to Supabase." } };
  const { error } = await supabase.rpc("delete_own_account");
  return { error: error ? normalizeError(error, "delete_own_account RPC") : null };
}

// ─── Abandoned-registration cleanup ───────────────────────────────────────────
// Discards a half-created registration (deletes the auth.users row, cascading to
// profiles / builder_profiles / portfolio_images) when the user bails out of
// onboarding. The `delete_incomplete_registration` RPC (migration 0021) is gated
// server-side on onboarding_completed_at being null, so a completed account is
// never removed. Returns { deleted, error }; best-effort, never throws.
export async function deleteIncompleteRegistration(supabase) {
  if (!supabase) return { deleted: false, error: { message: "Not connected to Supabase." } };
  const { data, error } = await supabase.rpc("delete_incomplete_registration");
  return {
    deleted: data === true,
    error: error ? normalizeError(error, "delete_incomplete_registration RPC") : null,
  };
}

// ─── Image upload helpers ───────────────────────────────────────────────────
function safeExtension(file) {
  const fromName = (file?.name || "").split(".").pop()?.toLowerCase() || "";
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  const fromType = (file?.type || "").split("/").pop()?.toLowerCase() || "";
  if (fromType === "jpeg") return "jpg";
  if (/^[a-z0-9]{1,5}$/.test(fromType)) return fromType;
  return "png";
}

function randomSegment() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

/**
 * Uploads a file to a Supabase Storage bucket under `<userId>/<random>.<ext>`.
 * Returns the public URL on success.
 */
export async function uploadImage(supabase, { bucket, userId, file, onProgress, preset }) {
  if (!supabase || !userId || !file) {
    return { url: null, error: { message: "Missing arguments for upload" } };
  }

  // Downscale + re-encode in the browser before upload so visitors don't have
  // to download multi-megabyte originals. Falls back to the original file if
  // compression isn't possible (see lib/images/compress.js).
  const uploadFile = await compressImage(file, preset);

  const path = `${userId}/${randomSegment()}-${Date.now()}.${safeExtension(uploadFile)}`;

  // Optimistic progress tick — Supabase JS v2 does not surface upload progress
  // through fetch, so we fire start (10%) → end (100%) for nicer UI feedback.
  onProgress?.(0.1);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, uploadFile, {
      // Images live at random, content-addressed-ish paths and never change in
      // place, so they can be cached aggressively (30 days) by the browser/CDN.
      cacheControl: "2592000",
      upsert: false,
      contentType: uploadFile.type || undefined,
    });

  if (uploadError) {
    onProgress?.(0);
    return { url: null, path: null, error: uploadError };
  }

  onProgress?.(0.95);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  onProgress?.(1);
  return { url: data?.publicUrl || null, path, error: null };
}

export function uploadAvatar(supabase, userId, file, onProgress) {
  return uploadImage(supabase, { bucket: BUCKETS.avatars, userId, file, onProgress, preset: IMAGE_PRESETS.avatar });
}

export function uploadBanner(supabase, userId, file, onProgress) {
  return uploadImage(supabase, { bucket: BUCKETS.banners, userId, file, onProgress, preset: IMAGE_PRESETS.banner });
}

export function uploadPortfolioImage(supabase, userId, file, onProgress) {
  return uploadImage(supabase, { bucket: BUCKETS.portfolios, userId, file, onProgress, preset: IMAGE_PRESETS.portfolio });
}

// ─── Portfolio images CRUD ──────────────────────────────────────────────────
export async function listPortfolioImages(supabase, userId) {
  const { data, error } = await supabase
    .from("portfolio_images")
    .select("id, url, storage_path, position, alt")
    .eq("builder_id", userId)
    .order("position", { ascending: true });
  return { images: rewriteUrlsDeep(data || []), error };
}

export async function insertPortfolioImage(supabase, userId, { url, storagePath, position, alt }) {
  const { data, error } = await supabase
    .from("portfolio_images")
    .insert({
      builder_id: userId,
      url,
      storage_path: storagePath || null,
      position: position ?? 0,
      alt: alt || null,
    })
    .select("id, url, storage_path, position, alt")
    .single();
  return { image: data || null, error };
}

export async function updatePortfolioPositions(supabase, userId, images) {
  // images: [{ id, position }, ...]
  const updates = await Promise.all(
    images.map((img) =>
      supabase
        .from("portfolio_images")
        .update({ position: img.position })
        .eq("id", img.id)
        .eq("builder_id", userId)
    )
  );
  const failure = updates.find((u) => u.error);
  return { error: failure?.error || null };
}

export async function deletePortfolioImage(supabase, userId, id) {
  const { data: row } = await supabase
    .from("portfolio_images")
    .select("storage_path")
    .eq("id", id)
    .eq("builder_id", userId)
    .maybeSingle();

  if (row?.storage_path) {
    await supabase.storage.from(BUCKETS.portfolios).remove([row.storage_path]);
  }

  const { error } = await supabase
    .from("portfolio_images")
    .delete()
    .eq("id", id)
    .eq("builder_id", userId);
  return { error };
}
