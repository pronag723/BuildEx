"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder rates editor primitives
// Shared between the onboarding "Rates" step and the account settings page so
// the pricing UI stays identical in both places. `rates` is
// { small|medium|large: { blocks, from, to } } — mirrors builder_profiles.rates
// (migration 0005) and the RateCard on public builder pages.
// ─────────────────────────────────────────────────────────────────────────────

export const RATE_TIERS = [
  { key: "small",  title: "Small Build",  icon: "🏠", plus: false, hint: "Spawns, small arenas, starter hubs" },
  { key: "medium", title: "Medium Build", icon: "🏛️", plus: false, hint: "Hubs, lobbies, mid-size builds" },
  { key: "large",  title: "Large Build",  icon: "🏰", plus: true,  hint: "Kingdoms, networks, signature builds" },
];

export const DEFAULT_RATES = {
  small:  { blocks: 100, from: 200, to: 500 },
  medium: { blocks: 200, from: 500, to: 900 },
  large:  { blocks: 350, from: 900, to: 1800 },
};

// Fill any missing tier/field from the defaults so the editor and cards always
// have complete values, even on profiles saved before a field existed.
export function mergeRates(saved) {
  const out = {};
  for (const tier of RATE_TIERS) {
    const v = (saved && saved[tier.key]) || {};
    const d = DEFAULT_RATES[tier.key];
    out[tier.key] = {
      blocks: v.blocks ?? d.blocks,
      from: v.from ?? d.from,
      to: v.to ?? d.to,
    };
  }
  return out;
}

export function areaLabel(tier, blocks) {
  const n = blocks || 0;
  return tier.plus
    ? `Builds ${n}×${n} blocks and beyond`
    : `Builds up to ${n}×${n} blocks`;
}

// Returns an error message string if the rates are incomplete/inconsistent,
// otherwise null. Used to gate the Save / Continue buttons.
export function validateRates(r) {
  for (const tier of RATE_TIERS) {
    const v = r[tier.key];
    if (v.blocks === "" || v.from === "" || v.to === "") return "Fill in every field for each tier.";
    if (Number(v.to) < Number(v.from)) return `${tier.title}: the "to" price can't be lower than "from".`;
  }
  return null;
}

// Coerce the editor's (possibly string) field values into clean numbers for save.
export function normalizeRates(r) {
  const clean = {};
  for (const tier of RATE_TIERS) {
    const v = r[tier.key];
    clean[tier.key] = { blocks: Number(v.blocks), from: Number(v.from), to: Number(v.to) };
  }
  return clean;
}

export function RateCardPreview({ tier, value }) {
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-2 transition-all duration-300 hover:border-[#4ade80]/40 hover:shadow-[0_0_24px_rgba(74,222,128,0.12)]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{tier.icon}</span>
        <h3 className="font-bold text-base">{tier.title}</h3>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{areaLabel(tier, value.blocks)}</p>
      <div className="mt-2 pt-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Your price range</p>
        <p className="text-[#4ade80] font-extrabold text-xl leading-tight">
          ${Number(value.from).toLocaleString()} – ${Number(value.to).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function RateEditor({ tier, value, onChange }) {
  function set(field, raw) {
    onChange({ ...value, [field]: raw === "" ? "" : Math.max(0, parseInt(raw, 10) || 0) });
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{tier.icon}</span>
        <div>
          <h3 className="font-bold text-sm leading-tight">{tier.title}</h3>
          <p className="text-[11px] text-gray-500">{tier.hint}</p>
        </div>
      </div>
      <div>
        <label className="onb-label block mb-1.5">Build area (blocks per side)</label>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          className="onb-input"
          value={value.blocks}
          onChange={(e) => set("blocks", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="onb-label block mb-1.5">Price from ($)</label>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            className="onb-input"
            value={value.from}
            onChange={(e) => set("from", e.target.value)}
          />
        </div>
        <div>
          <label className="onb-label block mb-1.5">Price to ($)</label>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            className="onb-input"
            value={value.to}
            onChange={(e) => set("to", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
