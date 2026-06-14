"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder rates editor (exact-price, N-tier shape)
// Shared between the onboarding "Rates" step and the account settings page.
//
// Editor state is an ORDERED ARRAY of tiers (so builders can add custom sizes,
// not just small/medium/large). Each editor tier:
//   { id, label, icon, blocks, price, enabled, builtin }
//   • price is in whole dollars for display; normalizeRates() converts to cents.
//   • builtin tiers (small/medium/large) can be toggled but not removed.
//   • custom tiers carry a generated id, an editable name, and can be removed.
//
// DB shape (builder_profiles.rates) is a keyed object — see lib/pricing.js.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SIZE_META,
  SIZES,
  CUSTOM_TIER_ICON,
  centsToDollars,
  dollarsToCents,
  ratesToTiers,
} from "../../../lib/pricing";

export const RATE_TIERS = SIZES.map((key) => ({ key, ...SIZE_META[key] }));

// Editor-state defaults for the three built-ins (price in dollars).
const DEFAULT_EDITOR = {
  small:  { blocks: 100, price: 25  },
  medium: { blocks: 200, price: 50  },
  large:  { blocks: 350, price: 100 },
};

function isBuiltin(id) {
  return Object.prototype.hasOwnProperty.call(SIZE_META, id);
}

// Generate a short, collision-resistant key for a builder-added tier.
function makeCustomId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * DB rates (cents) → editor state (array of tiers, price in dollars).
 * When nothing is saved yet, seeds the three built-in tiers enabled.
 */
export function mergeRates(saved) {
  const hasSaved =
    saved && typeof saved === "object" && Object.keys(saved).length > 0;

  if (!hasSaved) {
    return SIZES.map((key) => ({
      id: key,
      label: SIZE_META[key].label,
      icon: SIZE_META[key].icon,
      blocks: DEFAULT_EDITOR[key].blocks,
      price: DEFAULT_EDITOR[key].price,
      enabled: true,
      builtin: true,
    }));
  }

  return ratesToTiers(saved).map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    blocks: t.blocks,
    price: Math.max(0, centsToDollars(t.price)),
    enabled: t.enabled,
    builtin: isBuiltin(t.id),
  }));
}

/** Editor state (array, dollars) → DB format (keyed object, cents). */
export function normalizeRates(tiers) {
  const out = {};
  tiers.forEach((t, index) => {
    out[t.id] = {
      enabled: Boolean(t.enabled),
      blocks: Math.max(0, Math.round(Number(t.blocks) || 0)),
      price: dollarsToCents(t.price),
      label: String(t.label || "").trim() || (SIZE_META[t.id]?.label ?? "Custom size"),
      icon: t.icon || SIZE_META[t.id]?.icon || CUSTOM_TIER_ICON,
      pos: index,
    };
  });
  return out;
}

/** Returns an error string if rates are invalid, otherwise null. */
export function validateRates(tiers) {
  const enabled = tiers.filter((t) => t.enabled);
  if (enabled.length === 0) return "Enable at least one build size.";
  for (const t of enabled) {
    const name = String(t.label || "").trim();
    if (!name) return "Give every offered size a name.";
    if (!t.blocks || Number(t.blocks) <= 0) {
      return `${name}: block area must be greater than 0.`;
    }
    if (!t.price || Number(t.price) <= 0) {
      return `${name}: price must be greater than 0.`;
    }
  }
  return null;
}

// Build a fresh custom tier for the "Add size" button.
function newCustomTier() {
  return {
    id: makeCustomId(),
    label: "Custom size",
    icon: CUSTOM_TIER_ICON,
    blocks: 150,
    price: 750,
    enabled: true,
    builtin: false,
  };
}

function areaText(tier) {
  const blocks = Number(tier.blocks) || 0;
  if (blocks <= 0) return "Set a block area";
  if (tier.id === "large") return `${blocks}×${blocks} blocks and beyond`;
  return `Up to ${blocks}×${blocks} blocks`;
}

