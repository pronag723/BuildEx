"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Live builder feed loader
// Pulls real builder profiles from Supabase and maps each row into the shape the
// catalog UI (BuilderCard + filterBuilders/sortBuilders) already expects, so the
// /builders page can drop the static demo data without any UI changes.
//
// Visibility rules:
//   • Only profiles that finished builder setup (onboarding_completed_at set)
//     and have a builder_profiles row are listed. The `!inner` join IS the
//     "is this a builder?" test — profiles.role is legacy and not consulted.
//   • Builders whose availability is "busy" (the red end of the slider) are
//     hidden from the feed entirely, per product spec.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../../../lib/supabase/client";
import { rewriteStorageUrl } from "../../../lib/supabase/storageUrl";
import {
  BUILDER_TOOLS,
  RESPONSE_TIMES,
} from "../../../lib/onboarding/constants";
import { isOnline } from "../../../lib/presence/api";

// Columns shared by the feed query and the single-profile query.
// last_seen_at drives the real online/offline indicator (presence, migration
// 0019). It's selected with the rest of profiles; a pre-0019 database simply
// returns it absent, in which case mapRow reads the builder as offline.
// builder_profiles is embedded with `*` on purpose (migration tolerance): a
// not-yet-applied column never 400s the whole query. The dormant columns it
// drags back over the wire — rank, rates, studio_id, profile_type — are simply
// not mapped.
export const PROFILE_SELECT =
  "id, username, display_name, avatar_url, bio, role, created_at, last_seen_at, onboarding_completed_at, " +
  "builder:builder_profiles!inner(*), " +
  "portfolio:portfolio_images(id, url, position, alt)";

// Portfolio images → the lightweight items BuilderCard renders in its carousel.
function mapPortfolio(rows) {
  return (rows || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((p) => {
      const url = rewriteStorageUrl(p.url);
      return {
        id: p.id,
        title: p.alt || "Build",
        thumbnail: url,
        images: [url],
      };
    });
}

// A builder is hidden from the feed when their availability slider is on red.
// `availability_status === "busy"` is the source of truth; `is_available` is a
// mirror kept in sync by the account page, checked as a fallback.
function isHiddenFromFeed(builderProfile) {
  const status = builderProfile?.availability_status || "available";
  if (status === "busy") return true;
  if (builderProfile?.is_available === false) return true;
  return false;
}

export function mapRow(row) {
  const bp = row.builder || {};
  const specialties = Array.isArray(bp.specialties) ? bp.specialties : [];
  const buildTypes = Array.isArray(bp.build_types) ? bp.build_types : [];
  const availability = bp.availability_status || "available";

  return {
    // Identity
    // profiles.id (uuid) — needed to key favorites against this builder. profiles
    // is publicly readable under RLS, so surfacing the uuid on a feed card is no
    // different from selecting it directly (same rationale as mapProfileRow).
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username || "Builder",
    avatar: rewriteStorageUrl(row.avatar_url) || null,

    // Profile
    bio: row.bio || "",
    provider_type: "builder",
    availability_status: availability,
    // Real presence — true only when the builder's last heartbeat (last_seen_at,
    // migration 0019) is within the online window. This is independent of the
    // availability slider: an "Available" builder who isn't at their keyboard
    // now correctly reads as offline.
    online: isOnline(row.last_seen_at),
    member_since: row.created_at || null,
    specialties,

    // Portfolio
    portfolio: mapPortfolio(row.portfolio),
    styles: specialties,
    build_types: buildTypes,
  };
}

// Returns { builders, error }. Never throws — a misconfigured/offline Supabase
// resolves to an empty feed so the page still renders its empty state.
export async function fetchBuilders() {
  const supabase = getSupabaseClient();
  if (!supabase) return { builders: [], error: null };

  // `!inner` on builder_profiles drops every profile without a builder row —
  // that join is what makes someone a builder now. There is deliberately no
  // `role` filter: role is a legacy column that visitors leave null and older
  // accounts carry stale values in, so filtering on it would silently hide
  // real builders.
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .not("onboarding_completed_at", "is", null)
    .not("username", "is", null);

  const builders = error
    ? []
    : (data || [])
        .filter((row) => row.builder && !isHiddenFromFeed(row.builder))
        .map(mapRow);

  return { builders, error: error || null };
}

// ─── Single builder (public profile page) ───────────────────────────────────
// The profile page renders a richer shape than the feed card (tools and
// response time). These helpers fill in those extra, profile-only fields.

function responseTimeLabel(hours) {
  if (hours == null) return "within a day";
  const match =
    RESPONSE_TIMES.find((r) => r.hours >= hours) ||
    RESPONSE_TIMES[RESPONSE_TIMES.length - 1];
  return (match?.label || "Within a day").toLowerCase();
}

function toolLabels(tools) {
  return (Array.isArray(tools) ? tools : []).map(
    (key) => BUILDER_TOOLS.find((t) => t.key === key)?.label || key
  );
}

function mapProfileRow(row) {
  const base = mapRow(row);
  const bp = row.builder || {};
  return {
    ...base,
    // profiles is publicly readable under RLS, so exposing the uuid here is no
    // different from selecting it directly.
    id: row.id,
    response_time: responseTimeLabel(bp.response_time_hours),
    tools: toolLabels(bp.tools),
    member_since: base.member_since || new Date().toISOString(),
  };
}

// Looks a builder up by @handle (case-insensitive). Direct profile views are
// allowed regardless of availability — the "busy hides from feed" rule applies
// to the listing, not to someone following a direct link.
export async function fetchBuilderByUsername(username) {
  const supabase = getSupabaseClient();
  if (!supabase || !username) return { builder: null, error: null };

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .ilike("username", username)
    .maybeSingle();

  if (error) return { builder: null, error };
  if (!data || !data.builder) return { builder: null, error: null };

  return { builder: mapProfileRow(data), error: null };
}
