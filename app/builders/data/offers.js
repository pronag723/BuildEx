// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Mock offer database
// To migrate to Supabase, replace `offers` with async queries and pass
// filtered results from a server component / server action.
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
  { key: "medieval", label: "Medieval", emoji: "🏰" },
  { key: "fantasy", label: "Fantasy", emoji: "✨" },
  { key: "sci-fi", label: "Sci-Fi", emoji: "🚀" },
  { key: "cyberpunk", label: "Cyberpunk", emoji: "🌃" },
  { key: "modern", label: "Modern", emoji: "🏙️" },
  { key: "realistic", label: "Realistic", emoji: "📷" },
  { key: "organic", label: "Organic", emoji: "🌿" },
  { key: "terrain", label: "Terrain", emoji: "⛰️" },
  { key: "pvp", label: "PvP", emoji: "⚔️" },
  { key: "other", label: "Other", emoji: "🎨" },
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

// ─── Builder profiles ────────────────────────────────────────────────────────

const builders = {
  pixelforge: {
    username: "pixelforge",
    display_name: "PixelForge",
    avatar: "https://picsum.photos/id/64/64/64",
    rank: "master",
    avg_rating: 4.98,
  },
  blockvortex: {
    username: "blockvortex",
    display_name: "BlockVortex",
    avatar: "https://picsum.photos/id/65/64/64",
    rank: "expert",
    avg_rating: 4.92,
  },
  craftempire: {
    username: "craftempire",
    display_name: "CraftEmpire",
    avatar: "https://picsum.photos/id/66/64/64",
    rank: "advanced",
    avg_rating: 4.78,
  },
  aquabuilds: {
    username: "aquabuilds",
    display_name: "AquaBuilds",
    avatar: "https://picsum.photos/id/67/64/64",
    rank: "expert",
    avg_rating: 4.88,
  },
  summitbuilds: {
    username: "summitbuilds",
    display_name: "SummitBuilds",
    avatar: "https://picsum.photos/id/68/64/64",
    rank: "rookie",
    avg_rating: 4.65,
  },
  naturecraft: {
    username: "naturecraft",
    display_name: "NatureCraft",
    avatar: "https://picsum.photos/id/1012/64/64",
    rank: "advanced",
    avg_rating: 4.82,
  },
  dragonbuilds: {
    username: "dragonbuilds",
    display_name: "DragonBuilds",
    avatar: "https://picsum.photos/id/1027/64/64",
    rank: "master",
    avg_rating: 4.96,
  },
  crownccraft: {
    username: "crownccraft",
    display_name: "CrownCraft",
    avatar: "https://picsum.photos/id/1074/64/64",
    rank: "expert",
    avg_rating: 4.90,
  },
  zenblocks: {
    username: "zenblocks",
    display_name: "ZenBlocks",
    avatar: "https://picsum.photos/id/1025/64/64",
    rank: "advanced",
    avg_rating: 4.85,
  },
  spawnking: {
    username: "spawnking",
    display_name: "SpawnKing",
    avatar: "https://picsum.photos/id/1056/64/64",
    rank: "rookie",
    avg_rating: 4.60,
  },
  voidforge: {
    username: "voidforge",
    display_name: "VoidForge",
    avatar: "https://picsum.photos/id/1072/64/64",
    rank: "expert",
    avg_rating: 4.94,
  },
  neoncraft: {
    username: "neoncraft",
    display_name: "NeonCraft",
    avatar: "https://picsum.photos/id/1048/64/64",
    rank: "master",
    avg_rating: 4.97,
  },
};

// Shorthand for thumbnail paths
const th = [
  "/projects/elysium-cathedral.png",    // 0
  "/projects/teal-fantasy-palace.png",  // 1
  "/projects/gothic-castle-night.png",  // 2
  "/projects/ocean-cathedral.png",      // 3
  "/projects/floating-island-palace.png", // 4
  "/projects/cherry-palace.png",        // 5
  "/projects/sky-temple-complex.png",   // 6
  "/projects/cloud-citadel.png",        // 7
  "/projects/throne-hall.png",          // 8
  "/projects/japanese-hall.png",        // 9
];

