"use client";

// Shared pieces of the Community composers that take photos (contests, the
// Library): a hook that compresses and uploads picked photos to the
// community-media bucket, the photo grid that drives it, and the dialog shell
// every composer sits in (full screen on a phone, a centred card from `sm`).
// The Showcase composer predates these and keeps its own copy, because it
// can also copy photos from the builder's works.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { useScrollLock } from "../../../lib/useScrollLock";
import { Icon } from "../../../lib/icons";
import { POST_IMAGE_MAX_BYTES, POST_MAX_IMAGES, uploadPostImage } from "../../../lib/community/api";

const ACCEPT = "image/jpeg,image/png,image/webp";
const ORIGINAL_MAX_BYTES = 25 * 1024 * 1024;

let nextKey = 1;

function makeItem(file) {
  return { key: nextKey++, file, preview: URL.createObjectURL(file), path: null, error: null, busy: true };
}

/** Photos picked in a composer; reset each time `open` turns true. */
export function usePhotoUploads(open) {
  const t = useT();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!open) return undefined;
    setItems([]);
    setError(null);
    return () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview));
  }, [open]);

  const patch = useCallback((key, fields) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...fields } : i)));
  }, []);

  const addFiles = useCallback(
    async (files) => {
      const room = POST_MAX_IMAGES - itemsRef.current.length;
      const list = Array.from(files || []).filter((f) => f && /^image\/(jpeg|png|webp)$/.test(f.type));
      if (list.length === 0) return;
      if (room <= 0) {
        setError(t("community.post.tooMany", { count: POST_MAX_IMAGES }));
        return;
      }
      setError(null);
      const picked = list.slice(0, room).map(makeItem);
      setItems((prev) => [...prev, ...picked]);
      for (const item of picked) {
        if (item.file.size > ORIGINAL_MAX_BYTES) {
          patch(item.key, { busy: false, error: t("community.post.tooLarge") });
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const { path, error: e } = await uploadPostImage(user?.id, item.file);
        patch(item.key, { busy: false, path, error: e ? serverMessage(e, "community.post.uploadFailed") : null });
      }
    },
    [patch, t, user?.id]
  );

  const remove = useCallback((key) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((i) => i.key !== key);
    });
  }, []);

  const move = useCallback((key, dir) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const ready = items.filter((i) => i.path);
  return {
    items,
    paths: ready.map((i) => i.path),
    uploading: items.some((i) => i.busy),
    allReady: ready.length === items.length,
    error,
    addFiles,
    remove,
    move,
  };
}

/** The photo grid + "Add photos" for a usePhotoUploads() state. */
export function PhotoPicker({ uploads, label, optional = false, hint = null }) {
  const t = useT();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const { items, addFiles, remove, move, error } = uploads;

  return (
    <div>
      <p className="mb-1.5 flex text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">· {t("community.post.optional")}</span>}
        <span className="ml-auto text-xs font-normal text-ink-3">{items.length} / {POST_MAX_IMAGES}</span>
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer?.files);
        }}
        className={`rounded-xl border border-dashed p-3 transition-colors ${dragging ? "border-accent/70 bg-accent/5" : "border-line/15"}`}
      >
        {items.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {items.map((item, i) => (
              <li key={item.key} className="relative aspect-square overflow-hidden rounded-lg bg-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" className={`h-full w-full object-cover ${item.busy ? "opacity-50" : ""}`} />
                {item.busy && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </span>
                )}
                {item.error && (
                  <span className="absolute inset-x-0 bottom-0 bg-danger/90 px-1.5 py-1 text-[10px] leading-tight text-white" title={item.error}>
                    {t("community.post.failedShort")}
                  </span>
                )}
                {i === 0 && !item.error && (
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{t("community.post.cover")}</span>
                )}
                <span className="absolute right-1 top-1 flex gap-0.5">
                  {i > 0 && (
                    <button type="button" onClick={() => move(item.key, -1)} aria-label={t("community.post.moveLeft")} className="flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80">
                      <Icon name="chevronLeft" size={13} />
                    </button>
                  )}
                  <button type="button" onClick={() => remove(item.key)} aria-label={t("community.post.removePhoto")} className="flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80">
                    <Icon name="close" size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={items.length >= POST_MAX_IMAGES} className="btn btn-secondary btn-sm">
            <Icon name="photo" size={15} />
            {t("community.post.pick")}
          </button>
          <span className="text-xs text-ink-3">{t("community.post.dropHint")}</span>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{hint || t("community.post.photosHint", { mb: Math.round(POST_IMAGE_MAX_BYTES / 1048576) })}</p>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** A composer dialog: header with close, scrolling body, footer with submit. */
export function ComposerDialog({ open, title, busy, canSubmit, submitLabel, onClose, onSubmit, error, children }) {
  const t = useT();
  useScrollLock(open);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 hidden bg-black/60 sm:block" onClick={() => !busy && onClose()} />
      <div className="relative flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-line/10 sm:shadow-pop">
        <header className="flex flex-shrink-0 items-center gap-2 border-b border-line/[0.08] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost btn-icon -ml-2" aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
          <h2 className="flex-1 text-base font-semibold">{title}</h2>
        </header>
        <div className="bx-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {children}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <footer className="safe-bottom flex flex-shrink-0 justify-end gap-2 border-t border-line/[0.08] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost hidden sm:inline-flex">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={onSubmit} disabled={!canSubmit || busy} className="btn btn-primary w-full sm:w-auto">
            {submitLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

/** A labelled text input / textarea with a character counter. */
export function CountedField({ label, value, onChange, max, placeholder, rows = 0, optional = false }) {
  const t = useT();
  const props = {
    value,
    onChange: (e) => onChange(e.target.value.slice(0, max)),
    placeholder,
  };
  return (
    <label className="block">
      <span className="mb-1.5 flex text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">· {t("community.post.optional")}</span>}
        <span className="ml-auto text-xs font-normal text-ink-3">{value.length} / {max}</span>
      </span>
      {rows > 0 ? (
        <textarea {...props} rows={rows} className="input h-auto resize-y py-2.5 leading-relaxed" />
      ) : (
        <input {...props} className="input" />
      )}
    </label>
  );
}
