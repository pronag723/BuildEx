// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder-centric data model
// The feed's shared constants plus the pure filter/sort helpers the catalog
// applies to the live builder rows loaded by fetchBuilders.js.
// ─────────────────────────────────────────────────────────────────────────────

import { STYLES, BUILD_TYPES, ITEMS_PER_PAGE } from "./offers";
import { seededShuffle } from "./feedOrder";

// Re-export shared constants so consumers only need one import.
export { STYLES, BUILD_TYPES, ITEMS_PER_PAGE };

// ─── Sort options (builder-centric) ─────────────────────────────────────────
// "featured" is the default: a randomised order (seeded per visit) so every
// builder gets equal exposure instead of being ranked by join date.
export const SORT_OPTIONS = [
  { key: "featured",   label: "Recommended" },
  { key: "newest",     label: "Recently Joined" },
];

// The default ordering when no explicit sort is chosen.
export const DEFAULT_SORT = "featured";

// ─── Pure filter / sort helpers (easy to move server-side) ──────────────────
export function filterBuilders(builders, filters) {
  const { query = "", styles = [], buildTypes = [] } = filters;

  return builders.filter((b) => {
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

    if (styles.length > 0 && !styles.some((s) => b.styles.includes(s))) return false;
    if (buildTypes.length > 0 && !buildTypes.some((t) => b.build_types.includes(t))) return false;

    return true;
  });
}

// `seed` only matters for the "featured" (randomised) ordering; it's ignored by
// every deterministic sort. Passing it always keeps the call site simple.
export function sortBuilders(builders, sort, seed = 0) {
  const result = [...builders];
  switch (sort) {
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