// ─── Offer catalog ───────────────────────────────────────────────────────────

export const offers = [
  {
    id: "1",
    title: "Epic Fantasy Hub with Dragon Tower",
    description:
      "A breathtaking fantasy hub featuring a massive dragon tower, floating islands, and custom particle effects. Perfect for large server networks.",
    style: "fantasy",
    build_type: "hub",
    starting_price: 1250,
    delivery_days: 7,
    revisions: 3,
    thumbnail: th[0],
    builder: builders.pixelforge,
    rating: 4.98,
    order_count: 47,
    tags: ["fantasy", "dragon", "particles"],
    created_at: "2025-05-10",
  },
  {
    id: "2",
    title: "Neon District Sci-Fi Spawn",
    description:
      "Futuristic sci-fi spawn with neon lighting, holographic displays, and a bustling cyberpunk city aesthetic.",
    style: "sci-fi",
    build_type: "spawn",
    starting_price: 890,
    delivery_days: 5,
    revisions: 2,
    thumbnail: th[1],
    builder: builders.blockvortex,
    rating: 4.92,
    order_count: 31,
    tags: ["sci-fi", "neon", "cyberpunk"],
    created_at: "2025-05-08",
  },
  {
    id: "3",
    title: "Medieval Kingdom Castle",
    description:
      "Authentic medieval castle with full interior, throne room, dungeons, and outer walls. Includes surrounding village.",
    style: "medieval",
    build_type: "kingdom",
    starting_price: 670,
    delivery_days: 6,
    revisions: 2,
    thumbnail: th[2],
    builder: builders.craftempire,
    rating: 4.78,
    order_count: 19,
    tags: ["medieval", "castle", "kingdom"],
    created_at: "2025-05-05",
  },
  {
    id: "4",
    title: "Atlantis Underwater Lobby",
    description:
      "Stunning underwater lobby with glowing bioluminescent plants, ancient ruins, and glass domes.",
    style: "fantasy",
    build_type: "lobby",
    starting_price: 1100,
    delivery_days: 8,
    revisions: 3,
    thumbnail: th[3],
    builder: builders.aquabuilds,
    rating: 4.88,
    order_count: 28,
    tags: ["underwater", "fantasy", "ruins"],
    created_at: "2025-05-12",
  },
  {
    id: "5",
    title: "Futuristic City Hub",
    description:
      "Complete futuristic city hub with skyline, transport tubes, NPC shops, and multiple portals.",
    style: "modern",
    build_type: "hub",
    starting_price: 950,
    delivery_days: 9,
    revisions: 4,
    thumbnail: th[4],
    builder: builders.pixelforge,
    rating: 4.97,
    order_count: 52,
    tags: ["modern", "city", "hub"],
    created_at: "2025-05-15",
  },
  {
    id: "6",
    title: "Mountain Fortress Spawn",
    description:
      "Epic mountain fortress spawn carved into cliffside rock with waterfalls and hidden chambers.",
    style: "medieval",
    build_type: "spawn",
    starting_price: 780,
    delivery_days: 6,
    revisions: 2,
    thumbnail: th[5],
    builder: builders.summitbuilds,
    rating: 4.65,
    order_count: 8,
    tags: ["mountain", "fortress", "medieval"],
    created_at: "2025-04-28",
  },
  {
    id: "7",
    title: "Jungle Temple Ruins Decoration",
    description:
      "Dense jungle temple complex with crumbling ruins, vine overgrowth, and ancient treasures.",
    style: "organic",
    build_type: "decoration",
    starting_price: 920,
    delivery_days: 5,
    revisions: 3,
    thumbnail: th[6],
    builder: builders.naturecraft,
    rating: 4.82,
    order_count: 22,
    tags: ["jungle", "ruins", "organic"],
    created_at: "2025-05-02",
  },
  {
    id: "8",
    title: "Dragon Citadel PvP Arena",
    description:
      "Massive dragon citadel arena designed for large-scale PvP battles with multiple combat zones and spectator stands.",
    style: "fantasy",
    build_type: "arena",
    starting_price: 1450,
    delivery_days: 10,
    revisions: 3,
    thumbnail: th[7],
    builder: builders.dragonbuilds,
    rating: 4.96,
    order_count: 41,
    tags: ["dragon", "arena", "pvp"],
    created_at: "2025-05-14",
  },
  {
    id: "9",
    title: "Royal Medieval Great Hall",
    description:
      "Stunning great hall with vaulted ceilings, heraldic banners, and a grand throne for your server.",
    style: "medieval",
    build_type: "decoration",
    starting_price: 1320,
    delivery_days: 7,
    revisions: 3,
    thumbnail: th[8],
    builder: builders.crownccraft,
    rating: 4.90,
    order_count: 34,
    tags: ["medieval", "hall", "royal"],
    created_at: "2025-05-11",
  },
  {
    id: "10",
    title: "Sakura Zen Garden Spawn",
    description:
      "Peaceful Japanese-style spawn with cherry blossom trees, koi ponds, and zen pathways.",
    style: "organic",
    build_type: "spawn",
    starting_price: 840,
    delivery_days: 5,
    revisions: 2,
    thumbnail: th[9],
    builder: builders.zenblocks,
    rating: 4.85,
    order_count: 26,
    tags: ["japanese", "zen", "nature"],
    created_at: "2025-05-07",
  },
  {
    id: "11",
    title: "Cyber Arena PvP Map",
    description:
      "High-octane cyberpunk PvP arena with multiple lanes, elevated platforms, and neon accents.",
    style: "sci-fi",
    build_type: "arena",
    starting_price: 580,
    delivery_days: 4,
    revisions: 2,
    thumbnail: th[1],
    builder: builders.spawnking,
    rating: 4.60,
    order_count: 6,
    tags: ["pvp", "cyber", "arena"],
    created_at: "2025-04-22",
  },
  {
    id: "12",
    title: "Void Dimension Hub Portal",
    description:
      "Otherworldly void-themed hub with floating platforms, energy beams, and mystical portals.",
    style: "sci-fi",
    build_type: "hub",
    starting_price: 1180,
    delivery_days: 8,
    revisions: 3,
    thumbnail: th[4],
    builder: builders.voidforge,
    rating: 4.94,
    order_count: 37,
    tags: ["void", "sci-fi", "portals"],
    created_at: "2025-05-16",
  },
  {
    id: "13",
    title: "Neon City Lobby Experience",
    description:
      "Vibrant neon city lobby with animated lights, billboard ads, and futuristic architecture.",
    style: "modern",
    build_type: "lobby",
    starting_price: 760,
    delivery_days: 5,
    revisions: 2,
    thumbnail: th[0],
    builder: builders.neoncraft,
    rating: 4.97,
    order_count: 63,
    tags: ["neon", "modern", "city"],
    created_at: "2025-05-18",
  },
  {
    id: "14",
    title: "Fantasy Village Settlement",
    description:
      "Charming fantasy village with unique NPC houses, a marketplace, and a hidden wizard tower.",
    style: "fantasy",
    build_type: "village",
    starting_price: 690,
    delivery_days: 6,
    revisions: 2,
    thumbnail: th[5],
    builder: builders.craftempire,
    rating: 4.72,
    order_count: 14,
    tags: ["fantasy", "village", "npcs"],
    created_at: "2025-04-30",
  },
  {
    id: "15",
    title: "Glacier Ice Kingdom Spawn",
    description:
      "Frozen tundra kingdom spawn with ice castles, igloos, and aurora borealis particle effects.",
    style: "fantasy",
    build_type: "spawn",
    starting_price: 1050,
    delivery_days: 7,
    revisions: 3,
    thumbnail: th[3],
    builder: builders.pixelforge,
    rating: 4.98,
    order_count: 39,
    tags: ["ice", "fantasy", "kingdom"],
    created_at: "2025-05-19",
  },
  {
    id: "16",
    title: "Desert Ruins PvP Arena",
    description:
      "Ancient desert ruins arena with sand dunes, ruined pillars, and secret underground chambers.",
    style: "pvp",
    build_type: "arena",
    starting_price: 450,
    delivery_days: 3,
    revisions: 1,
    thumbnail: th[7],
    builder: builders.spawnking,
    rating: 4.55,
    order_count: 4,
    tags: ["desert", "pvp", "ruins"],
    created_at: "2025-04-18",
  },
  {
    id: "17",
    title: "Ocean Platform Hub",
    description:
      "Sprawling ocean platform hub with interconnected docks, ships, and a lighthouse tower centerpiece.",
    style: "modern",
    build_type: "hub",
    starting_price: 880,
    delivery_days: 7,
    revisions: 3,
    thumbnail: th[6],
    builder: builders.aquabuilds,
    rating: 4.88,
    order_count: 21,
    tags: ["ocean", "ships", "modern"],
    created_at: "2025-05-06",
  },
  {
    id: "18",
    title: "Ancient Stone Colosseum",
    description:
      "Massive roman-style colosseum with spectator stands, underground gladiator chambers, and detailed stonework.",
    style: "medieval",
    build_type: "arena",
    starting_price: 1600,
    delivery_days: 12,
    revisions: 4,
    thumbnail: th[8],
    builder: builders.dragonbuilds,
    rating: 4.96,
    order_count: 29,
    tags: ["colosseum", "arena", "ancient"],
    created_at: "2025-05-13",
  },
  {
    id: "19",
    title: "Magical Forest Village",
    description:
      "Enchanted forest village with treehouse homes, glowing mushrooms, and a fairy-tale aesthetic.",
    style: "organic",
    build_type: "village",
    starting_price: 750,
    delivery_days: 6,
    revisions: 2,
    thumbnail: th[9],
    builder: builders.naturecraft,
    rating: 4.80,
    order_count: 17,
    tags: ["forest", "magic", "village"],
    created_at: "2025-05-01",
  },
  {
    id: "20",
    title: "Space Station Sci-Fi Lobby",
    description:
      "Immersive space station lobby with rotating rings, zero-gravity sections, and stellar views.",
    style: "sci-fi",
    build_type: "lobby",
    starting_price: 1380,
    delivery_days: 10,
    revisions: 3,
    thumbnail: th[2],
    builder: builders.voidforge,
    rating: 4.94,
    order_count: 33,
    tags: ["space", "station", "sci-fi"],
    created_at: "2025-05-17",
  },
  {
    id: "21",
    title: "SkyWars PvP Hub",
    description:
      "Clean and competitive SkyWars-style lobby hub with multiple minigame portals and leaderboard displays.",
    style: "pvp",
    build_type: "hub",
    starting_price: 420,
    delivery_days: 3,
    revisions: 1,
    thumbnail: th[4],
    builder: builders.spawnking,
    rating: 4.58,
    order_count: 11,
    tags: ["skywars", "pvp", "competitive"],
    created_at: "2025-04-25",
  },
  {
    id: "22",
    title: "Gothic Cathedral Spawn",
    description:
      "Dark gothic cathedral spawn with stained glass windows, gargoyles, and a haunted atmosphere.",
    style: "medieval",
    build_type: "spawn",
    starting_price: 970,
    delivery_days: 7,
    revisions: 3,
    thumbnail: th[2],
    builder: builders.crownccraft,
    rating: 4.91,
    order_count: 24,
    tags: ["gothic", "cathedral", "dark"],
    created_at: "2025-05-09",
  },
  {
    id: "23",
    title: "Bamboo Japanese Village",
    description:
      "Serene Japanese bamboo village with rice fields, traditional architecture, and koi garden.",
    style: "organic",
    build_type: "village",
    starting_price: 620,
    delivery_days: 5,
    revisions: 2,
    thumbnail: th[9],
    builder: builders.zenblocks,
    rating: 4.83,
    order_count: 18,
    tags: ["japanese", "bamboo", "peaceful"],
    created_at: "2025-05-03",
  },
  {
    id: "24",
    title: "Modern Skyscraper City Spawn",
    description:
      "Contemporary city spawn with towering skyscrapers, busy streets, and rooftop helicopter pads.",
    style: "modern",
    build_type: "spawn",
    starting_price: 830,
    delivery_days: 6,
    revisions: 2,
    thumbnail: th[1],
    builder: builders.neoncraft,
    rating: 4.95,
    order_count: 44,
    tags: ["modern", "city", "skyscraper"],
    created_at: "2025-05-20",
  },
];

