// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — block → color map for the world preview (Stage 7)
//
// Single source of truth for the colored-voxel render. We map a Minecraft block
// id (the `Name` from a chunk's block_states palette, e.g. "minecraft:oak_log")
// to an [r,g,b] triple (0–255). This is a v1 approximation, not a texture — the
// goal is a recognisable massing/colour render the buyer can rotate, not a
// pixel-accurate Minecraft view (that's the textured v2).
//
// Lookup is by exact id first, then by a coarse keyword heuristic so the
// thousands of block variants we don't enumerate still land on a sensible
// colour instead of the grey fallback. Air variants are handled by the parser
// (skipped before they ever reach here).
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_COLOR = [150, 150, 150]; // unmapped → neutral grey

// Exact ids → colour. Kept to the common building blocks; everything else falls
// through to the keyword heuristic below.
const EXACT = {
  "minecraft:stone": [127, 127, 127],
  "minecraft:cobblestone": [122, 122, 122],
  "minecraft:smooth_stone": [158, 158, 158],
  "minecraft:stone_bricks": [122, 122, 122],
  "minecraft:andesite": [136, 136, 137],
  "minecraft:diorite": [188, 188, 189],
  "minecraft:granite": [149, 103, 85],
  "minecraft:deepslate": [80, 80, 84],
  "minecraft:bedrock": [85, 85, 85],
  "minecraft:dirt": [134, 96, 67],
  "minecraft:coarse_dirt": [119, 85, 59],
  "minecraft:grass_block": [95, 159, 53],
  "minecraft:podzol": [91, 64, 28],
  "minecraft:mycelium": [111, 98, 101],
  "minecraft:sand": [219, 207, 163],
  "minecraft:red_sand": [190, 102, 33],
  "minecraft:sandstone": [216, 203, 156],
  "minecraft:gravel": [131, 127, 126],
  "minecraft:clay": [160, 166, 179],
  "minecraft:water": [63, 118, 228],
  "minecraft:lava": [217, 108, 28],
  "minecraft:ice": [125, 173, 255],
  "minecraft:packed_ice": [141, 180, 250],
  "minecraft:snow": [243, 250, 250],
  "minecraft:snow_block": [243, 250, 250],
  "minecraft:glass": [175, 213, 219],
  "minecraft:obsidian": [20, 18, 30],
  "minecraft:netherrack": [97, 38, 38],
  "minecraft:glowstone": [219, 178, 95],
  "minecraft:sea_lantern": [172, 199, 190],
  "minecraft:bricks": [150, 97, 83],
  "minecraft:bookshelf": [120, 88, 50],
  "minecraft:hay_block": [166, 138, 24],
  "minecraft:bee_nest": [203, 156, 73],
  "minecraft:gold_block": [246, 208, 62],
  "minecraft:iron_block": [220, 220, 220],
  "minecraft:diamond_block": [98, 219, 214],
  "minecraft:emerald_block": [42, 203, 115],
  "minecraft:netherite_block": [66, 61, 64],
  "minecraft:redstone_block": [175, 24, 5],
  "minecraft:lapis_block": [38, 67, 137],
  "minecraft:quartz_block": [235, 229, 222],
  "minecraft:prismarine": [99, 156, 151],
  "minecraft:water_source": [63, 118, 228],

  // Modern / decorative blocks commonly used in builds — without these they fall
  // through to a generic grey via the heuristic and the building loses its hue.
  "minecraft:smooth_quartz": [235, 229, 222],
  "minecraft:chiseled_quartz_block": [235, 229, 222],
  "minecraft:quartz_pillar": [235, 229, 222],
  "minecraft:quartz_bricks": [231, 224, 213],
  "minecraft:polished_andesite": [136, 136, 137],
  "minecraft:polished_diorite": [195, 195, 198],
  "minecraft:polished_granite": [154, 105, 84],
  "minecraft:polished_deepslate": [87, 87, 91],
  "minecraft:deepslate_bricks": [87, 87, 91],
  "minecraft:deepslate_tiles": [78, 78, 82],
  "minecraft:cobbled_deepslate": [80, 80, 84],
  "minecraft:blackstone": [42, 36, 41],
  "minecraft:polished_blackstone": [54, 49, 54],
  "minecraft:polished_blackstone_bricks": [54, 49, 54],
  "minecraft:gilded_blackstone": [72, 51, 36],
  "minecraft:basalt": [73, 70, 74],
  "minecraft:smooth_basalt": [73, 70, 74],
  "minecraft:tuff": [110, 110, 105],
  "minecraft:calcite": [223, 226, 220],
  "minecraft:dripstone_block": [134, 99, 76],
  "minecraft:end_stone": [219, 222, 158],
  "minecraft:end_stone_bricks": [219, 222, 158],
  "minecraft:purpur_block": [167, 122, 167],
  "minecraft:purpur_pillar": [167, 122, 167],
  "minecraft:nether_bricks": [44, 22, 27],
  "minecraft:red_nether_bricks": [70, 7, 9],
  "minecraft:warped_wart_block": [22, 117, 110],
  "minecraft:nether_wart_block": [115, 9, 9],
  "minecraft:shroomlight": [243, 175, 92],
  "minecraft:soul_sand": [82, 64, 50],
  "minecraft:soul_soil": [82, 64, 50],
  "minecraft:mud": [60, 57, 64],
  "minecraft:mud_bricks": [134, 105, 84],
  "minecraft:packed_mud": [149, 111, 79],
  "minecraft:mossy_cobblestone": [99, 117, 84],
  "minecraft:mossy_stone_bricks": [115, 132, 99],
  "minecraft:moss_block": [86, 122, 41],
  "minecraft:amethyst_block": [134, 102, 191],
  "minecraft:copper_block": [192, 107, 75],
  "minecraft:exposed_copper": [161, 124, 105],
  "minecraft:weathered_copper": [110, 168, 142],
  "minecraft:oxidized_copper": [85, 167, 145],
  "minecraft:cut_copper": [192, 107, 75],
  "minecraft:waxed_copper_block": [192, 107, 75],
  "minecraft:dark_prismarine": [55, 84, 66],
  "minecraft:prismarine_bricks": [99, 171, 158],
  "minecraft:terracotta": [152, 94, 67],
  "minecraft:crying_obsidian": [34, 13, 60],
  "minecraft:smooth_sandstone": [216, 203, 156],
  "minecraft:cut_sandstone": [216, 203, 156],
  "minecraft:chiseled_sandstone": [216, 203, 156],
  "minecraft:red_sandstone": [186, 99, 30],
  "minecraft:smooth_red_sandstone": [186, 99, 30],
  "minecraft:honeycomb_block": [229, 152, 41],
  "minecraft:bone_block": [228, 224, 198],
  "minecraft:slime_block": [122, 195, 100],
  "minecraft:honey_block": [240, 168, 27],
  "minecraft:tinted_glass": [42, 42, 56],
  "minecraft:bamboo_block": [195, 184, 65],
  "minecraft:bamboo_planks": [194, 158, 78],
  "minecraft:cherry_planks": [228, 175, 175],
  "minecraft:cherry_log": [80, 49, 56],
  "minecraft:mangrove_planks": [119, 53, 50],
  "minecraft:mangrove_log": [69, 33, 30],
};

