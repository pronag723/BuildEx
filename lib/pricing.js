// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Pricing helpers
// Single source of truth for the rates shape, size metadata, and
// kopeck ↔ ruble conversion.  Imported by the editor, the feed, and the
// public profile so every UI uses identical constants and formatters.
//
// DB shape (builder_profiles.rates):
//   { small:  { enabled: bool, blocks: int, price: int_kopecks },
//     medium: { … },
//     large:  { … } }
// ─────────────────────────────────────────────────────────────────────────────

export const SIZES = ["small", "medium", "large"];

export const SIZE_META = {
  small: {
    key: "small",
    label: "Small Build",
    icon: "🏠",
    hint: "Spawns, small arenas, starter hubs",
    defaultBlocks: 100,
    defaultPrice: 50000,   // kopecks = ₽500
    areaLabel: (blocks) => `Up to ${blocks}×${blocks} blocks`,
  },
  medium: {
    key: "medium",
    label: "Medium Build",
    icon: "🏛️",
    hint: "Hubs, lobbies, mid-size builds",
    defaultBlocks: 200,
    defaultPrice: 100000,  // kopecks = ₽1 000
    areaLabel: (blocks) => `Up to ${blocks}×${blocks} blocks`,
  },
  large: {
    key: "large",
    label: "Large Build",
    icon: "🏰",
    hint: "Kingdoms, networks, signature builds",
    defaultBlocks: 350,
    defaultPrice: 200000,  // kopecks = ₽2 000
    areaLabel: (blocks) => `${blocks}×${blocks} blocks and beyond`,
  },
};

/** Integer kopecks → whole rubles (truncated) */
export function kopecksToRubles(kopecks) {
  return Math.floor(Math.round(Number(kopecks) || 0) / 100);
}

/** Whole rubles → integer kopecks */
export function rublesToKopecks(rubles) {
  return Math.round((Number(rubles) || 0) * 100);
}

/** Format kopecks as a display string: "₽500", "₽1 500" */
export function formatPrice(kopecks) {
  const rubles = kopecksToRubles(kopecks);
  return "₽" + rubles.toLocaleString("ru-RU");
}

/**
 * Given a rates object from the DB { small:{enabled,blocks,price}, … },
 * returns the price (kopecks) of the cheapest enabled size, or 0.
 */
export function startsFromPrice(rates) {
  if (!rates || typeof rates !== "object") return 0;
  for (const key of SIZES) {
    const tier = rates[key];
    if (tier?.enabled && Number(tier.price) > 0) {
      return Number(tier.price);
    }
  }
  return 0;
}
