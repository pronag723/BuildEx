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

import { useMemo } from "react";
import { Icon } from "../../../lib/icons";
import PlatformSelect from "./PlatformSelect";
import { useT } from "../../../lib/i18n/LanguageProvider";
import {
  CONTACT_LINK_MAX,
  CONTACT_LINK_TYPES,
  CONTACT_LINKS_MAX,
  contactLinkError,
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
  label,
  hint,
}) {
  const t = useT();
  // The platform table with its label, placeholder and hint in the current
  // language (brand names are the same in both).
  const options = useMemo(
    () =>
      CONTACT_LINK_TYPES.map((o) => ({
        ...o,
        label: t(`platforms.${o.key}.label`),
        placeholder: t(`platforms.${o.key}.placeholder`),
        hint: t(`platforms.${o.key}.hint`),
      })),
    [t]
  );
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
        <div className="onb-label">{label ?? t("onboarding.links.label")}</div>
        <span className="text-xs text-ink-3">{t("onboarding.links.optional")}</span>
      </div>
      <p className="text-xs text-ink-3 mb-3 leading-snug">{hint ?? t("onboarding.links.hint")}</p>

      <div className="space-y-3">
        {list.map((row, i) => {
          const meta = options.find((o) => o.key === row.type) || options[0];
          const trimmed = String(row.value || "").trim();
          const error = trimmed ? contactLinkError(row.type, trimmed) : null;
          return (
            // Keyed by position, not by platform. The key used to include
            // row.type, so picking a different platform gave the row a new key
            // and React threw the whole row away and built another one — which
            // blew away the keyboard focus sitting on the picker mid-selection.
            // Every value in a row comes from props, so the position is a safe
            // identity even as rows are added and removed.
            <div key={i} className="contact-link-row">
              {/* A grid rather than a flex row: on a phone the picker and the
                  value squeezed each other down to a few characters apiece, so
                  narrow screens put the picker on its own line above the
                  value, and `sm` and up keep the single row. */}
              <div className="contact-link-grid">
                {/* A styled listbox rather than a native <select>: the OS menu
                    a select opens cannot be themed, and it gave no sign of
                    which platforms were already taken. See PlatformSelect. */}
                <PlatformSelect
                  className="contact-link-cell-type"
                  value={row.type}
                  options={options}
                  usedKeys={used}
                  onChange={(type) => update(i, { type })}
                />

                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={row.value || ""}
                  onChange={(e) => update(i, { value: e.target.value.slice(0, CONTACT_LINK_MAX) })}
                  placeholder={meta.placeholder}
                  maxLength={CONTACT_LINK_MAX}
                  aria-label={t("onboarding.links.valueAria", { platform: meta.label })}
                  aria-invalid={Boolean(error)}
                  className={`onb-input contact-link-cell-value min-w-0 ${error ? "is-error" : trimmed ? "is-success" : ""}`}
                />

                {list.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={t("onboarding.links.removeAria", { platform: meta.label })}
                    title={t("onboarding.links.remove")}
                    className="contact-link-cell-remove w-11 rounded-[10px] border border-line/10 text-ink-3 hover:text-ink hover:border-line/25 transition-colors flex items-center justify-center"
                  >
                    <Icon name="close" size={15} />
                  </button>
                )}
              </div>
              <p className={`mt-1.5 text-xs leading-snug ${error ? "text-danger" : "text-ink-3"}`}>
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
          className="btn btn-secondary btn-sm mt-3"
        >
          <Icon name="plus" size={15} />
          {t("onboarding.links.add")}
        </button>
      )}
    </div>
  );
}
