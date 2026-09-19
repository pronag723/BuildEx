// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder-centric data model
// Each builder represents a creator profile with a portfolio.
// Supabase migration: SELECT * FROM builder_profiles JOIN portfolio_items
// ─────────────────────────────────────────────────────────────────────────────

import {
  offers,
  BUILDER_PROFILES,
  OFFER_DETAILS,
  RANKS,
  STYLES,
  BUILD_TYPES,
  RATING_OPTIONS,
  ITEMS_PER_PAGE,
} from "./offers";
import { seededShuffle } from "./feedOrder";

// Re-export shared constants so consumers only need one import.
export { RANKS, STYLES, BUILD_TYPES, RATING_OPTIONS, ITEMS_PER_PAGE };

// ─── Sort options (builder-centric) ─────────────────────────────────────────
// "featured" is the default: a randomised order (seeded per visit) so every
// builder gets equal exposure instead of being ranked by join date.
export const SORT_OPTIONS = [
  { key: "featured",   label: "Recommended" },
  { key: "newest",     label: "Recently Joined" },
  { key: "rating",     label: "Highest Rated" },
  { key: "orders",     label: "Most Projects" },
];

// The default ordering when no explicit sort is chosen.
export const DEFAULT_SORT = "featured";

// ─── Workflow snippets (per rank) ───────────────────────────────────────────
const WORKFLOW_BY_RANK = {
  rookie:   "Quick turnaround on focused scopes — best for spawns, smaller arenas, and starter hubs.",
  advanced: "Discovery → moodboard → blockout → detail pass → final delivery. One revision round included.",
  expert:   "Discovery → references → blockout → terrain → detail → polish. Two revision rounds + schematic delivery.",
  master:   "Full creative direction — references, custom terrain, signature detailing, particle FX, and schematic/world delivery.",
};

const TOOLS_BY_RANK = {
  rookie:   ["WorldEdit", "VoxelSniper", "Litematica"],
  advanced: ["WorldEdit", "VoxelSniper", "Arceon", "Litematica"],
  expert:   ["WorldEdit", "Arceon", "VoxelSniper", "Litematica"],
  master:   ["WorldEdit", "Arceon", "Chunky", "BlockBench", "Litematica", "Photoshop"],
};

// ─── Derive portfolio items per builder from existing offer data ────────────
function buildPortfolios() {
  const portfolios = {};
  for (const offer of offers) {
    const username = offer.builder.username;
    if (!portfolios[username]) portfolios[username] = [];
    const detail = OFFER_DETAILS[offer.id] || {};
    portfolios[username].push({
      id: offer.id,
      title: offer.title,
      description: offer.description,
      thumbnail: offer.thumbnail,
      images: detail.images || [offer.thumbnail],
      style: offer.style,
      build_type: offer.build_type,
      tags: offer.tags,
      year: new Date(offer.created_at).getFullYear(),
      featured: offer.rating >= 4.9,
    });
  }
  return portfolios;
}

const PORTFOLIO_BY_BUILDER = buildPortfolios();

// ─── Build the BUILDERS array ───────────────────────────────────────────────
function buildBuilders() {
  const seen = new Set();
  const out = [];

  for (const offer of offers) {
    const u = offer.builder.username;
    if (seen.has(u)) continue;
    seen.add(u);

    const profile = BUILDER_PROFILES[u] || {};
    const portfolio = PORTFOLIO_BY_BUILDER[u] || [];

    // Aggregate styles & build types from the builder's portfolio for filtering.
    const styles = Array.from(new Set(portfolio.map((p) => p.style)));
    const build_types = Array.from(new Set(portfolio.map((p) => p.build_type)));

    // Aggregate review counts from underlying portfolio orders.
    const total_reviews = portfolio.reduce((sum, p) => {
      const o = offers.find((x) => x.id === p.id);
      return sum + (o?.order_count || 0);
    }, 0);

    out.push({
      // Identity
      username: offer.builder.username,
      display_name: offer.builder.display_name,
      avatar: offer.builder.avatar,
      rank: offer.builder.rank,

      // Profile
      bio: profile.bio || "",
      response_time: profile.response_time || "~3 hours",
      online: profile.online ?? false,
      member_since: profile.member_since || "2023-01-01",
      specialties: profile.specialties || [],

      // Stats
      avg_rating: offer.builder.avg_rating,
      completed_projects: profile.completed_projects || portfolio.length * 5,
      total_reviews,

      // Portfolio
      portfolio,
      styles,
      build_types,

      // Workflow
      workflow: WORKFLOW_BY_RANK[offer.builder.rank],
      tools: TOOLS_BY_RANK[offer.builder.rank],
    });
  }

  return out;
}

export const BUILDERS = buildBuilders();

// ─── Lookup helper ───────────────────────────────────────────────────────────
export function getBuilder(username) {
  return BUILDERS.find((b) => b.username === username);
}

// ─── Pure filter / sort helpers (easy to move server-side) ──────────────────
export function filterBuilders(builders, filters) {
  const {
    query = "",
    styles = [],
    buildTypes = [],
    minRating = 0,
    ranks = [],
    studios = [],
    provider = "all",
  } = filters;

  return builders.filter((b) => {
    const isStudioProvider = b.provider_type === "studio";
    if (provider === "studios" && !isStudioProvider) return false;
    if (provider === "builders" && isStudioProvider) return false;
    if (query) {
      const q = query.toLowerCase();
      const match =
        b.display_name.toLowerCase().includes(q) ||
        b.username.toLowerCase().includes(q) ||
        (b.bio || "").toLowerCase().includes(q) ||
        (b.specialties || []).some((s) => s.toLowerCase().includes(q)) ||
        (b.styles || []).some((s) => s.toLowerCase().includes(q)) ||
        (b.build_types || []).some((t) => t.toLowerCase().includes(q));
      if (!match) return false;
    }

    if (!isStudioProvider && styles.length > 0 && !styles.some((s) => b.styles.includes(s))) return false;
    if (!isStudioProvider && buildTypes.length > 0 && !buildTypes.some((t) => b.build_types.includes(t))) return false;
    if (minRating > 0 && b.avg_rating < minRating) return false;
    if (!isStudioProvider && ranks.length > 0 && !ranks.includes(b.rank)) return false;
    // Studio filter (migration 0026): match the builder's studio slug.
    if (
      studios.length > 0 &&
      !(isStudioProvider && studios.includes(b.slug)) &&
      !(b.studio && studios.includes(b.studio.slug))
    ) return false;

    return true;
  });
}

// `seed` only matters for the "featured" (randomised) ordering; it's ignored by
// every deterministic sort. Passing it always keeps the call site simple.
export function sortBuilders(builders, sort, seed = 0) {
  const result = [...builders];
  switch (sort) {
    case "rating":
      return result.sort((a, b) => b.avg_rating - a.avg_rating);
    case "orders":
      return result.sort((a, b) => (b.completed_projects || 0) - (a.completed_projects || 0));
    case "newest":
      return result.sort(
        (a, b) => new Date(b.member_since || 0) - new Date(a.member_since || 0)
      );
    case "featured":
    default:
      // Randomised, but stable for a given seed (held constant across the
      // profile round-trip). Re-anchor on username so the order is fully
      // determined by the seed rather than the feed's arrival order.
      return seededShuffle(
        result.sort((a, b) => (a.username || "").localeCompare(b.username || "")),
        seed
      );
  }
}
