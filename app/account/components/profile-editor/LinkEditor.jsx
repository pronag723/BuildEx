"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../../../../lib/i18n/LanguageProvider";
import { CONTACT_LINK_KEYS, contactLinkError, normalizeContactLink } from "../../../../lib/onboarding/contactLinks";
import { EditError, Spinner } from "./EditZone";

// Add or change one contact link: the platform, then the handle or URL.
// `link` is the link being changed ({ type, value }) or null for a new one;
// `taken` are the platforms other links already use (one link per platform).
// onSave(next | null) gets the new link, or null for Delete, and resolves to
// an error message or null.
export default function LinkEditor({ link, taken, onSave, onCancel, className = "" }) {
  const t = useT();
  const existing = Boolean(link);
  const free = CONTACT_LINK_KEYS.filter((key) => key === link?.type || !taken.includes(key));
  const [type, setType] = useState(link?.type || free[0]);
  const [value, setValue] = useState(link?.value || "");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [type]);

  const trimmed = value.trim();
  const fieldError = trimmed ? contactLinkError(type, trimmed) : null;
  const canSave = Boolean(trimmed) && !fieldError;

  const submit = async (next) => {
    setSaving(true);
    setError(null);
    const message = await onSave(next);
    setSaving(false);
    if (message) setError(message);
  };

  return (
    <div className={`edit-panel ${className}`}>
      <p className="text-xs font-medium text-ink-2">
        {existing ? t("account.editor.links.editTitle") : t("account.editor.links.addTitle")}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label={t("onboarding.links.label")}>
        {free.map((key) => {
          const on = key === type;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => setType(key)}
              className={`h-9 truncate rounded-[9px] border px-1.5 text-[12.5px] font-semibold transition-colors ${
                on
                  ? "border-accent/50 bg-accent/[0.14] text-accent-ink"
                  : "border-line/[0.08] bg-raised text-ink-2 hover:text-ink"
              }`}
            >
              {t(`platforms.${key}.label`)}
            </button>
          );
        })}
      </div>
      <label htmlFor="editor-link" className="mt-3 block text-xs font-medium text-ink-2">
        {t(`platforms.${type}.label`)}
      </label>
      <input
        ref={inputRef}
        id="editor-link"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setTouched(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSave && !saving) submit({ type, value: normalizeContactLink(type, trimmed) });
        }}
        placeholder={t(`platforms.${type}.placeholder`)}
        autoComplete="off"
        spellCheck="false"
        autoCapitalize="off"
        aria-invalid={Boolean(touched && fieldError)}
        className={`onb-input mt-1.5 ${touched && fieldError ? "is-error" : ""}`}
      />
      {touched && fieldError && <p className="mt-1.5 text-xs text-danger">{fieldError}</p>}
      <div className="mt-3 flex items-center gap-2">
        {existing && (
          <button
            type="button"
            onClick={() => submit(null)}
            disabled={saving}
            className="h-[38px] px-1 text-sm font-semibold text-danger hover:underline"
          >
            {t("account.editor.links.delete")}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} disabled={saving} className="btn btn-secondary">
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => submit({ type, value: normalizeContactLink(type, trimmed) })}
          disabled={!canSave || saving}
          className="btn btn-primary"
        >
          {saving && <Spinner />}
          {existing ? t("account.editor.links.save") : t("account.editor.links.addButton")}
        </button>
      </div>
      <EditError message={error} />
    </div>
  );
}
