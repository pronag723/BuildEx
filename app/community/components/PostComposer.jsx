"use client";

// "Create a post": pick or drop 1–10 photos (compressed in the browser and
// put in community-media) and write a caption. A builder may also
// copy the photos of one of their works into the post — a deliberate
// publication, not an automatic feed. Posting goes through
// create_showcase_post, which checks the count, the paths and the daily cap.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useIsBuilder } from "../../../lib/auth/useIsBuilder";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { useScrollLock } from "../../../lib/useScrollLock";
import { Icon } from "../../../lib/icons";
import { fetchWorks } from "../../../lib/works/api";
import {
  createShowcasePost,
  POST_CAPTION_MAX,
  POST_IMAGE_MAX_BYTES,
  POST_MAX_IMAGES,
  uploadPostImage,
} from "../../../lib/community/api";

const ACCEPT = "image/jpeg,image/png,image/webp";
// An original a phone hands over can be 20 MB; anything past this is refused
// before the browser even tries to decode it.
const ORIGINAL_MAX_BYTES = 25 * 1024 * 1024;

let nextKey = 1;

// One photo in the composer: a local preview while it uploads, then its path.
function makeItem(file) {
  return { key: nextKey++, file, preview: URL.createObjectURL(file), path: null, error: null, busy: true };
}

export default function PostComposer({ open, onClose, onCreated }) {
  const t = useT();
  const { user } = useAuth();
  const isBuilder = useIsBuilder();
  const [items, setItems] = useState([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [works, setWorks] = useState(null); // null = not loaded, [] = none
  const [worksOpen, setWorksOpen] = useState(false);
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    setItems([]);
    setCaption("");
    setError(null);
    setWorksOpen(false);
    return () => {
      itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview));
    };
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

  const remove = (key) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((i) => i.key !== key);
    });
  };

  const move = (key, dir) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  async function openWorks() {
    setWorksOpen(true);
    if (works !== null || !user?.id) return;
    const { works: rows } = await fetchWorks(user.id, { from: 0, to: 40 });
    setWorks(rows || []);
  }

  // Copy a work's photos: fetch each public image, then upload it like a
  // picked file (so it is compressed and lands in the viewer's own folder).
  async function pickWork(work) {
    setWorksOpen(false);
    setError(null);
    const photos = (work.photos || []).filter((p) => p.url).slice(0, POST_MAX_IMAGES - itemsRef.current.length);
    if (photos.length === 0) {
      setError(t("community.post.tooMany", { count: POST_MAX_IMAGES }));
      return;
    }
    if (!caption.trim() && work.title) setCaption(work.title);
    const files = [];
    for (const p of photos) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const blob = await (await fetch(p.url)).blob();
        if (/^image\/(jpeg|png|webp)$/.test(blob.type)) files.push(new File([blob], "work", { type: blob.type }));
      } catch {
        // skipped: the post can still be made from the photos that did load
      }
    }
    if (files.length === 0) setError(t("community.post.copyFailed"));
    else await addFiles(files);
  }

  const ready = items.filter((i) => i.path);
  const uploading = items.some((i) => i.busy);
  const ok = ready.length > 0 && ready.length === items.length && caption.trim().length > 0 && !uploading && !busy;

  async function submit() {
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { postId, error: e } = await createShowcasePost(
      caption.trim(),
      ready.map((i) => i.path)
    );
    setBusy(false);
    if (e) {
      setError(serverMessage(e, "community.errors.failed"));
      return;
    }
    onCreated(postId);
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("community.post.newTitle")}>
      <div className="absolute inset-0 hidden bg-black/60 sm:block" onClick={() => !busy && onClose()} />
      <div className="relative flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-line/10 sm:shadow-pop">
        <header className="flex flex-shrink-0 items-center gap-2 border-b border-line/[0.08] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost btn-icon -ml-2" aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
          <h2 className="flex-1 text-base font-semibold">{t("community.post.newTitle")}</h2>
        </header>

        <div className="bx-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {/* Photos */}
          <div>
            <p className="mb-1.5 flex text-sm font-medium">
              {t("community.post.photos")}
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
                    <li key={item.key} className="group relative aspect-square overflow-hidden rounded-lg bg-raised">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.preview} alt="" className={`h-full w-full object-cover ${item.busy ? "opacity-50" : ""}`} />
                      {item.busy && <span className="absolute inset-0 flex items-center justify-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /></span>}
                      {item.error && (
                        <span className="absolute inset-x-0 bottom-0 bg-danger/90 px-1.5 py-1 text-[10px] leading-tight text-white" title={item.error}>
                          {t("community.post.failedShort")}
                        </span>
                      )}
                      {i === 0 && !item.error && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{t("community.post.cover")}</span>}
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
                <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <button type="button" onClick={() => inputRef.current?.click()} disabled={items.length >= POST_MAX_IMAGES} className="btn btn-secondary btn-sm">
                  <Icon name="photo" size={15} />
                  {t("community.post.pick")}
                </button>
                {isBuilder === true && (
                  <button type="button" onClick={openWorks} disabled={items.length >= POST_MAX_IMAGES} className="btn btn-ghost btn-sm">
                    <Icon name="grid" size={15} />
                    {t("community.post.fromWorks")}
                  </button>
                )}
                <span className="text-xs text-ink-3">{t("community.post.dropHint")}</span>
              </div>
              {worksOpen && (
                <div className="mt-3 border-t border-line/[0.08] pt-3">
                  {works === null ? (
                    <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-16 rounded-lg" />)}</div>
                  ) : works.length === 0 ? (
                    <p className="text-xs text-ink-3">{t("community.requests.noWorks")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {works.map((w) => (
                        <button key={w.id} type="button" onClick={() => pickWork(w)} title={w.title || ""} className="h-16 w-16 overflow-hidden rounded-lg border border-line/10 bg-raised hover:border-accent/60">
                          {w.photos?.[0]?.url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.photos[0].url} alt={w.title || ""} className="h-full w-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">{t("community.post.photosHint", { mb: Math.round(POST_IMAGE_MAX_BYTES / 1048576) })}</p>
          </div>

          {/* Caption */}
          <label className="block">
            <span className="mb-1.5 flex text-sm font-medium">
              {t("community.post.caption")}
              <span className="ml-auto text-xs font-normal text-ink-3">{caption.length} / {POST_CAPTION_MAX}</span>
            </span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, POST_CAPTION_MAX))}
              rows={4}
              placeholder={t("community.post.captionHint")}
              className="input h-auto resize-y py-2.5 leading-relaxed"
            />
          </label>

          <p className="text-xs text-ink-3">{t("community.post.ownOnly")}</p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <footer className="safe-bottom flex flex-shrink-0 justify-end gap-2 border-t border-line/[0.08] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost hidden sm:inline-flex">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={submit} disabled={!ok} className="btn btn-primary w-full sm:w-auto">
            {uploading ? t("community.post.uploading") : t("community.post.publish")}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
