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
import {
  BUILDER_TOOLS,
  RESPONSE_TIMES,
} from "../../../lib/onboarding/constants";
import { startsFromPrice } from "../../../lib/pricing";

// Columns shared by the feed query and the single-profile query.
const PROFILE_SELECT =
  "id, username, display_name, avatar_url, bio, role, created_at, onboarding_completed_at, " +
  "builder:builder_profiles!inner(*), " +
  "portfolio:portfolio_images(id, url, position, alt)";

// Portfolio images → the lightweight items BuilderCard renders in its carousel.
function mapPortfolio(rows) {
  return (rows || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((p) => ({
      id: p.id,
      title: p.alt || "Build",
      thumbnail: p.url,
      images: [p.url],
    }));
}

// Builder rates are { small|medium|large: { enabled, blocks, price_kopecks } }.
// starts_from = cheapest enabled tier's price in kopecks (0 if none set).
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

function mapRow(row) {
  const bp = row.builder || {};
  const specialties = Array.isArray(bp.specialties) ? bp.specialties : [];
  const buildTypes = Array.isArray(bp.build_types) ? bp.build_types : [];
  const rates = bp.rates && typeof bp.rates === "object" ? bp.rates : {};
  const startsFrom = deriveStartsFrom(rates);
  const availability = bp.availability_status || "available";

  return {
    // Identity
    username: row.username,
    display_name: row.display_name || row.username || "Builder",
    avatar: row.avatar_url || null,
    rank: bp.rank || "rookie",

    // Profile
    bio: row.bio || "",
    availability_status: availability,
    // Green slider state surfaces as the card's live indicator.
    online: availability === "available",
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

    // Rates — exact price per enabled size (kopecks)
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
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("role", ["builder", "both"])
    .not("onboarding_completed_at", "is", null)
    .not("username", "is", null);

  if (error) return { builders: [], error };

  const builders = (data || [])
    .filter((row) => row.builder && !isHiddenFromFeed(row.builder))
    .map(mapRow);

  return { builders, error: null };
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

// Normalize per-size rates for the public profile page.
// Returns { small|medium|large: { enabled, price, label } } where price is kopecks.
const BASE_LABELS = {
  small: "Small spawn or arena",
  medium: "Medium hub or lobby",
  large: "Large kingdom or network",
};

function normalizeProfileRates(rates) {
  const out = {};
  for (const key of ["small", "medium", "large"]) {
    const tier = (rates && typeof rates === "object" && rates[key]) || {};
    const blocks = Number(tier.blocks);
    const baseLabel = BASE_LABELS[key];
    const blocksSuffix = Number.isFinite(blocks) && blocks > 0 ? ` (~${blocks}×${blocks})` : "";

    // Support both old shape (from/to) and new shape (enabled/price)
    if ("from" in tier && !("price" in tier)) {
      out[key] = {
        enabled: true,
        price: Number(tier.from) || 0,
        blocks: Number.isFinite(blocks) ? blocks : 0,
        label: `${baseLabel}${blocksSuffix}`,
      };
    } else {
      out[key] = {
        enabled: tier.enabled !== false,
        price: Number(tier.price) || 0,
        blocks: Number.isFinite(blocks) ? blocks : 0,
        label: `${baseLabel}${blocksSuffix}`,
      };
    }
  }
  return out;
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

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .ilike("username", username)
    .maybeSingle();

  if (error) return { builder: null, error };
  if (!data || !data.builder) return { builder: null, error: null };

  return { builder: mapProfileRow(data), error: null };
}
