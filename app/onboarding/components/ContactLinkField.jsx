"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The builder's public links: Discord, Telegram, YouTube, Twitch, TikTok,
// Instagram, X, and one free-form website. Shared by signup step 1 and the
// account settings header so both edit exactly the same field.
//
// Rows are held by the parent as [{ type, value }]. Validation lives in
// lib/onboarding/contactLinks.js and is re-run on save and again by a CHECK
// constraint in the database — this component only surfaces the message.
// ─────────────────────────────────────────────────────────────────────────────

import { Icon } from "../../../lib/icons";
import {
  CONTACT_LINK_MAX,
  CONTACT_LINK_TYPES,
  CONTACT_LINKS_MAX,
  contactLinkError,
  contactLinkTypeMeta,
} from "../../../lib/onboarding/contactLinks";

/** The row list a parent should start from when nothing is stored yet. */
export function emptyLinkRows() {
  return [{ type: "discord", value: "" }];
}

/** True when no row is filled in with something invalid. */
export function linkRowsValid(rows) {
  return (rows || []).every(
    (r) => !String(r.value || "").trim() || contactLinkError(r.type, r.value) === null
  );
}

export default function ContactLinkField({
  rows,
  onChange,
  label = "Your links",
  hint = "Optional. Shown as buttons on your public profile.",
}) {
  const list = rows && rows.length ? rows : emptyLinkRows();
  const used = new Set(list.map((r) => r.type));

  function update(i, patch) {
    onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    const next = CONTACT_LINK_TYPES.find((t) => !used.has(t.key));
    if (!next) return;
    onChange([...list, { type: next.key, value: "" }]);
  }

  function removeRow(i) {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : emptyLinkRows());
  }

  const canAdd = list.length < CONTACT_LINKS_MAX && used.size < CONTACT_LINK_TYPES.length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1 gap-3">
        <div className="onb-label">{label}</div>
        <span className="text-[11px] text-gray-500">Optional</span>
      </div>
      <p className="text-xs text-gray-500 mb-3 leading-snug">{hint}</p>

      <div className="space-y-3">
        {list.map((row, i) => {
          const meta = contactLinkTypeMeta(row.type) || CONTACT_LINK_TYPES[0];
          const trimmed = String(row.value || "").trim();
          const error = trimmed ? contactLinkError(row.type, trimmed) : null;
          return (
            <div key={`${row.type}-${i}`} className="contact-link-row">
              <div className="flex items-stretch gap-2">
                <div className="relative flex-shrink-0">
                  {/* A native select keeps the keyboard and mobile pickers
                      working; the icon in front of it is decorative. */}
                  <Icon
                    name={meta.icon}
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    value={row.type}
                    onChange={(e) => update(i, { type: e.target.value })}
                    aria-label="Link type"
                    className="onb-input contact-link-select"
                  >
                    {CONTACT_LINK_TYPES.map((t) => (
                      <option
                        key={t.key}
                        value={t.key}
                        disabled={t.key !== row.type && used.has(t.key)}
                      >
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={row.value || ""}
                  onChange={(e) => update(i, { value: e.target.value.slice(0, CONTACT_LINK_MAX) })}
                  placeholder={meta.placeholder}
                  maxLength={CONTACT_LINK_MAX}
                  aria-label={`${meta.label} link`}
                  aria-invalid={Boolean(error)}
                  className={`onb-input flex-1 min-w-0 ${error ? "is-error" : trimmed ? "is-success" : ""}`}
                />

                {list.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={`Remove ${meta.label} link`}
                    title="Remove"
                    className="flex-shrink-0 w-10 rounded-xl border border-white/10 text-gray-500 hover:text-red-300 hover:border-red-400/40 transition-colors flex items-center justify-center"
                  >
                    <Icon name="close" size={15} />
                  </button>
                )}
              </div>
              <p className={`mt-1.5 text-xs leading-snug ${error ? "text-red-300" : "text-gray-500"}`}>
                {error || meta.hint}
              </p>
            </div>
          );
        })}
      </div>

      {canAdd && (
        <button
          type="button"
          onClick={addRow}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/[0.04] text-gray-300 hover:text-white hover:border-[#4ade80]/40 hover:bg-[#4ade80]/10 transition-all"
        >
          <span className="text-base leading-none">+</span>
          Add another link
        </button>
      )}
    </div>
  );
}
