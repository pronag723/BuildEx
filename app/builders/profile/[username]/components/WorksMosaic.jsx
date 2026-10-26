"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { publicAsset } from "../../../../home/utils";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../../../lib/icons";
import { useFlip, FLIP_EASING } from "../../../../../lib/ui/useFlip";
import { usePrefersReducedMotion } from "../../../../../lib/ui/usePrefersReducedMotion";
import { WORK_SIZES, moveItem, resizeOutline, snapSize, spanMetrics } from "../../../../../lib/works/layout.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// The works mosaic — one component for the public profile and the owner's
// editor, so the two can't drift apart. Square cells, 4 columns on a phone and
// 8 from `lg` (see .mosaic in globals.css); each work spans the cells of its
// saved size, and `grid-auto-flow: dense` fills the holes.
//
// Read-only, a tap opens the work. With `editable`, `arranging` turns on the
// phone-widget mode: tiles sway, a press-and-drag lifts one and reorders the
// others under it, the corner arc resizes it, "−" removes it. The mosaic owns
// only the gesture; the order and sizes live with the parent, which gets every
// change through onLayoutChange and saves them on Done.
//
// Pinning holds one work first: the pin button (arranging) moves it to the
// front, nothing can be dropped in front of it, and dragging it away unpins
// it. Visitors see a "Pinned" badge on it.
// ─────────────────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 6;

// Column count, gap and cell size of the grid as laid out right now.
function gridMetrics(grid) {
  const style = getComputedStyle(grid);
  const cols = style.gridTemplateColumns.split(" ").filter(Boolean).length || 4;
  const gap = parseFloat(style.columnGap) || 0;
  const cell = (grid.clientWidth - gap * (cols - 1)) / cols;
  return { cols, gap, cell };
}

// Each tile's own sway: tempo, phase and direction, from the canvas.
const jiggleStyle = (i) => ({
  "--jextra": `${((i * 0.037) % 0.12).toFixed(3)}s`,
  "--jdelay": `-${((i * 0.29) % 0.5).toFixed(2)}s`,
  "--jdir": i % 2 ? "reverse" : "normal",
});

function TileFace({ work, owner, large, showPin }) {
  const t = useT();
  const cover = work.photos[0];
  const untitled = !work.title;
  return (
    <>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicAsset(cover.url)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          loading={large ? "eager" : "lazy"}
          decoding="async"
        />
      ) : (
        <span className="block-grid absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="photo" size={14} /> {t("profile.works.addPhotos")}
          </span>
        </span>
      )}
      {((showPin && work.pinned) || work.removed) && (
        <span className="absolute left-2 top-2 flex flex-col items-start gap-1 lg:left-2.5 lg:top-2.5">
          {showPin && work.pinned && (
            <span className="inline-flex h-6 items-center gap-1 rounded-lg bg-black/55 px-2 text-[11px] font-semibold text-white lg:text-xs">
              <Icon name="pin" size={12} /> {t("profile.works.pinned")}
            </span>
          )}
          {work.removed && (
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-black/65 px-2 text-[11px] font-semibold text-white">
              <Icon name="eyeOff" size={12} /> {t("profile.works.takenDown")}
            </span>
          )}
        </span>
      )}
      {(work.title || owner) && cover && (
        <>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/70 to-transparent lg:h-[55%]" />
          <span
            className={`pointer-events-none absolute inset-x-2.5 bottom-[9px] flex items-center gap-1.5 text-left font-semibold lg:inset-x-3.5 lg:bottom-3 ${
              large ? "text-[17px] lg:text-xl" : "text-[12.5px] lg:text-sm"
            } ${untitled ? "text-[rgb(var(--warn-on-image))]" : "text-white"}`}
          >
            {untitled && <Icon name="alert" size={13} strokeWidth={2.2} className="flex-shrink-0" />}
            <span className="truncate">{work.title || t("profile.works.addTitle")}</span>
          </span>
        </>
      )}
    </>
  );
}

export function WorksMosaicSkeleton() {
  const sizes = ["l", "t", "s", "s", "w"];
  return (
    <div className="mosaic" aria-hidden="true">
      {sizes.map((size, i) => (
        <div
          key={i}
          className="skeleton rounded-2xl lg:rounded-[18px]"
          style={{ gridColumn: `span ${WORK_SIZES[size].cols}`, gridRow: `span ${WORK_SIZES[size].rows}` }}
        />
      ))}
    </div>
  );
}

