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

export const ITEMS_PER_PAGE = 9;

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
