// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Client-side image compression
//
// The site is a static export served from GitHub Pages with images hosted on
// Supabase Storage. There is no server-side image pipeline, and Next's image
// optimizer is disabled (`images.unoptimized`), so whatever bytes a user
// uploads are exactly what every visitor downloads. A phone photo can be
// 5–8 MB, which is what made portfolios/avatars crawl on real connections.
//
// To fix this at the source we downscale + re-encode in the browser via a
// <canvas> before the file ever reaches Supabase. This typically shrinks a
// portfolio image from multiple megabytes to ~100–300 KB with no visible
// quality loss at the sizes the UI actually renders.
//
// This module is browser-only (uses Image/canvas/File). Callers already run in
// "use client" components, but each function guards and falls back to the
// original file if anything is unavailable or fails — compression must never
// block an upload.
// ─────────────────────────────────────────────────────────────────────────────

// Per-purpose presets. Dimensions are the *maximum* longest-edge box the image
// is fit into (aspect ratio preserved); the image is never upscaled.
export const IMAGE_PRESETS = {
  // Square-ish, rendered at most ~112px — but keep 2x for retina.
  avatar: { maxWidth: 512, maxHeight: 512, quality: 0.85 },
  // Wide hero banner.
  banner: { maxWidth: 1920, maxHeight: 1080, quality: 0.82 },
  // Portfolio gallery / cards.
  portfolio: { maxWidth: 1600, maxHeight: 1600, quality: 0.82 },
};

// Formats we can safely re-encode through canvas. GIFs are skipped because
// canvas would flatten an animated GIF to a single frame; SVGs are vector and
// shouldn't be rasterised.
const RECOMPRESSABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function canCompress(file) {
  return (
    typeof document !== "undefined" &&
    typeof createImageBitmap !== "undefined" &&
    file &&
    RECOMPRESSABLE.has(file.type)
  );
}

// Prefer WebP when the browser can actually encode it (Safari < 14 can't),
// otherwise fall back to JPEG. PNGs with transparency are kept lossless-ish by
// WebP; if WebP is unavailable we keep PNG to preserve any alpha channel.
function pickOutputType(sourceType) {
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const webpUrl = canvas.toDataURL("image/webp");
      if (webpUrl.startsWith("data:image/webp")) return "image/webp";
    } catch {
      /* fall through */
    }
  }
  return sourceType === "image/png" ? "image/png" : "image/jpeg";
}

function extensionFor(mimeType) {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

/**
 * Downscale + re-encode an image File in the browser. Returns a new File on
 * success, or the original File untouched if compression isn't possible or
 * wouldn't help (the result is only used when it's actually smaller).
 *
 * @param {File} file
 * @param {{maxWidth:number, maxHeight:number, quality:number}} preset
 * @returns {Promise<File>}
 */
export async function compressImage(file, preset = IMAGE_PRESETS.portfolio) {
  if (!canCompress(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width: srcW, height: srcH } = bitmap;
    if (!srcW || !srcH) {
      bitmap.close?.();
      return file;
    }

    const scale = Math.min(1, preset.maxWidth / srcW, preset.maxHeight / srcH);
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    bitmap.close?.();

    const outType = pickOutputType(file.type);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, outType, preset.quality)
    );
    if (!blob) return file;

    // Only adopt the re-encoded version if it's genuinely smaller; tiny,
    // already-optimised images can grow after a round-trip.
    if (blob.size >= file.size) return file;

    const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.${extensionFor(outType)}`, {
      type: outType,
      lastModified: Date.now(),
    });
  } catch {
    // Never let compression failures block an upload — fall back to original.
    return file;
  }
}