export default function WorksMosaic({
  works,
  onOpen,
  // Public profile: pagination.
  total = works.length,
  loading = false,
  loadingMore = false,
  onLoadMore,
  // Owner's editor.
  owner = false,
  editable = false,
  arranging = false,
  onLayoutChange,
  onRemove,
}) {
  const t = useT();
  const gridRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const capture = useFlip(gridRef, { disabled: reduced });
  const [dragId, setDragId] = useState(null);
  const [ghost, setGhost] = useState(null); // { id, w, h } while resizing
  // The gesture in progress: { mode: "drag" | "resize", id, ... }.
  const gesture = useRef(null);
  const worksRef = useRef(works);
  worksRef.current = works;

  // Square cells: the row height follows the column width.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const { cell } = gridMetrics(grid);
      if (cell > 0) grid.style.setProperty("--cell", `${cell}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [loading, works.length > 0]);

  // Keeps the dragged tile under the pointer, whatever slot it holds now.
  const placeDragged = () => {
    const g = gesture.current;
    const grid = gridRef.current;
    if (!g || g.mode !== "drag" || !g.moved || !grid) return;
    const node = grid.querySelector(`[data-flip-id="${g.id}"]`);
    if (!node) return;
    const box = grid.getBoundingClientRect();
    const dx = g.x - box.left - g.offsetX - node.offsetLeft;
    const dy = g.y - box.top - g.offsetY - node.offsetTop;
    node.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  useLayoutEffect(() => {
    placeDragged();
  });

  const commit = useCallback(
    (next, skipId) => {
      capture(skipId);
      onLayoutChange?.(next);
    },
    [capture, onLayoutChange]
  );

  // ─── Pointer handling (arrange mode) ───────────────────────────────────────
  // The pointer is captured by the grid, not the tile: React moves tiles
  // around the DOM as they reorder, and a moved node can lose its capture.
  const onTileDown = (event, work) => {
    if (!arranging || gesture.current) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (event.target.closest?.("[data-nodrag]")) return;
    const box = event.currentTarget.getBoundingClientRect();
    gesture.current = {
      mode: "drag",
      id: work.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      moved: false,
      over: null,
    };
  };

  const onResizeDown = (event, work) => {
    if (!arranging || gesture.current) return;
    event.stopPropagation();
    event.preventDefault();
    const grid = gridRef.current;
    const tile = event.currentTarget.closest("[data-flip-id]");
    if (!grid || !tile) return;
    try {
      grid.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety; the gesture still works without it */
    }
    const box = tile.getBoundingClientRect();
    const { cell, gap } = gridMetrics(grid);
    gesture.current = {
      mode: "resize",
      id: work.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      w0: box.width,
      h0: box.height,
      metrics: spanMetrics(cell, gap),
    };
    setGhost({ id: work.id, w: box.width, h: box.height });
  };

  const onGridMove = (event) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;

    if (g.mode === "resize") {
      const outline = resizeOutline(g.w0, g.h0, event.clientX - g.startX, event.clientY - g.startY, g.metrics);
      setGhost({ id: g.id, ...outline });
      const size = snapSize(outline.w, outline.h, g.metrics);
      const list = worksRef.current;
      const current = list.find((w) => w.id === g.id);
      if (current && current.layoutSize !== size) {
        commit(list.map((w) => (w.id === g.id ? { ...w, layoutSize: size } : w)));
      }
      return;
    }

    g.x = event.clientX;
    g.y = event.clientY;
    if (!g.moved) {
      if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < DRAG_THRESHOLD) return;
      g.moved = true;
      try {
        gridRef.current?.setPointerCapture(g.pointerId);
      } catch {
        /* see above */
      }
      setDragId(g.id);
    }

    // The tile under the pointer, ignoring the one being dragged.
    let overId = null;
    for (const node of document.elementsFromPoint(event.clientX, event.clientY)) {
      const tile = node.closest?.("[data-flip-id]");
      if (tile && tile.dataset.flipId !== String(g.id) && gridRef.current?.contains(tile)) {
        overId = tile.dataset.flipId;
        break;
      }
    }
    if (!overId || overId === g.over) {
      if (!overId) g.over = null;
      placeDragged();
      return;
    }
    g.over = overId;
    const list = worksRef.current;
    const target = list.find((w) => String(w.id) === overId);
    if (!target) return;
    // The pinned work keeps the first slot.
    if (list[0]?.pinned && list[0].id !== g.id && target.id === list[0].id) {
      placeDragged();
      return;
    }
    const next = moveItem(list, g.id, target.id).map((w, i) =>
      w.id === g.id && w.pinned && i !== 0 ? { ...w, pinned: false } : w
    );
    commit(next, g.id);
  };

  const togglePin = (work) => {
    const list = worksRef.current;
    if (work.pinned) {
      commit(list.map((w) => (w.id === work.id ? { ...w, pinned: false } : w)));
      return;
    }
    const rest = list.filter((w) => w.id !== work.id).map((w) => (w.pinned ? { ...w, pinned: false } : w));
    commit([{ ...work, pinned: true }, ...rest]);
  };

  const onGridUp = (event) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    // A tile handing its implicit (touch) capture over to the grid bubbles a
    // lostpointercapture up here too; only the grid losing it ends the drag.
    if (event.type === "lostpointercapture" && event.target !== gridRef.current) return;
    gesture.current = null;
    if (g.mode === "resize") {
      setGhost(null);
      return;
    }
    if (!g.moved) return;
    const node = gridRef.current?.querySelector(`[data-flip-id="${g.id}"]`);
    if (node) {
      const from = node.style.transform;
      node.style.transform = "";
      if (from && !reduced) {
        node.animate([{ transform: from }, { transform: "none" }], { duration: 260, easing: FLIP_EASING });
      }
    }
    setDragId(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return <WorksMosaicSkeleton />;

  if (works.length === 0) {
    if (editable) return null; // the editor shows its own empty state
    return (
      <div className="block-grid flex aspect-[16/10] items-center justify-center rounded-xl px-6 text-center text-sm text-ink-3 lg:aspect-[21/9]">
        {t("profile.works.empty")}
      </div>
    );
  }

  const remaining = Math.max(0, total - works.length);
  const active = editable && arranging;

  return (
    <div>
      <div
        ref={gridRef}
        className={`mosaic ${active ? "is-arranging select-none" : ""}`}
        onPointerMove={active ? onGridMove : undefined}
        onPointerUp={active ? onGridUp : undefined}
        onPointerCancel={active ? onGridUp : undefined}
        onLostPointerCapture={active ? onGridUp : undefined}
      >
        {works.map((work, i) => {
          const size = WORK_SIZES[work.layoutSize] || WORK_SIZES.s;
          const large = work.layoutSize === "l";
          const lifted = dragId === work.id;
          const resizing = ghost?.id === work.id;
          const label = work.title || t(owner ? "profile.works.addTitle" : "profile.works.untitled");
          return (
            <div
              key={work.id}
              data-flip-id={work.id}
              className={`mosaic-tile group ${lifted ? "is-lifted" : ""} ${resizing ? "is-resizing is-still" : ""}`}
              style={{ gridColumn: `span ${size.cols}`, gridRow: `span ${size.rows}`, ...(active ? jiggleStyle(i) : null) }}
              onPointerDown={active ? (event) => onTileDown(event, work) : undefined}
            >
              <button
                type="button"
                className="mosaic-tile-body block w-full text-left"
                onClick={() => !active && onOpen?.(work)}
                tabIndex={active ? -1 : 0}
                aria-label={label}
              >
                <TileFace work={work} owner={owner} large={large} showPin={!active} />
                {editable && !active && (
                  <span className="pointer-events-none absolute right-2.5 top-2.5 hidden h-[30px] items-center gap-1.5 rounded-full bg-black/60 px-3 text-[12.5px] font-semibold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 lg:inline-flex">
                    <Icon name="pencil" size={13} strokeWidth={2.2} />
                    {t("common.edit")}
                  </span>
                )}
              </button>

              {active && !lifted && (
                <>
                  <button
                    type="button"
                    data-nodrag="1"
                    onClick={() => onRemove?.(work)}
                    aria-label={t("account.editor.works.remove", { title: label })}
                    className="mosaic-pop absolute -left-[7px] -top-[7px] z-[3] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#3A3A3A] text-[#EDEDEB] shadow-[0_2px_6px_rgb(0_0_0/0.5)] lg:-left-2 lg:-top-2 lg:h-7 lg:w-7"
                    style={{ animationDelay: `${(i * 0.03).toFixed(2)}s` }}
                  >
                    <Icon name="minus" size={12} strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    data-nodrag="1"
                    onClick={() => togglePin(work)}
                    aria-pressed={Boolean(work.pinned)}
                    aria-label={t(work.pinned ? "account.editor.works.unpin" : "account.editor.works.pin", { title: label })}
                    title={t(work.pinned ? "account.editor.works.unpin" : "account.editor.works.pin", { title: label })}
                    className={`mosaic-pop absolute -right-[7px] -top-[7px] z-[3] flex h-[26px] w-[26px] items-center justify-center rounded-full shadow-[0_2px_6px_rgb(0_0_0/0.5)] lg:-right-2 lg:-top-2 lg:h-7 lg:w-7 ${
                      work.pinned ? "bg-accent text-accent-fg" : "bg-[#3A3A3A] text-[#EDEDEB]"
                    }`}
                    style={{ animationDelay: `${(i * 0.03).toFixed(2)}s` }}
                  >
                    <Icon name="pin" size={13} strokeWidth={2.4} filled={Boolean(work.pinned)} />
                  </button>
                  <button
                    type="button"
                    data-nodrag="1"
                    onPointerDown={(event) => onResizeDown(event, work)}
                    aria-label={t("account.editor.works.resize", { size: size.label })}
                    className="mosaic-pop absolute -bottom-1.5 -right-1.5 z-[3] flex h-10 w-10 cursor-nwse-resize touch-none items-end justify-end lg:h-[42px] lg:w-[42px]"
                    style={{ animationDelay: `${(i * 0.03).toFixed(2)}s` }}
                  >
                    {/* The iOS-style corner arc; drawn, not an icon glyph. */}
                    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true" className="drop-shadow-[0_1px_3px_rgb(0_0_0/0.6)] lg:h-8 lg:w-8">
                      <path d="M24 9v5a10 10 0 0 1-10 10H9" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                  </button>
                </>
              )}

              {resizing && <span className="mosaic-ghost" style={{ width: ghost.w, height: ghost.h }} />}
            </div>
          );
        })}
      </div>

      {!editable && remaining > 0 && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} className="btn btn-secondary mt-5 w-full">
          {loadingMore ? t("profile.works.loading") : t("profile.works.showMore", { count: remaining })}
        </button>
      )}
    </div>
  );
}
