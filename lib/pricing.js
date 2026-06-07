// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Pricing helpers
// Single source of truth for the rates shape, size metadata, and
// kopeck ↔ ruble conversion.  Imported by the editor, the feed, and the
// public profile so every UI uses identical constants and formatters.
//
// DB shape (builder_profiles.rates) — a keyed object of tiers. The three
// built-in keys (small/medium/large) are always understood; builders may add
// any number of extra tiers under generated keys (e.g. "c1717…"):
//   { small:  { enabled, blocks, price_kopecks, label?, icon?, pos? },
//     medium: { … },
//     large:  { … },
//     c1717…: { enabled, blocks, price_kopecks, label, icon, pos } }
//
// `pos` carries display order (jsonb does not preserve key order). `label`/
// `icon` are stored for every tier so custom sizes render with a name; for the
// built-ins they fall back to SIZE_META when absent (legacy rows).
// ─────────────────────────────────────────────────────────────────────────────

export const SIZES = ["small", "medium", "large"];

// Default display order for the built-in tiers when a row predates `pos`.
const BUILTIN_POS = { small: 0, medium: 1, large: 2 };

// Icon shown for builder-added custom tiers.
export const CUSTOM_TIER_ICON = "📦";

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
 * Normalize a DB rates object into an ordered array of display tiers.
 * Tolerates the legacy {blocks, from, to} shape and rows missing label/icon/pos.
 * Returns: [{ id, label, icon, hint, blocks, price (kopecks), enabled }] sorted
 * by `pos` (built-ins first, then custom tiers in insertion order).
 */
export function ratesToTiers(rates) {
  if (!rates || typeof rates !== "object") return [];

  const tiers = Object.entries(rates).map(([id, raw], index) => {
    const v = raw && typeof raw === "object" ? raw : {};
    const meta = SIZE_META[id];

    // Legacy price-range shape stored kopecks under `from`.
    const legacy = "from" in v && !("price" in v);
    const price = legacy ? Number(v.from) || 0 : Number(v.price) || 0;
    const enabled = legacy ? true : v.enabled !== false;

    const pos = Number.isFinite(Number(v.pos))
      ? Number(v.pos)
      : meta
      ? BUILTIN_POS[id]
      : 100 + index; // custom tiers without pos keep their object order-ish

    return {
      id,
      label: v.label || meta?.label || id,
      icon: v.icon || meta?.icon || CUSTOM_TIER_ICON,
      hint: meta?.hint || "",
      blocks: Number(v.blocks) || 0,
      price,
      enabled,
      pos,
    };
  });

  return tiers.sort((a, b) => a.pos - b.pos);
}

/**
 * Given a rates object from the DB, returns the price (kopecks) of the cheapest
 * enabled tier, or 0 when none are offered.
 */
export function startsFromPrice(rates) {
  const enabled = ratesToTiers(rates).filter((t) => t.enabled && t.price > 0);
  if (enabled.length === 0) return 0;
  return enabled.reduce((min, t) => (t.price < min ? t.price : min), Infinity);
}
