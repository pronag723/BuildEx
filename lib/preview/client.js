"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — making a 3D preview from a file the builder picks
//
// The file is read in the browser and never uploaded: only the compact BXV1
// preview (outer blocks and their colours) and a small picture of it leave the
// builder's machine. Parsing runs on the main thread through dynamic imports,
// so fflate and the readers load only when someone actually makes a preview.
// ─────────────────────────────────────────────────────────────────────────────

// Largest file we will open. A schematic is a few MB; a world archive can be
// bigger, but past this point the tab runs out of memory before we finish.
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

export const PREVIEW_FORMATS = [".schem", ".litematic", ".zip"];

export function previewFormatOf(name) {
  const n = String(name || "").toLowerCase();
  if (n.endsWith(".schem")) return "schem";
  if (n.endsWith(".litematic")) return "litematic";
  if (n.endsWith(".zip")) return "world";
  return null;
}

/**
 * Build a preview from a File. `onProgress(0..1)` reports progress; `area`
 * ({ center: {x, z, y?}, radius }) limits it to part of the build. Resolves
 * to { bytes, meta }; rejects with a PreviewError whose `code` says what to do.
 */
export async function generatePreview(file, onProgress, area = null) {
  const { PreviewError, clipFromArea } = await import("./voxels");
  const format = previewFormatOf(file?.name);
  if (!format) {
    throw new PreviewError("Pick a .schem, .litematic or world .zip file.", "unsupported");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new PreviewError("This file is too large to open in the browser.", "too_large");
  }
  // Let the caller paint its "reading…" state before the synchronous work.
  await new Promise((r) => setTimeout(r, 30));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const clip = clipFromArea(area);

  if (format === "world") {
    const { buildWorldPreview } = await import("./world");
    return buildWorldPreview(bytes, onProgress, clip);
  }
  const { buildSchemPreview, buildLitematicPreview } = await import("./schematic");
  return format === "schem"
    ? buildSchemPreview(bytes, onProgress, clip)
    : buildLitematicPreview(bytes, onProgress, clip);
}