// Wool / concrete / terracotta share the 16 dye colours. We resolve the dye
// from the id and tint a base, so e.g. "lime_concrete" and "lime_wool" both
// land on the right hue without enumerating every block × colour combination.
const DYES = {
  white: [233, 236, 236],
  orange: [240, 118, 19],
  magenta: [189, 68, 179],
  light_blue: [58, 175, 217],
  yellow: [248, 197, 39],
  lime: [112, 185, 25],
  pink: [237, 141, 172],
  gray: [62, 68, 71],
  light_gray: [142, 142, 134],
  cyan: [21, 137, 145],
  purple: [121, 42, 172],
  blue: [53, 57, 157],
  brown: [114, 71, 40],
  green: [84, 109, 27],
  red: [160, 39, 34],
  black: [29, 29, 33],
};

function dyeFor(name) {
  // Longest key first so "light_blue"/"light_gray" win over "blue"/"gray".
  for (const key of ["light_blue", "light_gray", "white", "orange", "magenta",
    "yellow", "lime", "pink", "gray", "cyan", "purple", "blue", "brown",
    "green", "red", "black"]) {
    if (name.includes(key)) return DYES[key];
  }
  return null;
}

// Coarse keyword buckets for the long tail (logs, planks, leaves, etc.).
function heuristic(name) {
  const dye = dyeFor(name);
  if (dye && (name.includes("wool") || name.includes("concrete") ||
    name.includes("terracotta") || name.includes("glazed") ||
    name.includes("stained_glass") || name.includes("carpet") ||
    name.includes("shulker") || name.includes("bed"))) {
    return dye;
  }
  if (name.includes("leaves")) return [60, 130, 50];
  if (name.includes("planks") || name.includes("log") || name.includes("wood") ||
    name.includes("stem") || name.includes("fence") || name.includes("stairs") &&
    name.includes("oak")) {
    if (name.includes("spruce") || name.includes("dark_oak")) return [88, 64, 38];
    if (name.includes("birch")) return [196, 178, 123];
    if (name.includes("acacia")) return [168, 90, 50];
    if (name.includes("jungle")) return [160, 115, 80];
    if (name.includes("warped")) return [43, 104, 99];
    if (name.includes("crimson")) return [101, 48, 70];
    return [162, 130, 78]; // oak-ish default wood
  }
  if (name.includes("grass") || name.includes("vine") || name.includes("fern") ||
    name.includes("moss") || name.includes("lily")) return [86, 145, 56];
  if (name.includes("flower") || name.includes("tulip") || name.includes("poppy")) {
    return [200, 90, 110];
  }
  if (name.includes("water")) return [63, 118, 228];
  if (name.includes("glass")) return [175, 213, 219];
  // Order matters: blackstone/end_stone/sandstone are matched BEFORE plain
  // "stone" so a generic stone fallback doesn't claim them and paint the whole
  // build grey.
  if (name.includes("blackstone")) return [54, 49, 54];
  if (name.includes("end_stone")) return [219, 222, 158];
  if (name.includes("sandstone")) {
    if (name.includes("red")) return [186, 99, 30];
    return [216, 203, 156];
  }
  if (name.includes("deepslate")) return [80, 80, 84];
  if (name.includes("basalt")) return [73, 70, 74];
  if (name.includes("calcite")) return [223, 226, 220];
  if (name.includes("tuff")) return [110, 110, 105];
  if (name.includes("amethyst")) return [134, 102, 191];
  if (name.includes("purpur")) return [167, 122, 167];
  if (name.includes("copper")) {
    if (name.includes("oxidized")) return [85, 167, 145];
    if (name.includes("weathered")) return [110, 168, 142];
    if (name.includes("exposed")) return [161, 124, 105];
    return [192, 107, 75];
  }
  if (name.includes("quartz")) return [235, 229, 222];
  if (name.includes("prismarine")) {
    if (name.includes("dark")) return [55, 84, 66];
    return [99, 156, 151];
  }
  if (name.includes("nether_brick") || name.includes("nether_bricks")) {
    return name.includes("red") ? [70, 7, 9] : [44, 22, 27];
  }
  if (name.includes("nether")) return [97, 38, 38];
  if (name.includes("terracotta")) return [152, 94, 67];
  if (name.includes("stone") || name.includes("cobble")) return [127, 127, 127];
  if (name.includes("sand")) return [219, 207, 163];
  if (name.includes("dirt") || name.includes("mud")) return [134, 96, 67];
  if (name.includes("brick")) return [150, 97, 83];
  if (name.includes("ice")) return [125, 173, 255];
  if (name.includes("snow")) return [243, 250, 250];
  if (dye) return dye;
  return null;
}

// Resolve a block id to an [r,g,b]. Always returns a colour (never null).
export function colorForBlock(name) {
  const exact = EXACT[name];
  if (exact) return exact;
  return heuristic(name) || DEFAULT_COLOR;
}

// Block ids that are "nothing" for preview purposes — never rendered.
const AIR = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

export function isAir(name) {
  return !name || AIR.has(name);
}
