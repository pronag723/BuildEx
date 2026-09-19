"use client";

// ─────────────────────────────────────────────────────────────────────────────
// One optional way to reach the builder off-platform: pick Discord, Telegram
// or "other link", then type a handle or an https:// URL. Shared by signup
// step 1 and the account settings header so both edit exactly the same field.
//
// Validation lives in lib/onboarding/contactLinks.js and is re-run on save and
// again by a CHECK constraint in the database — this component only surfaces
// the message.
// ─────────────────────────────────────────────────────────────────────────────

import { Icon } from "../../../lib/icons";
import {
  CONTACT_LINK_MAX,
  CONTACT_LINK_TYPES,
  contactLinkError,
  contactLinkTypeMeta,
} from "../../../lib/onboarding/contactLinks";

export default function ContactLinkField({
  type,
  value,
  onTypeChange,
  onValueChange,
  label = "Contact link",
  hint = "Optional. One place clients can reach you outside BuildEx.",
}) {
  const meta = contactLinkTypeMeta(type) || CONTACT_LINK_TYPES[0];
  const trimmed = String(value || "").trim();
  const error = trimmed ? contactLinkError(type, trimmed) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <div className="onb-label">{label}</div>
        <span className="text-[11px] text-gray-500">Optional</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {CONTACT_LINK_TYPES.map((opt) => {
          const active = opt.key === meta.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onTypeChange(opt.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                active
                  ? "border-[#4ade80]/50 bg-[#4ade80]/15 text-[#4ade80]"
                  : "border-white/10 bg-white/[0.04] text-gray-400 hover:text-gray-200 hover:border-white/25"
              }`}
            >
              <Icon name={opt.icon} size={13} />
              {opt.label}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={value || ""}
        onChange={(e) => onValueChange(e.target.value.slice(0, CONTACT_LINK_MAX))}
        placeholder={meta.placeholder}
        maxLength={CONTACT_LINK_MAX}
        aria-label={`${meta.label} contact`}
        aria-invalid={Boolean(error)}
        className={`onb-input ${error ? "is-error" : trimmed ? "is-success" : ""}`}
      />

      <p className={`mt-2 text-xs leading-snug ${error ? "text-red-300" : "text-gray-500"}`}>
        {error || meta.hint} {!error && <span className="text-gray-600">{hint}</span>}
      </p>
    </div>
  );
}
