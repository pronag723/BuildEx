"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../../lib/icons";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { rewriteStorageUrl } from "../../../../lib/supabase/storageUrl";
import { uploadHeaderImage } from "../../../../lib/onboarding/api";
import { PORTFOLIO_ACCEPTED_MIME, PORTFOLIO_MAX_FILE_MB } from "../../../../lib/onboarding/constants";
import {
  HEADER_BG_COLOR_DEFAULT,
  HEADER_BG_DIM_MAX,
  HEADER_BG_PRESETS,
} from "../../../../lib/profile/headerBg.mjs";
import ColorPicker from "../../../../lib/ui/ColorPicker";
import Slider from "../../../../lib/ui/Slider";
import { useDismiss } from "../../../../lib/ui/useDismiss";

// The "Profile background" pill and its picker: none, six dark presets, any
// colour, or an uploaded screenshot, plus how much to dim it. Changes show on
// the page at once (the parent renders `draft`); closing — Done, Escape or a
// press outside — hands the draft back to be saved. A popover under the pill
// on desktop, a sheet from the bottom on a phone (no dimmed backdrop, so the
// header stays visible above it).
export default function HeaderBackgroundPicker({ open, onOpen, onClose, draft, setDraft, userId, isDesktop, onUploaded, onError }) {
  const t = useT();
  const pillRef = useRef(null);
  const panelRef = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  useDismiss([pillRef, panelRef], open && !uploading, () => onClose());

  // Keep focus inside while it's open: move it to the panel on open.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const set = (next) => setDraft({ ...draft, ...next });

  async function upload(files) {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!PORTFOLIO_ACCEPTED_MIME.includes(file.type)) {
      onError(t("onboarding.upload.badType"));
      return;
    }
    if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) {
      onError(t("onboarding.upload.tooLarge", { mb: PORTFOLIO_MAX_FILE_MB }));
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      onError(t("onboarding.upload.noStorage"));
      return;
    }
    setUploading(true);
    const { url, error } = await uploadHeaderImage(supabase, userId, file);
    setUploading(false);
    if (error || !url) {
      onError(error?.message || t("onboarding.upload.failed"));
      return;
    }
    onUploaded(url);
    set({ kind: "image", imageUrl: url });
  }

  const swatch = (on) =>
    `flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-shadow ${
      on ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "border border-line/15"
    }`;

  const panel = (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={t("account.editor.bg.title")}
      className={
        isDesktop
          ? "menu-panel popover-rise absolute right-0 top-12 z-40 w-[360px] rounded-[18px] p-4 text-left outline-none"
          : "menu-panel sheet-rise safe-bottom fixed inset-x-0 bottom-0 z-[120] max-h-[72vh] overflow-y-auto rounded-b-none rounded-t-[20px] px-4 pt-4 text-left outline-none"
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">{t("account.editor.bg.title")}</span>
        <button type="button" onClick={() => onClose()} disabled={uploading} className="btn btn-primary btn-sm px-3.5">
          {t("account.editor.done")}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2" role="group" aria-label={t("account.editor.bg.title")}>
        <button
          type="button"
          onClick={() => set({ kind: "none" })}
          aria-pressed={draft.kind === "none"}
          aria-label={t("account.editor.bg.none")}
          className={`${swatch(draft.kind === "none")} bg-raised text-ink-3`}
        >
          <Icon name="none" size={16} />
        </button>
        {HEADER_BG_PRESETS.map((hex) => {
          const on = draft.kind === "color" && draft.color?.toUpperCase() === hex.toUpperCase();
          return (
            <button
              key={hex}
              type="button"
              onClick={() => set({ kind: "color", color: hex })}
              aria-pressed={on}
              aria-label={t("account.editor.bg.color", { hex })}
              className={swatch(on)}
              style={{ background: hex }}
            />
          );
        })}
      </div>

      <ColorPicker
        className="mt-3"
        value={draft.color || HEADER_BG_COLOR_DEFAULT}
        onChange={(hex) => set({ kind: "color", color: hex })}
      />

      {draft.imageUrl ? (
        <div
          className={`mt-2.5 flex items-center gap-2.5 rounded-xl border-2 p-2 ${
            draft.kind === "image" ? "border-accent bg-raised" : "border-transparent bg-raised"
          }`}
        >
          <button
            type="button"
            onClick={() => set({ kind: "image" })}
            aria-pressed={draft.kind === "image"}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rewriteStorageUrl(draft.imageUrl)} alt="" className="h-[42px] w-16 flex-shrink-0 rounded-lg object-cover" />
            <span className="truncate text-[13px] font-semibold text-ink">{t("account.editor.bg.yourImage")}</span>
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-secondary btn-sm">
            {uploading ? t("account.editor.bg.uploading") : t("account.editor.bg.replace")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line/20 text-[13px] font-semibold text-ink transition-colors hover:bg-line/[0.05]"
        >
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line/20 border-t-accent" />
          ) : (
            <Icon name="upload" size={16} />
          )}
          {uploading ? t("account.editor.bg.uploading") : t("account.editor.bg.upload")}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={PORTFOLIO_ACCEPTED_MIME.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => upload(event.target.files)}
      />

      <div className="mt-3.5">
        <div className="flex justify-between text-xs font-medium text-ink-3">
          <span id="bg-dim-label">{t("account.editor.bg.dim")}</span>
          <span className="tabular-nums text-ink">{draft.dim}%</span>
        </div>
        <Slider
          className="mt-0.5"
          value={draft.dim}
          min={0}
          max={HEADER_BG_DIM_MAX}
          onChange={(dim) => set({ dim })}
          labelledBy="bg-dim-label"
          valueText={`${draft.dim}%`}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">{t("account.editor.bg.hint")}</p>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={pillRef}
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border border-line/15 bg-canvas/60 px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas/85 lg:h-[38px] lg:gap-[7px] lg:px-3.5 lg:text-[13px]"
      >
        <Icon name="image" size={15} />
        {t("account.editor.bg.button")}
      </button>
      {open && (isDesktop ? panel : typeof document !== "undefined" ? createPortal(panel, document.body) : null)}
    </div>
  );
}
