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
//   • Builders a moderator has taken down (builder_profiles.is_hidden, migration
//     0101) are excluded here AND by the RLS policy on builder_profiles. The
//     filter below is the fast path; the policy is the guarantee — without it,
//     "hidden" would only mean "absent from one query", and PostgREST is a
//     public API.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../../../lib/supabase/client";
import { rewriteStorageUrl } from "../../../lib/supabase/storageUrl";
import { isOnline } from "../../../lib/presence/api";

// Columns shared by the feed query and the single-profile query.
// last_seen_at drives the real online/offline indicator (presence, migration
// 0019). It's selected with the rest of profiles; a pre-0019 database simply
// returns it absent, in which case mapRow reads the builder as offline.
// builder_profiles is embedded with `*` on purpose (migration tolerance): a
// not-yet-applied column never 400s the whole query. The dormant columns it
// drags back over the wire — rank, rates, studio_id, profile_type — are simply
// not mapped.
//
// The FK is named explicitly, and must stay named. Migration 0101 added
// `builder_profiles.hidden_by references profiles(id)`, which gave the two
// tables a SECOND relationship. A bare `builder_profiles!inner(*)` then became
// ambiguous and PostgREST answered every feed query with 300 / PGRST201 — the
// directory silently showed zero builders. `!builder_profiles_id_fkey` picks
// the profile↔builder relationship; `!inner` still makes it the "is this a
// builder?" test.
export const PROFILE_SELECT =
  "id, username, display_name, avatar_url, bio, role, created_at, last_seen_at, onboarding_completed_at, " +
  "builder:builder_profiles!builder_profiles_id_fkey!inner(*), " +
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
// A moderator takedown also removes the builder, and that check is deliberately
// duplicated here: RLS already dropped the row, and the query below already
// filtered on it, but a feed card is the one place where a leak would be
// visible to everyone at once.
function isHiddenFromFeed(builderProfile) {
  if (builderProfile?.is_hidden === true) return true;
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
  // `builder.is_hidden = false` filters on the EMBEDDED resource, which only
  // works because the join is `!inner`. It needs migration 0101; against an
  // older database PostgREST answers 42703 (undefined column) and the retry
  // below drops the filter, keeping the file's migration-tolerance contract.
  // Nothing is lost by the retry: the RLS policy from the same migration is
  // what actually hides the row, and an older database has nothing to hide.
  const base = () =>
    supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .not("onboarding_completed_at", "is", null)
      .not("username", "is", null);

  let { data, error } = await base().eq("builder.is_hidden", false);
  if (error?.code === "42703") {
    ({ data, error } = await base());
  }

  const builders = error
    ? []
    : (data || [])
        .filter((row) => row.builder && !isHiddenFromFeed(row.builder))
        .map(mapRow);

  return { builders, error: error || null };
}

// ─── Single builder (public profile page) ───────────────────────────────────
// The profile page renders a slightly richer shape than the feed card: it also
// shows the one off-platform contact link a builder may publish.

function mapProfileRow(row) {
  const base = mapRow(row);
  const bp = row.builder || {};
  return {
    ...base,
    // profiles is publicly readable under RLS, so exposing the uuid here is no
    // different from selecting it directly.
    id: row.id,
    // Passed through raw. <SocialLinks> runs it through readContactLinks,
    // which re-validates every entry and drops anything that is not a known
    // handle or a plain https:// URL on that platform's own host — so a row
    // written before the CHECK constraint existed can never become a link.
    contact_links: bp.contact_links || null,
    member_since: base.member_since || new Date().toISOString(),
  };
}

// Looks a builder up by @handle (case-insensitive). Direct profile views are
// allowed regardless of availability — the "busy hides from feed" rule applies
// to the listing, not to someone following a direct link.
//
// A moderator takedown is different, and there is deliberately no is_hidden
// filter here. The RLS policy on builder_profiles (0101) already withholds the
// row from everyone but the builder and an admin, and the `!inner` join turns
// that into a clean "not found" — so a logged-out visitor with the direct link
// gets <BuilderNotFound>, while the builder can still open their own page and
// see that nothing was deleted. Filtering in the query would take that away.
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
