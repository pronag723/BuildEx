"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — preview generation client helper (Stage 7)
//
// Turns a world .zip (held by the builder) into the gzipped voxel artifact. We
// run the conversion on the MAIN THREAD via a dynamic import of the encoder,
// rather than a Web Worker: module workers are flaky under a static export
// served from a subpath (GitHub Pages /BuildEx), and the voxel caps in encode.js
// keep the work bounded to a second or two. Reliability > non-blocking here.
//
// Best-effort by contract: the caller treats any rejection as "deliver without a
// preview", so a failure never blocks the core escrow flow.
// ─────────────────────────────────────────────────────────────────────────────

// Generate a preview artifact from a File/Blob world .zip.
// onProgress(value 0..1) is called as work proceeds. Returns { bytes, meta }.
export async function generatePreview(file, onProgress) {
  // Yield once so the caller's "Generating preview…" state can paint before the
  // synchronous parse/mesh work briefly occupies the thread.
  await new Promise((r) => setTimeout(r, 0));

  const { buildPreview } = await import("./encode");
  const buf = await file.arrayBuffer();
  const zipBytes = new Uint8Array(buf);
  const { bytes, meta } = buildPreview(zipBytes, onProgress);
  return { bytes, meta };
}
