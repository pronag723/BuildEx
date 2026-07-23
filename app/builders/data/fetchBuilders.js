"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Live builder feed loader
// Pulls real builder profiles from Supabase and maps each row into the shape the
// catalog UI (BuilderCard + filterBuilders/sortBuilders) already expects, so the
// /builders page can drop the static demo data without any UI changes.
//
// Visibility rules:
//   • Only profiles that finished onboarding (onboarding_completed_at set) and
//     have a builder_profiles row are listed.
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
import { startsFromPrice, ratesToTiers } from "../../../lib/pricing";
import { fetchStudios } from "../../../lib/studios/api";

// Columns shared by the feed query and the single-profile query.
// last_seen_at drives the real online/offline indicator (presence, migration
// 0019). It's selected with the rest of profiles; a pre-0019 database simply
// returns it absent, in which case mapRow reads the builder as offline.
export const PROFILE_SELECT =
  "id, username, display_name, avatar_url, bio, role, created_at, last_seen_at, onboarding_completed_at, " +
  "builder:builder_profiles!inner(*), " +
  "portfolio:portfolio_images(id, url, position, alt)";

// Same select WITHOUT the studio embed. Used as a fallback when the studios
// relationship doesn't exist yet (migration 0026 not applied), so the feed never
// breaks during the window between a frontend deploy and running the migration.
const PROFILE_SELECT_NO_STUDIO =
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

// Builder rates are { small|medium|large: { enabled, blocks, price_kopecks } }.
// (price_kopecks now holds USD cents — legacy column name.)
// starts_from = cheapest enabled tier's price in cents (0 if none set).
function deriveStartsFrom(rates) {
  return startsFromPrice(rates);
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

// The studio a builder was referred by (migration 0026), surfaced for the badge
// before the nickname + the link to the studio storefront. Suspended studios
// stop showing the badge, so only an active embed is mapped. A pre-0026 database
// simply returns no `studio` embed, in which case this reads as null.
function mapStudio(bp) {
  const s = bp?.studio || null;
  if (!s || s.status !== "active") return null;
  return {
    id: s.id,
    name: s.name,
    slug: s.slug != null ? String(s.slug) : null,
    logo_url: rewriteStorageUrl(s.logo_url) || null,
  };
}

export function mapRow(row) {
  const bp = row.builder || {};
  const specialties = Array.isArray(bp.specialties) ? bp.specialties : [];
  const buildTypes = Array.isArray(bp.build_types) ? bp.build_types : [];
  const rates = bp.rates && typeof bp.rates === "object" ? bp.rates : {};
  const startsFrom = deriveStartsFrom(rates);
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
    rank: bp.rank || "rookie",

    // Profile
    bio: row.bio || "",
    // Studio referral (migration 0026) — null unless the builder joined an active
    // studio. Drives the studio badge before the nickname + storefront link.
    studio: null,
    provider_type: "builder",
    availability_status: availability,
    // Real presence — true only when the builder's last heartbeat (last_seen_at,
    // migration 0019) is within the online window. This is independent of the
    // availability slider: an "Available" builder who isn't at their keyboard
    // now correctly reads as offline.
    online: isOnline(row.last_seen_at),
    member_since: row.created_at || null,
    specialties,

    // Stats — real, cached aggregates from builder_profiles (Stage 8). They
    // default to 0 in the DB, so a builder with no completed orders still maps
    // cleanly; coalesce guards a pre-migration row where the columns are absent.
    avg_rating: Number(bp.avg_rating) || 0,
    completed_projects: Number(bp.completed_orders) || 0,
    total_reviews: Number(bp.reviews_count) || 0,

    // Portfolio
    portfolio: mapPortfolio(row.portfolio),
    styles: specialties,
    build_types: buildTypes,

    // Rates — exact price per enabled size (cents)
    rates,
    starts_from: startsFrom,
  };
}

