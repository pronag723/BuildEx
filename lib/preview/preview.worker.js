// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — preview generation Web Worker (Stage 7)
//
// Parsing a world .zip and meshing it can take a few seconds for a big build, so
// we run it off the main thread to keep the deliver modal responsive. The page
// posts { zip: ArrayBuffer }; we stream { type:"progress", value } updates and
// finish with { type:"done", bytes, meta } or { type:"error", message, code }.
// ─────────────────────────────────────────────────────────────────────────────

import { buildPreview, PreviewError } from "./encode";

self.onmessage = (e) => {
  const { zip } = e.data || {};
  if (!zip) {
    self.postMessage({ type: "error", message: "No world data received." });
    return;
  }
  try {
    const zipBytes = new Uint8Array(zip);
    const { bytes, meta } = buildPreview(zipBytes, (value) => {
      self.postMessage({ type: "progress", value });
    });
    // Transfer the artifact buffer back to avoid a copy.
    self.postMessage({ type: "done", bytes, meta }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err?.message || "Preview generation failed.",
      code: err instanceof PreviewError ? err.code : "unknown",
    });
  }
};
