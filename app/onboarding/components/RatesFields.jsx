"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder rates editor primitives (exact-price shape)
// Shared between the onboarding "Rates" step and the account settings page.
//
// DB shape: { small:{enabled,blocks,price_kopecks}, medium:{…}, large:{…} }
// Editor state: same keys, but `price` is in whole rubles for display;
//   normalizeRates() converts back to kopecks before writing to the DB.
// ─────────────────────────────────────────────────────────────────────────────

import { SIZE_META, SIZES, kopecksToRubles, rublesToKopecks } from "../../../lib/pricing";

export const RATE_TIERS = SIZES.map((key) => ({ key, ...SIZE_META[key] }));

// Editor-state defaults (price in rubles)
const DEFAULT_EDITOR = {
  small:  { enabled: true, blocks: 100, price: 500  },
  medium: { enabled: true, blocks: 200, price: 1000 },
  large:  { enabled: true, blocks: 350, price: 2000 },
};

/**
 * DB rates (kopecks) → editor state (rubles).
 * Also handles the legacy {blocks, from, to} shape transparently.
 */
export function mergeRates(saved) {
  const out = {};
  for (const tier of RATE_TIERS) {
    const v = (saved && saved[tier.key]) || {};
    const d = DEFAULT_EDITOR[tier.key];

    if ("from" in v && !("price" in v)) {
      // Legacy shape — treat `from` as kopecks and convert to rubles
      out[tier.key] = {
        enabled: true,
        blocks: Number(v.blocks) || d.blocks,
        price: Math.max(1, kopecksToRubles(v.from || d.price * 100)),
      };
    } else if ("price" in v) {
      // New DB shape — convert kopecks → rubles for display
      out[tier.key] = {
        enabled: v.enabled !== undefined ? Boolean(v.enabled) : d.enabled,
        blocks: Number(v.blocks) || d.blocks,
        price: Math.max(0, kopecksToRubles(v.price)),
      };
    } else {
      // No saved data — use defaults
      out[tier.key] = { ...d };
    }
  }
  return out;
}

/** Editor state (rubles) → DB format (kopecks). */
export function normalizeRates(r) {
  const clean = {};
  for (const tier of RATE_TIERS) {
    const v = r[tier.key];
    clean[tier.key] = {
      enabled: Boolean(v.enabled),
      blocks: Math.max(0, Math.round(Number(v.blocks) || 0)),
      price: rublesToKopecks(v.price),
    };
  }
  return clean;
}

/** Returns an error string if rates are invalid, otherwise null. */
export function validateRates(r) {
  const enabled = RATE_TIERS.filter((t) => r[t.key]?.enabled);
  if (enabled.length === 0) return "Enable at least one build size.";
  for (const tier of enabled) {
    const v = r[tier.key];
    if (!v.blocks || Number(v.blocks) <= 0) {
      return `${tier.label}: block area must be greater than 0.`;
    }
    if (!v.price || Number(v.price) <= 0) {
      return `${tier.label}: price must be greater than 0.`;
    }
  }
  return null;
}

// ─── Preview card (read-only, shown in account settings) ─────────────────────
export function RateCardPreview({ tier, value }) {
  const blocks = Number(value.blocks) || 0;
  const areaText = tier.key === "large"
    ? `${blocks}×${blocks} blocks and beyond`
    : `Up to ${blocks}×${blocks} blocks`;

  if (!value.enabled) {
    return (
      <div className="glass rounded-2xl p-5 flex flex-col gap-2 opacity-40">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">{tier.icon}</span>
          <h3 className="font-bold text-base">{tier.label}</h3>
        </div>
        <p className="text-xs text-gray-500">Not offered</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-2 transition-all duration-300 hover:border-[#4ade80]/40 hover:shadow-[0_0_24px_rgba(74,222,128,0.12)]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{tier.icon}</span>
        <h3 className="font-bold text-base">{tier.label}</h3>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{areaText}</p>
      <div className="mt-2 pt-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Exact price</p>
        <p className="text-[#4ade80] font-extrabold text-xl leading-tight">
          ₽{Number(value.price).toLocaleString("ru-RU")}
        </p>
      </div>
    </div>
  );
}

// ─── Editor card (editable, shown in account settings + onboarding) ───────────
export function RateEditor({ tier, value, onChange }) {
  function setField(field, raw) {
    if (field === "enabled") {
      onChange({ ...value, enabled: raw });
      return;
    }
    const n = raw === "" ? "" : Math.max(0, parseInt(raw, 10) || 0);
    onChange({ ...value, [field]: n });
  }

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 transition-opacity duration-200 ${
        value.enabled
          ? "border-white/10 bg-white/[0.03]"
          : "border-white/5 bg-white/[0.01] opacity-50"
      }`}
    >
      {/* Header + toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{tier.icon}</span>
          <div>
            <h3 className="font-bold text-sm leading-tight">{tier.label}</h3>
            <p className="text-[11px] text-gray-500">{tier.hint}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.enabled}
          onClick={() => setField("enabled", !value.enabled)}
          className={`relative flex-shrink-0 w-10 h-5 rounded-full border transition-all duration-200 ${
            value.enabled
              ? "bg-[#4ade80] border-[#4ade80]"
              : "bg-white/10 border-white/20"
          }`}
          title={value.enabled ? "Disable this size" : "Enable this size"}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
              value.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {value.enabled && (
        <>
          <div>
            <label className="onb-label block mb-1.5">Block area (blocks per side)</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              className="onb-input"
              value={value.blocks}
              onChange={(e) => setField("blocks", e.target.value)}
            />
          </div>
          <div>
            <label className="onb-label block mb-1.5">Price (₽)</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              className="onb-input"
              value={value.price}
              onChange={(e) => setField("price", e.target.value)}
              placeholder="e.g. 5000"
            />
          </div>
        </>
      )}
    </div>
  );
}