// ─── Extended builder profiles (detail page) ────────────────────────────────
// Supabase migration: SELECT * FROM builder_profiles WHERE username = $1

export const BUILDER_PROFILES = {
  pixelforge: {
    bio: "Master-level builder with 5+ years crafting epic Minecraft worlds. Specialising in large-scale fantasy and sci-fi builds with advanced custom particle effects and immersive environments.",
    response_time: "~1 hour",
    online: true,
    completed_projects: 99,
    specialties: ["Fantasy Hubs", "Custom Particles", "Large Builds", "Sci-Fi"],
    member_since: "2021-06-15",
  },
  blockvortex: {
    bio: "Expert builder focused on sci-fi and cyberpunk aesthetics. Known for precise neon lighting, holographic displays, and futuristic architecture that transforms any server.",
    response_time: "~2 hours",
    online: false,
    completed_projects: 54,
    specialties: ["Sci-Fi", "Neon Builds", "Cyberpunk", "Spawns"],
    member_since: "2022-01-10",
  },
  craftempire: {
    bio: "Advanced builder with a passion for historical accuracy and detailed medieval construction. Every build tells a story through careful stonework and authentic design.",
    response_time: "~3 hours",
    online: true,
    completed_projects: 33,
    specialties: ["Medieval", "Castles", "Villages", "Interiors"],
    member_since: "2022-08-22",
  },
  aquabuilds: {
    bio: "Expert builder specialising in underwater and ocean-themed builds. From bioluminescent grottos to ancient Atlantean ruins, every project is a dive into another world.",
    response_time: "~2 hours",
    online: true,
    completed_projects: 49,
    specialties: ["Underwater", "Ocean Themes", "Lobbies", "Fantasy"],
    member_since: "2021-11-04",
  },
  summitbuilds: {
    bio: "Rookie builder with a talent for mountainous terrain and fortress builds. Still climbing the ranks but delivering solid, functional builds at great value.",
    response_time: "~4 hours",
    online: false,
    completed_projects: 14,
    specialties: ["Terrain", "Fortresses", "PvP Maps", "Spawns"],
    member_since: "2024-02-18",
  },
  naturecraft: {
    bio: "Advanced builder and nature enthusiast creating lush organic environments. Jungles, forests, and island biomes feel genuinely alive when NatureCraft is on the job.",
    response_time: "~2 hours",
    online: true,
    completed_projects: 39,
    specialties: ["Organic", "Jungle", "Forest", "Terraforming"],
    member_since: "2022-05-30",
  },
  dragonbuilds: {
    bio: "Master builder with unmatched experience in large-scale arena and fantasy builds. Holder of the BuildEx Most Ordered Arena record — three years running.",
    response_time: "~1 hour",
    online: true,
    completed_projects: 70,
    specialties: ["Arenas", "Fantasy", "PvP", "Large Builds"],
    member_since: "2020-09-01",
  },
  crownccraft: {
    bio: "Expert builder with a love for gothic and royal architecture. CrownCraft's interiors are legendary — every great hall, cathedral, and throne room is a work of art.",
    response_time: "~2 hours",
    online: false,
    completed_projects: 58,
    specialties: ["Gothic", "Medieval", "Interiors", "Decorations"],
    member_since: "2021-04-14",
  },
  zenblocks: {
    bio: "Advanced builder dedicated to peaceful, contemplative builds. Specialises in Japanese, zen, and organic architecture — every project carries a sense of calm and beauty.",
    response_time: "~3 hours",
    online: true,
    completed_projects: 44,
    specialties: ["Japanese", "Zen", "Organic", "Villages"],
    member_since: "2022-03-07",
  },
  spawnking: {
    bio: "Rookie builder focused on efficient, clean spawns and PvP maps. Great value for smaller budgets with fast delivery and solid foundational builds.",
    response_time: "~5 hours",
    online: false,
    completed_projects: 15,
    specialties: ["PvP", "Spawns", "Hubs", "Budget Builds"],
    member_since: "2024-06-20",
  },
  voidforge: {
    bio: "Expert builder with an obsession for sci-fi, void, and interdimensional aesthetics. VoidForge builds defy physics and immerse players in something truly otherworldly.",
    response_time: "~1 hour",
    online: true,
    completed_projects: 70,
    specialties: ["Sci-Fi", "Void", "Hubs", "Space Builds"],
    member_since: "2021-07-12",
  },
  neoncraft: {
    bio: "Master builder and modern architecture specialist. NeonCraft's city builds and neon environments are consistently ranked as the most visually impressive spawns on BuildEx.",
    response_time: "~1 hour",
    online: true,
    completed_projects: 107,
    specialties: ["Modern", "Neon", "Cities", "Spawns"],
    member_since: "2020-12-01",
  },
};

