// The profile header background (migration 0110): none, a colour, or an image
// from the builder's own portfolios folder, dimmed so the text stays readable.
// Plain .mjs (no React, no Supabase) so node --test can import it directly.
//
// Rows read before 0110 has run have no header_bg_* columns at all; they read
// as "none", so the page simply shows no background.

export const HEADER_BG_KINDS = ["none", "color", "image"];

// Dark swatches that keep white text readable: green, navy, plum, brown,
// wine, teal.
export const HEADER_BG_PRESETS = ["#123222", "#15233F", "#2B1834", "#3A2410", "#3B1220", "#0F2E33"];

export const HEADER_BG_DIM_DEFAULT = 45;
export const HEADER_BG_DIM_MAX = 90;

// Where the colour picker opens when nothing has been picked yet.
export const HEADER_BG_COLOR_DEFAULT = HEADER_BG_PRESETS[2];

const HEX = /^#[0-9a-fA-F]{6}$/;
const SAFE_URL = /^https:\/\/[^\s"'<>\\`]+$/;

export const isHexColor = (value) => typeof value === "string" && HEX.test(value);

export const NO_HEADER_BG = Object.freeze({
  kind: "none",
  color: null,
  imageUrl: null,
  dim: HEADER_BG_DIM_DEFAULT,
});

function clampDim(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return HEADER_BG_DIM_DEFAULT;
  return Math.max(0, Math.min(HEADER_BG_DIM_MAX, n));
}

/**
 * builder_profiles row → { kind, color, imageUrl, dim }. Anything that doesn't
 * validate falls back to no background rather than rendering something odd.
 */
export function readHeaderBg(row) {
  if (!row || typeof row !== "object") return NO_HEADER_BG;
  const color = isHexColor(row.header_bg_color) ? row.header_bg_color : null;
  const imageUrl =
    typeof row.header_bg_image_url === "string" && SAFE_URL.test(row.header_bg_image_url)
      ? row.header_bg_image_url
      : null;
  let kind = HEADER_BG_KINDS.includes(row.header_bg_kind) ? row.header_bg_kind : "none";
  if ((kind === "color" && !color) || (kind === "image" && !imageUrl)) kind = "none";
  return { kind, color, imageUrl, dim: row.header_bg_dim == null ? HEADER_BG_DIM_DEFAULT : clampDim(row.header_bg_dim) };
}

/** { kind, color, imageUrl, dim } → the builder_profiles columns to write. */
export function headerBgRow(bg) {
  const color = isHexColor(bg?.color) ? bg.color.toUpperCase() : null;
  const imageUrl = typeof bg?.imageUrl === "string" && bg.imageUrl ? bg.imageUrl : null;
  let kind = HEADER_BG_KINDS.includes(bg?.kind) ? bg.kind : "none";
  if ((kind === "color" && !color) || (kind === "image" && !imageUrl)) kind = "none";
  return {
    header_bg_kind: kind,
    header_bg_color: color,
    header_bg_image_url: imageUrl,
    header_bg_dim: clampDim(bg?.dim),
  };
}

export const hasHeaderBg = (bg) => Boolean(bg) && bg.kind !== "none";

/**
 * The overlay that dims the background and fades it into the page. Built on
 * the canvas colour, so the light theme fades into white-ish, the dark theme
 * into near-black.
 */
export function headerBgOverlay(dim) {
  const a = clampDim(dim) / 100;
  const a2 = Math.min(1, a + 0.3);
  return `linear-gradient(to bottom, rgb(var(--canvas) / ${a.toFixed(2)}) 0%, rgb(var(--canvas) / ${a2.toFixed(2)}) 60%, rgb(var(--canvas)) 100%)`;
}

/**
 * The storage path inside the portfolios bucket for one of our public URLs
 * ("<uid>/<file>"), or null for anything else — used to delete an image the
 * builder replaced.
 */
export function storagePathFromUrl(url, userId) {
  if (typeof url !== "string" || !userId) return null;
  const match = url.match(/\/storage\/v1\/object\/public\/portfolios\/([^?#]+)$/);
  if (!match) return null;
  const path = decodeURIComponent(match[1]);
  return path.startsWith(`${userId}/`) && !path.slice(userId.length + 1).includes("/") ? path : null;
}