// Returns { builders, error }. Never throws — a misconfigured/offline Supabase
// resolves to an empty feed so the page still renders its empty state.
export async function fetchBuilders() {
  const supabase = getSupabaseClient();
  if (!supabase) return { builders: [], error: null };

  // builder_profiles is embedded with `*` so a not-yet-applied migration column
  // (e.g. rates/tools) never 400s the whole query — same tolerance the
  // onboarding loader relies on. `!inner` drops profiles without a builder row.
  const feedFilters = (q) =>
    q
      .in("role", ["builder", "both"])
      .not("onboarding_completed_at", "is", null)
      .not("username", "is", null);

  let res = await feedFilters(supabase.from("profiles").select(PROFILE_SELECT));
  // The studio embed (migration 0026) fails if the studios relationship isn't
  // there yet — retry without it so the feed degrades gracefully (no badges).
  if (res.error) {
    res = await feedFilters(supabase.from("profiles").select(PROFILE_SELECT_NO_STUDIO));
  }
  const { data, error } = res;

  if (error) return { builders: [], error };

  const builders = (data || [])
    .filter(
      (row) =>
        row.builder &&
        row.builder.profile_type !== "studio_employee" &&
        !isHiddenFromFeed(row.builder)
    )
    .map(mapRow);

  const { studios } = await fetchStudios();
  return { builders: [...builders, ...(studios || [])], error: null };
}

// ─── Single builder (public profile page) ───────────────────────────────────
// The profile page renders a richer shape than the feed card (workflow, tools,
// response time, and a complete small/medium/large rate set). These helpers
// fill in those extra, profile-only fields.

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

// Normalize rates for the public profile + order pages into an ordered array of
// display tiers (built-ins first, then any builder-added custom sizes). Disabled
// tiers are kept so the order page can show the full menu greyed out.
// Returns: [{ id, label, icon, blocks, price (cents), enabled, areaText }]
function areaTextFor(tier) {
  const blocks = Number(tier.blocks) || 0;
  if (blocks <= 0) return "Custom scope — quote on request";
  if (tier.id === "large") return `${blocks}×${blocks} blocks and beyond`;
  return `Up to ${blocks}×${blocks} blocks`;
}

function normalizeProfileRates(rates) {
  return ratesToTiers(rates).map((tier) => ({
    id: tier.id,
    label: tier.label,
    icon: tier.icon,
    hint: tier.hint,
    blocks: tier.blocks,
    price: tier.price,
    enabled: tier.enabled,
    areaText: areaTextFor(tier),
  }));
}

function mapProfileRow(row) {
  const base = mapRow(row);
  const bp = row.builder || {};
  return {
    ...base,
    // profiles.id is needed by the order placement RPC (builder_id) and by the
    // "is this me?" self-check on /order. profiles is publicly readable under
    // RLS, so exposing the uuid here is no different from selecting it directly.
    id: row.id,
    response_time: responseTimeLabel(bp.response_time_hours),
    workflow: bp.tagline || "",
    tools: toolLabels(bp.tools),
    rates: normalizeProfileRates(bp.rates),
    member_since: base.member_since || new Date().toISOString(),
  };
}

// Looks a builder up by @handle (case-insensitive). Direct profile views are
// allowed regardless of availability — the "busy hides from feed" rule applies
// to the listing, not to someone following a direct link.
export async function fetchBuilderByUsername(username) {
  const supabase = getSupabaseClient();
  if (!supabase || !username) return { builder: null, error: null };

  let res = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .ilike("username", username)
    .maybeSingle();
  // Fallback without the studio embed if migration 0026 isn't applied yet.
  if (res.error) {
    res = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_NO_STUDIO)
      .ilike("username", username)
      .maybeSingle();
  }
  const { data, error } = res;

  if (error) return { builder: null, error };
  if (!data || !data.builder || data.builder.profile_type === "studio_employee") {
    return { builder: null, error: null };
  }

  return { builder: mapProfileRow(data), error: null };
}