// ─── Editor container (manages the whole list: cards + add button) ────────────
export function RatesEditor({ rates, onChange }) {
  const stacked = rates.length > 3;

  function update(id, next) {
    onChange(rates.map((t) => (t.id === id ? next : t)));
  }
  function remove(id) {
    onChange(rates.filter((t) => t.id !== id));
  }
  function add() {
    onChange([...rates, newCustomTier()]);
  }

  return (
    <div className="space-y-3">
      <div
        className={
          stacked
            ? "grid grid-cols-1 gap-3"
            : "grid grid-cols-1 md:grid-cols-3 gap-3"
        }
      >
        {rates.map((tier) => (
          <RateEditor
            key={tier.id}
            tier={tier}
            onChange={(v) => update(tier.id, v)}
            onRemove={tier.builtin ? null : () => remove(tier.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm font-semibold text-gray-300 hover:border-[#4ade80]/50 hover:text-[#4ade80] hover:bg-[#4ade80]/[0.04] transition-all"
      >
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#4ade80]/15 text-[#4ade80] text-base leading-none">
          +
        </span>
        Add custom size
      </button>
    </div>
  );
}

// ─── Single editable tier card ────────────────────────────────────────────────
export function RateEditor({ tier, onChange, onRemove }) {
  function setField(field, raw) {
    if (field === "enabled" || field === "label") {
      onChange({ ...tier, [field]: raw });
      return;
    }
    const n = raw === "" ? "" : Math.max(0, parseInt(raw, 10) || 0);
    onChange({ ...tier, [field]: n });
  }

  return (
    <div
      className={`relative rounded-2xl border p-3 space-y-2.5 transition-all duration-200 ${
        tier.enabled
          ? "border-white/10 bg-white/[0.03]"
          : "border-white/5 bg-white/[0.01] opacity-50"
      }`}
    >
      {/* Header: icon + editable name + toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-lg flex-shrink-0">{tier.icon}</span>
          <input
            type="text"
            value={tier.label}
            maxLength={40}
            onChange={(e) => setField("label", e.target.value)}
            placeholder="Size name"
            aria-label="Size name"
            title={SIZE_META[tier.id]?.hint || "Size name"}
            className="onb-input !py-1.5 !text-sm font-semibold min-w-0 flex-1"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={tier.enabled}
            onClick={() => setField("enabled", !tier.enabled)}
            className={`relative w-10 h-5 rounded-full border transition-all duration-200 ${
              tier.enabled
                ? "bg-[#4ade80] border-[#4ade80]"
                : "bg-white/10 border-white/20"
            }`}
            title={tier.enabled ? "Disable this size" : "Enable this size"}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                tier.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove this size"
              title="Remove this size"
              className="flex items-center justify-center w-7 h-7 rounded-full text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all text-base leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {tier.enabled && (
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="onb-label block mb-1">Block area</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              className="onb-input !py-2 !text-sm"
              value={tier.blocks}
              onChange={(e) => setField("blocks", e.target.value)}
            />
          </div>
          <div>
            <label className="onb-label block mb-1">Price ($)</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              className="onb-input !py-2 !text-sm"
              value={tier.price}
              onChange={(e) => setField("price", e.target.value)}
              placeholder="e.g. 50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Read-only preview (account settings, not editing) ────────────────────────
export function RatesPreview({ rates }) {
  const visible = rates.filter((t) => t.enabled);
  const stacked = visible.length > 3;

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
        <p className="text-gray-400 text-sm">No sizes offered yet.</p>
      </div>
    );
  }

  return (
    <div className={stacked ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 md:grid-cols-3 gap-3"}>
      {visible.map((tier) => (
        <div
          key={tier.id}
          className="glass rounded-2xl p-3.5 flex flex-col gap-1.5 transition-all duration-300 hover:border-[#4ade80]/40 hover:shadow-[0_0_24px_rgba(74,222,128,0.12)]"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{tier.icon}</span>
            <h3 className="font-bold text-sm truncate">{tier.label}</h3>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{areaText(tier)}</p>
          <div className="mt-1.5 pt-2.5 border-t border-white/[0.06]">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Exact price</p>
            <p className="text-[#4ade80] font-extrabold text-lg leading-tight">
              ${Number(tier.price).toLocaleString("en-US")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
