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
  const inputRef = useRef(null);
  const [images, setImages] = useState([]); // saved images from DB
  const [pending, setPending] = useState([]); // [{ tmpId, name, preview, progress }]
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;
    const { images: rows, error } = await listPortfolioImages(supabase, userId);
    if (error) {
      onError?.(error.message || "Failed to load portfolio.");
      return;
    }
    setImages(rows);
    onCountChange?.(rows.length);
  }, [userId, onCountChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refresh]);

  function fileToValid(file) {
    if (!PORTFOLIO_ACCEPTED_MIME.includes(file.type)) {
      onError?.(`"${file.name}" isn't a supported image format.`);
      return false;
    }
    if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) {
      onError?.(`"${file.name}" is larger than ${PORTFOLIO_MAX_FILE_MB} MB.`);
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
      onError?.("Couldn't reach storage.");
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
      onError?.(uploadErr?.message || `Failed to upload "${file.name}".`);
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
      onError?.(dbErr?.message || "Failed to save uploaded image.");
      return;
    }
    setImages((prev) => {
      const next = [...prev, image];
      onCountChange?.(next.length);
      return next;
    });
  }

  async function handleFiles(fileList) {
    const incoming = Array.from(fileList || []).filter(fileToValid);
    if (incoming.length === 0) return;

    const room = PORTFOLIO_MAX_IMAGES - images.length - pending.length;
    if (room <= 0) {
      onError?.(`Maximum ${PORTFOLIO_MAX_IMAGES} portfolio images.`);
      return;
    }
    const accepted = incoming.slice(0, room);
    if (incoming.length > accepted.length) {
      onError?.(`Only the first ${accepted.length} fit — max ${PORTFOLIO_MAX_IMAGES}.`);
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
    onCountChange?.(next.length);
    const { error } = await deletePortfolioImage(supabase, userId, id);
    if (error) {
      onError?.(error.message || "Failed to delete image.");
      setImages(prevImages);
      onCountChange?.(prevImages.length);
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
          if (error) onError?.(error.message || "Failed to reorder.");
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
        className={`upload-tile w-full py-10 ${dragOver ? "is-dragging" : ""}`}
        aria-label="Upload portfolio images"
      >
        <svg viewBox="0 0 24 24" className="w-9 h-9 text-[#4ade80] mb-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div className="text-base font-semibold">Drop images here or click to browse</div>
        <p className="text-xs text-gray-500 mt-1">
          PNG, JPG, WebP, GIF · up to {PORTFOLIO_MAX_FILE_MB} MB each · up to {PORTFOLIO_MAX_IMAGES} images
        </p>
        <p className="text-[11px] mt-3 text-gray-500">
          <span className={remaining > 0 ? "text-[#4ade80]" : "text-amber-300"}>
            {remaining > 0 ? `${remaining} slot${remaining === 1 ? "" : "s"} left` : "Portfolio full"}
          </span>
          {used > 0 && <span className="text-gray-600"> · {used}/{PORTFOLIO_MAX_IMAGES} used</span>}
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
        <div className="portfolio-grid mt-6">
          {images.map((img, i) => (
            <div key={img.id} className="portfolio-tile group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || "Portfolio image"} loading="lazy" />
              <div className="tile-actions">
                {i === 0 ? (
                  <span className="tile-badge">Cover</span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(img.id)}
                  className="tile-btn"
                  aria-label="Remove image"
                  title="Remove"
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9" />
                  </svg>
                </button>
              </div>
              <div className="tile-reorder">
                <button
                  type="button"
                  onClick={() => move(img.id, -1)}
                  className="tile-btn"
                  disabled={i === 0}
                  aria-label="Move left"
                  title="Move left"
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13L5 8l5-5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => move(img.id, 1)}
                  className="tile-btn"
                  disabled={i === images.length - 1}
                  aria-label="Move right"
                  title="Move right"
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
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
        <div className="text-center text-xs text-gray-500 mt-6">Loading portfolio…</div>
      )}
    </div>
  );
}
