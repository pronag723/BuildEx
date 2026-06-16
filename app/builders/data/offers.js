// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Catalog constants + (formerly) seeded demo data
//
// The hardcoded demo builders/offers that lived here predated the real Supabase
// user database. They were the source of the old "bot" profile pages
// (/builders/profile/<seeded-username>) and demo offer pages
// (/builders/<offerId>) — both generated purely from this file via
// generateStaticParams. Now that the catalog feed and profiles load real
// builders from Supabase (fetchBuilders / fetchBuilderByUsername), that demo
// data is gone: `offers`, `BUILDER_PROFILES`, and `OFFER_DETAILS` are empty, so
// no bot pages are generated and `getBuilder` resolves nothing.
//
// The shared CONSTANTS below (ranks, styles, build types, rating options, etc.)
// are still real configuration consumed across the catalog UI and are kept.
// ─────────────────────────────────────────────────────────────────────────────

export const RANKS = {
  rookie: {
    key: "rookie",
    label: "Rookie",
    textClass: "text-slate-400",
    bgClass: "bg-slate-500/20",
    borderClass: "border-slate-500/30",
    dotColor: "#94a3b8",
  },
  advanced: {
    key: "advanced",
    label: "Advanced",
    textClass: "text-blue-400",
    bgClass: "bg-blue-500/20",
    borderClass: "border-blue-500/30",
    dotColor: "#60a5fa",
  },
  expert: {
    key: "expert",
    label: "Expert",
    textClass: "text-violet-400",
    bgClass: "bg-violet-500/20",
    borderClass: "border-violet-500/30",
    dotColor: "#a78bfa",
  },
  master: {
    key: "master",
    label: "Master",
    textClass: "text-amber-400",
    bgClass: "bg-amber-500/20",
    borderClass: "border-amber-500/30",
    dotColor: "#fbbf24",
  },
};

export const STYLES = [
  { key: "medieval", label: "Medieval", icon: "castle" },
  { key: "fantasy", label: "Fantasy", icon: "sparkles" },
  { key: "sci-fi", label: "Sci-Fi", icon: "rocket" },
  { key: "cyberpunk", label: "Cyberpunk", icon: "cyberpunk" },
  { key: "modern", label: "Modern", icon: "modern" },
  { key: "realistic", label: "Realistic", icon: "camera" },
  { key: "organic", label: "Organic", icon: "leaf" },
  { key: "terrain", label: "Terrain", icon: "mountain" },
  { key: "pvp", label: "PvP", icon: "swords" },
  { key: "other", label: "Other", icon: "palette" },
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

export const SORT_OPTIONS = [
  { key: "newest", label: "Newest First" },
  { key: "rating", label: "Highest Rated" },
  { key: "price_asc", label: "Price: Low → High" },
  { key: "price_desc", label: "Price: High → Low" },
  { key: "orders", label: "Most Orders" },
];

export const RATING_OPTIONS = [
  { value: 0, label: "All ratings" },
  { value: 4, label: "4★ & up" },
  { value: 4.5, label: "4.5★ & up" },
  { value: 5, label: "5★ only" },
];

export const ITEMS_PER_PAGE = 9;

// ─── Seeded demo data (removed) ──────────────────────────────────────────────
// Empty now that real builders come from Supabase. Kept as exports so the
// catalog/offer modules that still import them resolve cleanly; with these
// empty, no demo "bot" profile or offer pages are generated.
export const offers = [];
export const BUILDER_PROFILES = {};
export const OFFER_DETAILS = {};

// ─── Default feature sets per build type ────────────────────────────────────
// Real configuration used by the offer/order UI to describe what each build
// type includes — not demo data, so retained.
export const FEATURES_BY_TYPE = {
  hub: [
    "Full custom hub layout & design",
    "Multiple portal integration zones",
    "NPC shop placement & decoration",
    "Custom particle effects included",
    "WorldEdit-ready schematic (.schem)",
  ],
  spawn: [
    "Custom spawn island or area design",
    "Directional signage & pathways",
    "Tutorial introduction path",
    "World border decoration",
    "WorldEdit-ready schematic (.schem)",
  ],
  lobby: [
    "Full lobby design & theming",
    "Game portal & queue zones",
    "AFK and waiting areas",
    "Cosmetic display stands",
    "WorldEdit-ready schematic (.schem)",
  ],
  arena: [
    "Multi-level combat zones",
    "Spectator stands & viewing areas",
    "Balanced spawn platforms",
    "Environmental obstacles & hazards",
    "WorldEdit-ready schematic (.schem)",
  ],
  decoration: [
    "Custom decorative centrepiece",
    "Interior & exterior detailing",
    "Custom landscaping & terraforming",
    "Ambient lighting & atmosphere",
    "WorldEdit-ready schematic (.schem)",
  ],
  kingdom: [
    "Full castle or keep structure",
    "Surrounding settlement & walls",
    "Underground dungeon system",
    "Throne room & great hall",
    "WorldEdit-ready schematic (.schem)",
  ],
  village: [
    "Multiple unique building designs",
    "Town square & gathering area",
    "Market district & stalls",
    "Hidden secrets & easter eggs",
    "WorldEdit-ready schematic (.schem)",
  ],
};

// ─── Filtering & sorting helpers (pure functions, easy to move server-side) ──

export function filterOffers(offers, filters) {
  const {
    query = "",
    styles = [],
    buildTypes = [],
    minPrice = 0,
    maxPrice = 0,
    minRating = 0,
    ranks = [],
  } = filters;

  return offers.filter((offer) => {
    if (query) {
      const q = query.toLowerCase();
      const match =
        offer.title.toLowerCase().includes(q) ||
        offer.builder.display_name.toLowerCase().includes(q) ||
        offer.tags.some((t) => t.toLowerCase().includes(q)) ||
        offer.style.toLowerCase().includes(q) ||
        offer.build_type.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (styles.length > 0 && !styles.includes(offer.style)) return false;
    if (buildTypes.length > 0 && !buildTypes.includes(offer.build_type)) return false;
    if (minPrice > 0 && offer.starting_price < minPrice) return false;
    if (maxPrice > 0 && offer.starting_price > maxPrice) return false;
    if (minRating > 0 && offer.rating < minRating) return false;
    if (ranks.length > 0 && !ranks.includes(offer.builder.rank)) return false;

    return true;
  });
}

export function sortOffers(offers, sort) {
  const result = [...offers];

  switch (sort) {
    case "rating":
      return result.sort((a, b) => b.rating - a.rating);
    case "price_asc":
      return result.sort((a, b) => a.starting_price - b.starting_price);
    case "price_desc":
      return result.sort((a, b) => b.starting_price - a.starting_price);
    case "orders":
      return result.sort((a, b) => b.order_count - a.order_count);
    case "newest":
    default:
      return result.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
  }
}
