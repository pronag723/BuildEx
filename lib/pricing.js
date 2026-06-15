// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Pricing helpers
// Single source of truth for the rates shape, size metadata, and
// cent ↔ dollar conversion.  Imported by the editor, the feed, and the
// public profile so every UI uses identical constants and formatters.
//
// Money is stored as integer **USD cents** (the DB columns are still named
// `*_kopecks` for legacy reasons but now hold cents — see migration comments).
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
    defaultPrice: 2500,    // cents = $25
    areaLabel: (blocks) => `Up to ${blocks}×${blocks} blocks`,
  },
  medium: {
    key: "medium",
    label: "Medium Build",
    icon: "🏛️",
    hint: "Hubs, lobbies, mid-size builds",
    defaultBlocks: 200,
    defaultPrice: 5000,    // cents = $50
    areaLabel: (blocks) => `Up to ${blocks}×${blocks} blocks`,
  },
  large: {
    key: "large",
    label: "Large Build",
    icon: "🏰",
    hint: "Kingdoms, networks, signature builds",
    defaultBlocks: 350,
    defaultPrice: 10000,   // cents = $100
    areaLabel: (blocks) => `${blocks}×${blocks} blocks and beyond`,
  },
};

// Preview clip half-width bounds (blocks). Mirror MAX_RADIUS in
// lib/preview/encode.js — kept as a local constant so this module stays free of
// the heavy encoder import.
export const PREVIEW_RADIUS_MIN = 32;
export const PREVIEW_RADIUS_MAX = 256;

/**
 * Suggested preview clip half-width (blocks) for an order's building_size.
 * defaultBlocks is the full side; halve it, add a ~25% margin so edges/overhang
 * aren't clipped, then clamp to the encoder's bounds.
 */
export function suggestedPreviewRadius(buildingSize) {
  const blocks = SIZE_META[buildingSize]?.defaultBlocks || 192; // ~DEFAULT_RADIUS*2 fallback
  const r = Math.ceil((blocks / 2) * 1.25);
  return Math.max(PREVIEW_RADIUS_MIN, Math.min(r, PREVIEW_RADIUS_MAX));
}

/** Integer cents → whole dollars (truncated) */
export function centsToDollars(cents) {
  return Math.floor(Math.round(Number(cents) || 0) / 100);
}

/** Whole dollars → integer cents */
export function dollarsToCents(dollars) {
  return Math.round((Number(dollars) || 0) * 100);
}

const USD_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Format cents as a display string: "$25", "$1,000" */
export function formatPrice(cents) {
  return USD_FORMAT.format(centsToDollars(cents));
}

/**
 * Normalize a DB rates object into an ordered array of display tiers.
 * Tolerates the legacy {blocks, from, to} shape and rows missing label/icon/pos.
 * Returns: [{ id, label, icon, hint, blocks, price (cents), enabled }] sorted
 * by `pos` (built-ins first, then custom tiers in insertion order).
 */
export function ratesToTiers(rates) {
  if (!rates || typeof rates !== "object") return [];

  const tiers = Object.entries(rates).map(([id, raw], index) => {
    const v = raw && typeof raw === "object" ? raw : {};
    const meta = SIZE_META[id];

    // Legacy price-range shape stored the minor unit under `from`.
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
 * Given a rates object from the DB, returns the price (cents) of the cheapest
 * enabled tier, or 0 when none are offered.
 */
export function startsFromPrice(rates) {
  const enabled = ratesToTiers(rates).filter((t) => t.enabled && t.price > 0);
  if (enabled.length === 0) return 0;
  return enabled.reduce((min, t) => (t.price < min ? t.price : min), Infinity);
}
