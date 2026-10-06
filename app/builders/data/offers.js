// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Catalog constants
//
// The hardcoded demo builders/offers that lived here predated the real Supabase
// user database. They were the source of the old "bot" profile pages
// (/builders/profile/<seeded-username>) and demo offer pages
// (/builders/<offerId>). Now that the catalog feed and profiles load real
// builders from Supabase (fetchBuilders / fetchBuilderByUsername), that demo
// data — and the filter/sort helpers that operated on it — are gone.
//
// What remains is the shared vocabulary the catalog UI and onboarding both
// consume: styles, build types and the feed page size.
// ─────────────────────────────────────────────────────────────────────────────

export const STYLES = [
  { key: "medieval", label: "Medieval" },
  { key: "fantasy", label: "Fantasy" },
  { key: "sci-fi", label: "Sci-Fi" },
  { key: "cyberpunk", label: "Cyberpunk" },
  { key: "modern", label: "Modern" },
  { key: "realistic", label: "Realistic" },
  { key: "organic", label: "Organic" },
  { key: "terrain", label: "Terrain" },
  { key: "pvp", label: "PvP" },
  { key: "other", label: "Other" },
];

export const BUILD_TYPES = [
  { key: "spawn", label: "Spawn" },
  { key: "lobby", label: "Lobby" },
  { key: "hub", label: "Hub" },
  { key: "arena", label: "Arena" },
  { key: "map", label: "Map" },
  { key: "terrain", label: "Terrain" },
  { key: "kingdom", label: "Kingdom" },
  { key: "village", label: "Village" },
  { key: "decoration", label: "Decoration" },
  { key: "commission", label: "Custom Commission" },
];

// Twelve divides evenly into the feed's two (phone) and three (desktop)
// columns, so a page of results never ends on a lone card.
export const ITEMS_PER_PAGE = 12;