// ─── Default feature sets per build type ────────────────────────────────────
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

// ─── Per-offer detail overrides (images, features) ──────────────────────────
// Supabase migration: SELECT * FROM offer_images WHERE offer_id = $1 ORDER BY position ASC

function imgs(seed, ...extra) {
  return [
    `https://picsum.photos/seed/${seed}-1/900/560`,
    `https://picsum.photos/seed/${seed}-2/900/560`,
    `https://picsum.photos/seed/${seed}-3/900/560`,
    ...extra.map((s) => `https://picsum.photos/seed/${s}/900/560`),
  ];
}

export const OFFER_DETAILS = {
  "1":  { images: imgs("hub-fantasy-1", "hub1-d", "hub1-e") },
  "2":  { images: imgs("scifi-spawn-2", "scifi2-d") },
  "3":  { images: imgs("medieval-3",    "med3-d",  "med3-e") },
  "4":  { images: imgs("underwater-4",  "aqua4-d") },
  "5":  { images: imgs("city-hub-5",    "city5-d", "city5-e") },
  "6":  { images: imgs("mountain-6",    "mount6-d") },
  "7":  { images: imgs("jungle-7",      "jung7-d",  "jung7-e") },
  "8":  { images: imgs("dragon-8",      "drag8-d",  "drag8-e") },
  "9":  { images: imgs("great-hall-9",  "hall9-d") },
  "10": { images: imgs("zen-10",        "zen10-d",  "zen10-e") },
  "11": { images: imgs("pvp-11",        "pvp11-d") },
  "12": { images: imgs("void-12",       "void12-d", "void12-e") },
  "13": { images: imgs("neon-13",       "neon13-d", "neon13-e") },
  "14": { images: imgs("village-14",    "vil14-d") },
  "15": { images: imgs("ice-15",        "ice15-d",  "ice15-e") },
  "16": { images: imgs("desert-16",     "des16-d") },
  "17": { images: imgs("ocean-17",      "oce17-d",  "oce17-e") },
  "18": { images: imgs("colosseum-18",  "col18-d",  "col18-e") },
  "19": { images: imgs("forest-19",     "for19-d") },
  "20": { images: imgs("space-20",      "spa20-d",  "spa20-e") },
  "21": { images: imgs("skywars-21",    "sky21-d") },
  "22": { images: imgs("gothic-22",     "goth22-d", "goth22-e") },
  "23": { images: imgs("bamboo-23",     "bam23-d") },
  "24": { images: imgs("city-24",       "cit24-d",  "cit24-e") },
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
