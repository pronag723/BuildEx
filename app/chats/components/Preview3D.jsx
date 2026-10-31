"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatCount } from "../../../lib/works/format.mjs";
import { useScrollLock } from "../../../lib/useScrollLock";
import { generatePreview, MAX_SOURCE_BYTES, PREVIEW_FORMATS } from "../../../lib/preview/client";
import { loadPreviewModel, previewFileUrl } from "../../../lib/preview/api";

// 3D previews in chat (stage 3): making one, the card in the thread, and the
// full-screen viewer. three.js and the voxels load only when someone makes a
// preview or presses "Open in 3D"; the card itself is a small picture.

// The theme's canvas colour for the 3D background ("21 21 21" → rgb()).
function themeColor(token, fallback) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v ? `rgb(${v.split(/\s+/).join(",")})` : fallback;
}

const sizeLine = (size) => (Array.isArray(size) ? size.join(" × ") : "");

function fileSize(bytes, t) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? t("chat.preview.mb", { n: mb.toFixed(1) }) : t("chat.preview.kb", { n: Math.max(1, Math.round(bytes / 1024)) });
}

// ─── Making a preview ────────────────────────────────────────────────────────

/**
 * Opens the file picker straight away. Then: reading with progress, an area
 * form when the build is too big, and the finished preview with a caption
 * box. `onSend({ bytes, thumb, meta, caption })` resolves to { error }.
 */
