// A Minecraft world .zip → preview. Reads only region/*.mca (and, with an
// area, only the regions near it) through anvil.js into the shared collector.

import { unzipSync } from "fflate";
import { forEachBlockInRegion, isRegionEntry, regionInRange } from "./anvil";
import { createCollector, PreviewError } from "./voxels";

export function buildWorldPreview(zipBytes, onProgress, clip = null) {
  onProgress?.(0.05);
  let files;
  try {
    files = unzipSync(zipBytes, {
      filter: (f) => isRegionEntry(f.name) && (!clip || regionInRange(f.name, clip.center, clip.radius)),
    });
  } catch {
    throw new PreviewError("Could not read the .zip archive.", "parse_failed");
  }
  const names = Object.keys(files);
  if (names.length === 0) {
    throw clip
      ? new PreviewError("Nothing was found in that area.", "needs_area")
      : new PreviewError("There is no world in this archive (no region/*.mca files).", "unsupported");
  }
  onProgress?.(0.1);

  const collector = createCollector({ clip, format: "world" });
  for (let i = 0; i < names.length; i++) {
    forEachBlockInRegion(files[names[i]], collector.visit, clip);
    onProgress?.(0.1 + 0.6 * ((i + 1) / names.length));
  }
  return collector.finish(onProgress);
}
