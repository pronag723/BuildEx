// The works mosaic: sizes, resize snapping and reordering. Plain .mjs (no
// React) so node --test can import it directly.
//
// The grid has square cells — 4 columns on a phone, 8 on desktop — and every
// work spans an even number of them, so the same spans work at both widths:
//   s = 1×1 (2×2 cells)   w = 2×1 (4×2)   t = 1×2 (2×4)   l = 2×2 (4×4)

export const WORK_SIZES = {
  s: { cols: 2, rows: 2, label: "1×1" },
  w: { cols: 4, rows: 2, label: "2×1" },
  t: { cols: 2, rows: 4, label: "1×2" },
  l: { cols: 4, rows: 4, label: "2×2" },
};

export const WORK_SIZE_KEYS = Object.keys(WORK_SIZES);

export const DEFAULT_WORK_SIZE = "s";

/** A stored size, or the default for anything unknown (or not stored yet). */
export function normalizeWorkSize(value) {
  return Object.hasOwn(WORK_SIZES, value) ? value : DEFAULT_WORK_SIZE;
}

/** The size with this many columns and rows (each 2 or 4). */
export function sizeFor(cols, rows) {
  if (cols === 4) return rows === 4 ? "l" : "w";
  return rows === 4 ? "t" : "s";
}

/** Pixel lengths of a 2-cell and a 4-cell span for a cell size and gap. */
export function spanMetrics(cell, gap) {
  return { span2: cell * 2 + gap, span4: cell * 4 + gap * 3 };
}

/**
 * The outline a resize drag draws: the tile's starting size plus the pointer's
 * travel, kept between three quarters of the small span and a little past the
 * large one so it can't be dragged to nothing or across the page.
 */
export function resizeOutline(startW, startH, dx, dy, { span2, span4 }) {
  const clamp = (v) => Math.max(span2 * 0.75, Math.min(span4 * 1.06, v));
  return { w: clamp(startW + dx), h: clamp(startH + dy) };
}

/** The size an outline snaps to: each side flips once it passes halfway. */
export function snapSize(w, h, { span2, span4 }) {
  const half = (span2 + span4) / 2;
  return sizeFor(w > half ? 4 : 2, h > half ? 4 : 2);
}

/** `list` with the item `fromId` moved into the slot of `toId`. */
export function moveItem(list, fromId, toId) {
  const from = list.findIndex((x) => x.id === fromId);
  const to = list.findIndex((x) => x.id === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
