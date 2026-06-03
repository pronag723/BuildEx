"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — preview generation client helper (Stage 7)
//
// Spawns the preview Web Worker, feeds it the world .zip, and resolves with the
// gzipped artifact + meta (or rejects). Keeps the worker lifecycle + URL plumbing
// out of the UI. Best-effort by contract: the caller treats any rejection as
// "deliver without a preview".
// ─────────────────────────────────────────────────────────────────────────────

// Generate a preview artifact from a File/Blob world .zip.
// onProgress(value 0..1) is called as work proceeds. Returns { bytes, meta }.
export function generatePreview(file, onProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      // new URL(..., import.meta.url) lets the bundler emit the worker as its
      // own static chunk — required for the static export (no runtime server).
      worker = new Worker(new URL("./preview.worker.js", import.meta.url), {
        type: "module",
      });
    } catch (e) {
      reject(e);
      return;
    }

    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === "progress") {
        onProgress?.(msg.value);
      } else if (msg.type === "done") {
        cleanup();
        resolve({ bytes: new Uint8Array(msg.bytes), meta: msg.meta });
      } else if (msg.type === "error") {
        cleanup();
        const err = new Error(msg.message || "Preview generation failed.");
        err.code = msg.code;
        reject(err);
      }
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || "Preview worker crashed."));
    };

    file
      .arrayBuffer()
      .then((buf) => worker.postMessage({ zip: buf }, [buf]))
      .catch((e) => {
        cleanup();
        reject(e);
      });
  });
}