export function PreviewComposer({ open, onClose, onSend }) {
  const t = useT();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [state, setState] = useState("idle"); // idle | reading | area | ready | error | sending
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // { bytes, meta, thumb, thumbUrl }
  const [error, setError] = useState(null);
  const [area, setArea] = useState({ x: "", z: "", radius: "96" });
  const [caption, setCaption] = useState("");
  useScrollLock(open && state !== "idle");

  const reset = useCallback(() => {
    setFile(null);
    setState("idle");
    setProgress(0);
    setResult((r) => {
      if (r?.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
      return null;
    });
    setError(null);
    setCaption("");
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      // Next tick, so the input exists.
      const id = window.setTimeout(() => fileRef.current?.click(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open, reset]);

  async function read(f, withArea = null) {
    setState("reading");
    setProgress(0);
    setError(null);
    try {
      const { bytes, meta } = await generatePreview(f, (p) => setProgress(p), withArea);
      const [THREE, { renderThumbnail }, { decodePreview }, { gunzipSync }] = await Promise.all([
        import("three"),
        import("../../../lib/preview/viewer"),
        import("../../../lib/preview/voxels"),
        import("fflate"),
      ]);
      const model = decodePreview(bytes, gunzipSync);
      const thumb = await renderThumbnail(THREE, model, { background: themeColor("--surface", "#1c1c1c") });
      setResult({ bytes, meta, thumb, thumbUrl: URL.createObjectURL(thumb) });
      setState("ready");
    } catch (e) {
      // Too big or too spread out: offer to preview just an area of it.
      if ((e?.code === "needs_area" || e?.code === "too_large") && f.size <= MAX_SOURCE_BYTES) {
        setError(e.code);
        setState("area");
      } else {
        setError(e?.code || "parse_failed");
        setState("error");
      }
    }
  }

  function onPick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) {
      onClose();
      return;
    }
    setFile(f);
    read(f);
  }

  async function send() {
    if (!result || state === "sending") return;
    setState("sending");
    const { error: err } = (await onSend({ bytes: result.bytes, thumb: result.thumb, meta: result.meta, caption: caption.trim() })) || {};
    if (err) {
      setState("ready");
      return;
    }
    reset();
    onClose();
  }

  const input = (
    <input ref={fileRef} type="file" accept={PREVIEW_FORMATS.join(",")} onChange={onPick} className="hidden" />
  );
  if (!open) return null;
  if (state === "idle") return input;

  const close = () => {
    if (state === "reading" || state === "sending") return;
    reset();
    onClose();
  };
  const ax = Number(area.x);
  const az = Number(area.z);
  const areaOk = area.x.trim() !== "" && area.z.trim() !== "" && Number.isFinite(ax) && Number.isFinite(az);

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("chat.preview.title")}>
      {input}
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div className="safe-bottom relative w-full rounded-t-2xl border border-line/10 bg-surface p-5 shadow-pop sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold">{t("chat.preview.title")}</h2>
          <button type="button" onClick={close} className="btn btn-ghost btn-icon -mr-2" aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {file && (
          <p className="mt-1 truncate text-xs text-ink-3">
            {file.name} · {fileSize(file.size, t)}
          </p>
        )}

        {state === "reading" && (
          <div className="mt-5">
            <p className="text-sm text-ink-2">
              {t("chat.preview.reading")} {Math.round(progress * 100)}%
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-3 text-xs text-ink-3">{t("chat.preview.localOnly")}</p>
          </div>
        )}

        {state === "error" && (
          <div className="mt-5">
            <p className="text-sm text-danger">{t(`chat.preview.errors.${error}`)}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={close} className="btn btn-ghost">{t("common.cancel")}</button>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary">
                {t("chat.preview.another")}
              </button>
            </div>
          </div>
        )}

        {state === "area" && (
          <div className="mt-4">
            <p className="text-sm text-ink">{t(error === "too_large" ? "chat.preview.errors.too_large" : "chat.preview.errors.needs_area")}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-3">
              {file?.name.toLowerCase().endsWith(".zip") ? t("chat.preview.areaHintWorld") : t("chat.preview.areaHintSchem")}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["x", t("chat.preview.centerX")],
                ["z", t("chat.preview.centerZ")],
                ["radius", t("chat.preview.radius")],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
                  <input
                    value={area[key]}
                    onChange={(e) => setArea((a) => ({ ...a, [key]: e.target.value.replace(/[^\d-]/g, "").slice(0, 8) }))}
                    inputMode="numeric"
                    className="input"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={close} className="btn btn-ghost">{t("common.cancel")}</button>
              <button
                type="button"
                disabled={!areaOk}
                onClick={() => read(file, { center: { x: ax, z: az }, radius: Number(area.radius) || 96 })}
                className="btn btn-primary"
              >
                {t("chat.preview.tryArea")}
              </button>
            </div>
          </div>
        )}

        {(state === "ready" || state === "sending") && result && (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.thumbUrl} alt={t("chat.preview.thumbAlt")} className="aspect-[16/10] w-full rounded-xl border border-line/[0.09] object-cover" />
            <p className="mt-2 text-xs text-ink-2">
              {t("chat.preview.dims", { size: sizeLine(result.meta.size), blocks: formatCount(result.meta.blocks, t.lang) })}
            </p>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 200))}
              placeholder={t("chat.preview.captionPlaceholder")}
              aria-label={t("chat.preview.captionPlaceholder")}
              className="input mt-3"
            />
            <p className="mt-2 text-xs leading-relaxed text-ink-3">{t("chat.preview.onlyPreview")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={close} disabled={state === "sending"} className="btn btn-ghost">{t("common.cancel")}</button>
              <button type="button" onClick={send} disabled={state === "sending"} className="btn btn-primary">
                {state === "sending" && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" />}
                {t("chat.preview.send")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── The card in the thread ──────────────────────────────────────────────────

export function PreviewCard({ message, mine, onOpen }) {
  const t = useT();
  const meta = message.meta || {};
  const thumb = previewFileUrl(meta.thumb);
  return (
    <div className={`card my-1 w-full max-w-sm overflow-hidden ${mine ? "" : ""}`}>
      <button type="button" onClick={() => onOpen(meta)} className="relative block w-full" aria-label={t("chat.preview.open")}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={t("chat.preview.thumbAlt")} className="aspect-[16/10] w-full object-cover" loading="lazy" />
        ) : (
          <span className="block aspect-[16/10] w-full bg-raised" />
        )}
        <span className="tag absolute left-2 top-2 bg-surface/90 text-ink">3D</span>
      </button>
      <div className="px-3.5 py-2.5">
        {meta.caption && <p className="text-sm font-medium [overflow-wrap:anywhere]">{meta.caption}</p>}
        <p className="text-xs text-ink-3">
          {t("chat.preview.dims", { size: sizeLine(meta.size), blocks: formatCount(meta.blocks || 0, t.lang) })}
        </p>
        <button type="button" onClick={() => onOpen(meta)} className="btn btn-secondary btn-sm mt-2.5 w-full">
          {t("chat.preview.open")}
        </button>
      </div>
    </div>
  );
}

// ─── Full-screen viewer ──────────────────────────────────────────────────────

export function Viewer3D({ meta, onClose }) {
  const t = useT();
  const mountRef = useRef(null);
  const ctrlRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [height, setHeight] = useState(0);
  const [slice, setSlice] = useState(0);
  const [grid, setGrid] = useState(false);
  useScrollLock(Boolean(meta));

  useEffect(() => {
    if (!meta) return undefined;
    let disposed = false;
    setStatus("loading");
    (async () => {
      try {
        const [model, THREE, { OrbitControls }, { mountViewer }] = await Promise.all([
          loadPreviewModel(meta.path),
          import("three"),
          import("three/examples/jsm/controls/OrbitControls.js"),
          import("../../../lib/preview/viewer"),
        ]);
        if (disposed || !mountRef.current) return;
        const ctrl = mountViewer(THREE, OrbitControls, mountRef.current, model, {
          background: themeColor("--canvas", "#151515"),
        });
        ctrlRef.current = ctrl;
        setHeight(ctrl.height);
        setSlice(ctrl.height);
        setStatus("ready");
      } catch {
        if (!disposed) setStatus("error");
      }
    })();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      document.removeEventListener("keydown", onKey);
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
    };
  }, [meta, onClose]);

  if (!meta || typeof document === "undefined") return null;
  const ctrl = ctrlRef.current;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label={t("chat.preview.viewerTitle")}>
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line/[0.08] px-3 sm:px-4">
        <button type="button" onClick={onClose} className="btn btn-ghost btn-icon -ml-1" aria-label={t("common.close")}>
          <Icon name="close" size={19} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{meta.caption || t("chat.preview.viewerTitle")}</p>
          <p className="truncate text-xs text-ink-3">
            {t("chat.preview.dims", { size: sizeLine(meta.size), blocks: formatCount(meta.blocks || 0, t.lang) })}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={mountRef} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            {status === "loading" ? (
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-line/20 border-t-accent" />
            ) : (
              <p className="text-sm text-danger">{t("chat.preview.loadFailed")}</p>
            )}
          </div>
        )}
      </div>

      <footer className="safe-bottom flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-line/[0.08] px-3 py-2.5 sm:px-4">
        <button type="button" disabled={!ctrl} onClick={() => ctrl.setView("top")} className="btn btn-secondary btn-sm">
          {t("chat.preview.top")}
        </button>
        <button type="button" disabled={!ctrl} onClick={() => ctrl.setView("iso")} className="btn btn-secondary btn-sm">
          {t("chat.preview.iso")}
        </button>
        <button
          type="button"
          disabled={!ctrl}
          onClick={() => {
            ctrl.reset();
            ctrl.setSlice(height);
            setSlice(height);
          }}
          className="btn btn-ghost btn-sm"
        >
          {t("chat.preview.reset")}
        </button>
        <button
          type="button"
          disabled={!ctrl}
          aria-pressed={grid}
          onClick={() => {
            ctrl.setGrid(!grid);
            setGrid(!grid);
          }}
          className={`btn btn-sm ${grid ? "btn-secondary text-ink" : "btn-ghost"}`}
        >
          <Icon name="grid" size={14} />
          {t("chat.preview.grid")}
        </button>
        <span className="mx-1 hidden h-5 w-px bg-line/[0.1] sm:block" aria-hidden="true" />
        <button type="button" disabled={!ctrl} onClick={() => ctrl.zoom(1.25)} className="btn btn-ghost btn-icon" aria-label={t("chat.preview.zoomOut")}>
          <Icon name="minus" size={16} />
        </button>
        <button type="button" disabled={!ctrl} onClick={() => ctrl.zoom(0.8)} className="btn btn-ghost btn-icon" aria-label={t("chat.preview.zoomIn")}>
          <Icon name="plus" size={16} />
        </button>
        <label className="ml-auto flex min-w-[12rem] flex-1 items-center gap-2 text-xs text-ink-2 sm:flex-none">
          <span className="flex-shrink-0">{t("chat.preview.slice")}</span>
          <input
            type="range"
            min={1}
            max={Math.max(1, height)}
            value={Math.max(1, slice)}
            disabled={!ctrl}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSlice(v);
              ctrl?.setSlice(v);
            }}
            className="w-full accent-[rgb(var(--accent))]"
          />
          <span className="w-10 flex-shrink-0 text-right tabular-nums">{slice}/{height}</span>
        </label>
      </footer>
    </div>,
    document.body
  );
}
