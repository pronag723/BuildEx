"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import {
  deletePortfolioImage,
  insertPortfolioImage,
  listPortfolioImages,
  updatePortfolioPositions,
  uploadPortfolioImage,
} from "../../../lib/onboarding/api";
import {
  PORTFOLIO_ACCEPTED_MIME,
  PORTFOLIO_MAX_FILE_MB,
  PORTFOLIO_MAX_IMAGES,
} from "../../../lib/onboarding/constants";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { translate } from "../../../lib/i18n/translate.mjs";

/**
 * Drag-and-drop portfolio image manager.
 *
 *  ◦ Multiple files at once (queue)
 *  ◦ Real upload progress per file
 *  ◦ Live grid with reorder buttons + delete
 *  ◦ All state synced to portfolio_images table & storage
 *
 * Props:
 *   userId            — the builder's profile id
 *   onCountChange     — called with the new total when images change
 */
export default function PortfolioUploader({ userId, onCountChange, onError }) {
  const t = useT();
  const inputRef = useRef(null);
  const [images, setImages] = useState([]); // saved images from DB
  const [pending, setPending] = useState([]); // [{ tmpId, name, preview, progress }]
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  // Keep the latest onCountChange without making `refresh` depend on it (the
  // account page passes a fresh inline function every render).
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;
    const { images: rows, error } = await listPortfolioImages(supabase, userId);
    if (error) {
      onError?.(error.message || translate("onboarding.portfolioUpload.loadFailed"));
      return;
    }
    setImages(rows);
  }, [userId, onError]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refresh]);

  // Notify the parent of count changes from a passive effect — never from
  // inside a render-phase state updater, which would trigger a setState in
  // AuthProvider mid-render ("Cannot update a component while rendering...").
  useEffect(() => {
    if (loading) return;
    onCountChangeRef.current?.(images.length);
  }, [images.length, loading]);

  function fileToValid(file) {
    if (!PORTFOLIO_ACCEPTED_MIME.includes(file.type)) {
      onError?.(translate("onboarding.portfolioUpload.badType", { name: file.name }));
      return false;
    }
    if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) {
      onError?.(translate("onboarding.portfolioUpload.tooLarge", { name: file.name, mb: PORTFOLIO_MAX_FILE_MB }));
      return false;
    }
    return true;
  }

  async function uploadOne(file, basePosition) {
    const tmpId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preview = URL.createObjectURL(file);
    setPending((prev) => [...prev, { tmpId, name: file.name, preview, progress: 0.05 }]);

    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      setPending((prev) => prev.filter((p) => p.tmpId !== tmpId));
      onError?.(translate("onboarding.portfolioUpload.noStorage"));
      URL.revokeObjectURL(preview);
      return;
    }

    const { url, path, error: uploadErr } = await uploadPortfolioImage(
      supabase,
      userId,
      file,
      (p) => {
        setPending((prev) =>
          prev.map((row) => (row.tmpId === tmpId ? { ...row, progress: p } : row))
        );
      }
    );

    if (uploadErr || !url) {
      setPending((prev) => prev.filter((p) => p.tmpId !== tmpId));
      onError?.(uploadErr?.message || translate("onboarding.portfolioUpload.uploadFailed", { name: file.name }));
      URL.revokeObjectURL(preview);
      return;
    }

    const { image, error: dbErr } = await insertPortfolioImage(supabase, userId, {
      url,
      storagePath: path,
      position: basePosition,
      alt: file.name.replace(/\.[a-z0-9]+$/i, ""),
    });

    setPending((prev) => prev.filter((p) => p.tmpId !== tmpId));
    URL.revokeObjectURL(preview);

    if (dbErr || !image) {
      onError?.(dbErr?.message || translate("onboarding.portfolioUpload.saveFailed"));
      return;
    }
    setImages((prev) => [...prev, image]);
  }

  async function handleFiles(fileList) {
    const incoming = Array.from(fileList || []).filter(fileToValid);
    if (incoming.length === 0) return;

    const room = PORTFOLIO_MAX_IMAGES - images.length - pending.length;
    if (room <= 0) {
      onError?.(translate("onboarding.portfolioUpload.max", { max: PORTFOLIO_MAX_IMAGES }));
      return;
    }
    const accepted = incoming.slice(0, room);
    if (incoming.length > accepted.length) {
      onError?.(translate("onboarding.portfolioUpload.onlyFirst", { n: accepted.length, max: PORTFOLIO_MAX_IMAGES }));
    }

    let position = (images[images.length - 1]?.position ?? -1) + 1;
    // Fire uploads in parallel (Supabase Storage handles concurrency)
    await Promise.all(
      accepted.map((file) => {
        const pos = position++;
        return uploadOne(file, pos);
      })
    );
  }

  async function handleDelete(id) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;
    const prevImages = images;
    const next = images.filter((i) => i.id !== id);
    setImages(next);
    const { error } = await deletePortfolioImage(supabase, userId, id);
    if (error) {
      onError?.(error.message || translate("onboarding.portfolioUpload.deleteFailed"));
      setImages(prevImages);
    }
  }

  async function move(id, delta) {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx < 0) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(idx, 1);
      next.splice(target, 0, row);
      const renumbered = next.map((img, i) => ({ ...img, position: i }));

      const supabase = getSupabaseClient();
      if (supabase && userId) {
        updatePortfolioPositions(
          supabase,
          userId,
          renumbered.map((img) => ({ id: img.id, position: img.position }))
        ).then(({ error }) => {
          if (error) onError?.(error.message || translate("onboarding.portfolioUpload.reorderFailed"));
        });
      }
      return renumbered;
    });
  }

  const used = images.length + pending.length;
  const remaining = PORTFOLIO_MAX_IMAGES - used;

  return (
    <div>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`upload-tile w-full py-9 ${dragOver ? "is-dragging" : ""}`}
        aria-label={t("onboarding.portfolioUpload.aria")}
      >
        <Icon name="upload" size={22} className="mb-1 text-ink-3" />
        <div className="text-sm font-medium text-ink">{t("onboarding.portfolioUpload.drop")}</div>
        <p className="text-xs text-ink-3">
          {t("onboarding.portfolioUpload.limits", { mb: PORTFOLIO_MAX_FILE_MB, max: PORTFOLIO_MAX_IMAGES })}
        </p>
        <p className="mt-2 text-xs text-ink-3">
          <span className={remaining > 0 ? "text-ink-2" : "text-danger"}>
            {remaining > 0 ? t("onboarding.portfolioUpload.slotsLeft", { count: remaining }) : t("onboarding.portfolioUpload.full")}
          </span>
          {used > 0 && <span> · {t("onboarding.portfolioUpload.used", { used, max: PORTFOLIO_MAX_IMAGES })}</span>}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PORTFOLIO_ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Grid */}
      {(images.length > 0 || pending.length > 0) && (
        <div className="portfolio-grid mt-5">
          {images.map((img, i) => (
            <div key={img.id} className="portfolio-tile group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || t("onboarding.portfolioUpload.imageAlt")} loading="lazy" />
              <div className="tile-actions">
                {i === 0 ? (
                  <span className="tile-badge">{t("onboarding.portfolioUpload.cover")}</span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(img.id)}
                  className="tile-btn"
                  aria-label={t("onboarding.portfolioUpload.removeImage")}
                  title={t("onboarding.portfolioUpload.remove")}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <div className="tile-reorder">
                <button
                  type="button"
                  onClick={() => move(img.id, -1)}
                  className="tile-btn"
                  disabled={i === 0}
                  aria-label={t("onboarding.portfolioUpload.moveLeft")}
                  title={t("onboarding.portfolioUpload.moveLeft")}
                >
                  <Icon name="chevronLeft" size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => move(img.id, 1)}
                  className="tile-btn"
                  disabled={i === images.length - 1}
                  aria-label={t("onboarding.portfolioUpload.moveRight")}
                  title={t("onboarding.portfolioUpload.moveRight")}
                >
                  <Icon name="chevronRight" size={15} />
                </button>
              </div>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.tmpId} className="portfolio-tile is-pending">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" />
              <div className="tile-progress">
                <div
                  className="tile-progress-fill"
                  style={{ width: `${Math.round((p.progress || 0) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && images.length === 0 && pending.length === 0 && (
        <div className="text-center text-xs text-ink-3 mt-6">{t("onboarding.portfolioUpload.loading")}</div>
      )}
    </div>
  );
}
