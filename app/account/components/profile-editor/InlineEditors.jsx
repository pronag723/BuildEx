"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../../../../lib/i18n/LanguageProvider";
import { BIO_MAX, DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, STYLES } from "../../../../lib/onboarding/constants";
import HandleInput from "../../../onboarding/components/HandleInput";
import ChipGrid from "../../../onboarding/components/ChipGrid";
import { EditError, Spinner } from "./EditZone";

// The inline editors that open in place of a profile block. Each one keeps
// its own draft and hands it to `onSave`, which resolves to an error message
// (shown here, editor stays open) or null (the owner closes it).

export const STYLES_MAX = 5;

function useSave(onSave) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const run = async (value) => {
    setSaving(true);
    setError(null);
    const message = await onSave(value);
    setSaving(false);
    if (message) setError(message);
  };
  return { saving, error, run };
}

function DoneButton({ onClick, disabled, saving, label, className = "" }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} disabled={disabled || saving} className={`btn btn-primary ${className}`}>
      {saving && <Spinner />}
      {label || t("account.editor.done")}
    </button>
  );
}

// ─── Name + @handle ─────────────────────────────────────────────────────────
export function NameEditor({ userId, name, handle, onSave }) {
  const t = useT();
  const [draftName, setDraftName] = useState(name || "");
  const [draftHandle, setDraftHandle] = useState(handle || "");
  // The saved handle is valid until HandleInput says otherwise.
  const [handleValid, setHandleValid] = useState(Boolean(handle));
  const { saving, error, run } = useSave(onSave);
  const nameRef = useRef(null);
  const trimmed = draftName.trim();
  const nameValid = trimmed.length >= DISPLAY_NAME_MIN && trimmed.length <= DISPLAY_NAME_MAX;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <div className="popover-rise">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start">
        <div className="lg:w-[240px]">
          <label htmlFor="editor-name" className="onb-label mb-1 block text-xs text-ink-2">
            {t("account.editor.name.label")}
          </label>
          <input
            ref={nameRef}
            id="editor-name"
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="off"
            className={`onb-input ${draftName && !nameValid ? "is-error" : ""}`}
          />
        </div>
        <div className="lg:w-[260px]">
          <HandleInput
            id="editor-handle"
            value={draftHandle}
            onChange={setDraftHandle}
            currentUserId={userId}
            onValidityChange={setHandleValid}
            label={<span className="text-xs text-ink-2">{t("account.editor.name.handle")}</span>}
            hint={t("account.header.handleHint")}
          />
        </div>
        <DoneButton
          className="lg:mt-[1.375rem]"
          saving={saving}
          disabled={!nameValid || !handleValid || !draftHandle}
          onClick={() => run({ name: trimmed, handle: draftHandle })}
        />
      </div>
      <EditError message={error} />
    </div>
  );
}

// ─── Bio ────────────────────────────────────────────────────────────────────
export function BioEditor({ bio, onSave, onCancel }) {
  const t = useT();
  const [draft, setDraft] = useState(bio || "");
  const { saving, error, run } = useSave(onSave);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <div className="edit-panel mt-1 max-w-[680px]">
      <label htmlFor="editor-bio" className="mb-1.5 block text-xs font-medium text-ink-2">
        {t("account.editor.bio.label")}
      </label>
      <textarea
        ref={ref}
        id="editor-bio"
        rows={5}
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, BIO_MAX))}
        maxLength={BIO_MAX}
        placeholder={t("account.editor.bio.placeholder")}
        className="onb-input onb-textarea min-h-[7.5rem] resize-none lg:min-h-[6.5rem] lg:resize-y"
      />
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-ink-3">
          {draft.length} / {BIO_MAX}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="btn btn-secondary">
            {t("common.cancel")}
          </button>
          <DoneButton saving={saving} onClick={() => run(draft.trim() || null)} />
        </div>
      </div>
      <EditError message={error} />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
export function StylesEditor({ styles, onSave }) {
  const t = useT();
  const [draft, setDraft] = useState(styles || []);
  const { saving, error, run } = useSave(onSave);

  return (
    <div className="edit-panel mt-3 max-w-[560px]">
      <p className="text-xs font-medium text-ink-2">{t("account.editor.styles.hint", { max: STYLES_MAX })}</p>
      <div className="mt-2.5">
        <ChipGrid
          options={STYLES.map((s) => ({ key: s.key, label: t(`styles.${s.key}`) }))}
          value={draft}
          onChange={setDraft}
          multi
          max={STYLES_MAX}
          ariaLabel={t("onboarding.styles.label")}
        />
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {draft.length === 0 && <span className="mr-auto text-xs text-ink-3">{t("account.editor.styles.min")}</span>}
        <DoneButton saving={saving} disabled={draft.length === 0} onClick={() => run(draft)} />
      </div>
      <EditError message={error} />
    </div>
  );
}
