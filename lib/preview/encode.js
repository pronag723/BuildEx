// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — world → preview artifact encoder (Stage 7)
//
// Runs in the builder's browser (via lib/preview/preview.worker.js) when they
// deliver a world. Turns a Minecraft world .zip into a compact, gzipped voxel
// artifact the buyer can render in three.js WITHOUT ever downloading the raw
// world (the raw .zip stays locked in escrow — see migration 0011).
//
// Pipeline: unzip → read region/*.mca → collect non-air blocks → auto-detect the
// built bounding box → cull fully-enclosed blocks (only surface voxels render)
// → map each block to a palette colour → serialise.
//
// Artifact layout (little-endian), then gzipped:
//   [magic "BXV1" 4B][headerLen u32][header JSON utf8][positions Int16 ×3N][colorIdx Uint8 ×N]
// header = { version, bounds:{min:[x,y,z], size:[x,y,z]}, voxelCount, palette:[[r,g,b],...] }
// Positions are stored relative to bounds.min so they fit comfortably in Int16.
//
// Best-effort: throws PreviewError on an empty/too-large/unsupported world so the
// caller can deliver WITHOUT a preview rather than blocking the core flow.
// ─────────────────────────────────────────────────────────────────────────────

import { unzipSync, gzipSync, strToU8 } from "fflate";
import { forEachBlockInRegion, isRegionEntry, regionInRange } from "./anvil";
import { colorForBlock } from "./blockColors";

export const MAGIC = "BXV1";
export const ARTIFACT_VERSION = 1;

// Guards. A commissioned build is localised; these caps keep memory + the GPU
// happy and stop a pathological world (entire generated map) from hanging the
// tab. When auto-detect trips these on an infinite/terrain world the caller
// asks the builder for the build coordinates and retries with a clip box.
const MAX_RAW_VOXELS = 4_000_000; // total non-air blocks we'll hold
const MAX_EXPOSED_VOXELS = 500_000; // surface voxels we'll render

// Auto-detect (no coordinates) guard: if the collected build spans more than
// this horizontally, we almost certainly captured natural terrain rather than a
// single build, so we ask for coordinates instead of rendering a useless blob.
const AUTO_MAX_SPAN = 1024;

// Coordinate-scoped defaults. The clip box is a cube of side 2*radius centred on
// the builder-supplied coordinates; the radius is bounded so a dense terrain
// world stays under MAX_RAW_VOXELS.
export const DEFAULT_RADIUS = 96;
export const MAX_RADIUS = 256;

export class PreviewError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PreviewError";
    // "empty" | "too_large" | "no_regions" | "parse_failed" | "needs_coords"
    this.code = code;
  }
}

// Pack signed world coords into one Number key. Y is small (-64..320); X/Z are
// offset by a large bias and kept within ±2^20, which covers any realistic
// single-build bounding region. Collisions outside that range are acceptable
// for a best-effort preview.
const BIAS = 1 << 20; // 1,048,576
function keyOf(x, y, z) {
  return ((x + BIAS) * 4194304 + (z + BIAS)) * 512 + (y + 64);
}

// opts (optional):
//   center: { x, z, y? } — approximate build coordinates (Minecraft F3 coords).
//                          When present, only region files near (x,z) are read
//                          and blocks are clipped to a cube of side 2*radius.
//   radius: clip half-size in blocks (default DEFAULT_RADIUS, capped MAX_RADIUS).
export function buildPreview(zipBytes, onProgress, opts = {}) {
  onProgress?.(0.05);

  const rawCenter = opts && opts.center;
  const center =
    rawCenter && Number.isFinite(rawCenter.x) && Number.isFinite(rawCenter.z)
      ? {
          x: Math.round(rawCenter.x),
          z: Math.round(rawCenter.z),
          y: Number.isFinite(rawCenter.y) ? Math.round(rawCenter.y) : null,
        }
      : null;
  const radius = center
    ? Math.max(16, Math.min(Math.round(opts.radius || DEFAULT_RADIUS), MAX_RADIUS))
    : 0;
  // Clip box used by the region/chunk/block filters when coordinates are given.
  const clip = center
    ? {
        minX: center.x - radius,
        maxX: center.x + radius,
        minZ: center.z - radius,
        maxZ: center.z + radius,
        minY: center.y === null ? -Infinity : center.y - radius,
        maxY: center.y === null ? Infinity : center.y + radius,
      }
    : null;

  // 1. Unzip, keeping only region files (and, when scoped, only the ones near
  //    the build so we don't decompress hundreds of irrelevant regions).
  let files;
  try {
    files = unzipSync(zipBytes, {
      filter: (f) =>
        isRegionEntry(f.name) && (!center || regionInRange(f.name, center, radius)),
    });
  } catch (e) {
    throw new PreviewError("Could not read the .zip archive.", "parse_failed");
  }
  const regionNames = Object.keys(files);
  if (regionNames.length === 0) {
    if (center) {
      throw new PreviewError(
        "No build was found near those coordinates. Double-check the X/Z from F3 and try again.",
        "needs_coords"
      );
    }
    throw new PreviewError(
      "No Minecraft region files (region/*.mca) found in the archive.",
      "no_regions"
    );
  }
  onProgress?.(0.1);

  // 2. Collect non-air blocks → occupancy map (key → colour index) + bbox.
  const occ = new Map();
  const palette = []; // [r,g,b]
  const paletteIndex = new Map(); // "r,g,b" → index
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let rawCount = 0;

  const colorIndexFor = (name) => {
    const [r, g, b] = colorForBlock(name);
    const ck = `${r},${g},${b}`;
    let pi = paletteIndex.get(ck);
    if (pi === undefined) {
      pi = palette.length;
      palette.push([r, g, b]);
      paletteIndex.set(ck, pi);
    }
    return pi;
  };

  const visit = (x, y, z, name) => {
    const k = keyOf(x, y, z);
    if (!occ.has(k)) {
      rawCount++;
      if (rawCount > MAX_RAW_VOXELS) {
        throw new PreviewError("World is too large to preview.", "too_large");
      }
    }
    occ.set(k, colorIndexFor(name));
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  };

  try {
    for (let i = 0; i < regionNames.length; i++) {
      forEachBlockInRegion(files[regionNames[i]], visit, clip);
      onProgress?.(0.1 + 0.55 * ((i + 1) / regionNames.length));
    }
  } catch (e) {
    // The voxel cap blew. Without coordinates this is the classic
    // infinite/terrain world — ask for the build location. With coordinates the
    // clip box is still too dense, so nudge to a smaller area.
    if (e instanceof PreviewError && e.code === "too_large") {
      if (!center) {
        throw new PreviewError(
          "This looks like a large or infinite world. Enter the approximate build coordinates so we can preview just the build.",
          "needs_coords"
        );
      }
      throw new PreviewError(
        "Too many blocks around those coordinates to preview. Make the coordinates more precise (use the centre of the build).",
        "too_large"
      );
    }
    throw e;
  }

  if (occ.size === 0) {
    if (center) {
      throw new PreviewError(
        "No build was found near those coordinates. Double-check the X/Z/Y from F3 and try again.",
        "needs_coords"
      );
    }
    throw new PreviewError("The world appears to be empty.", "empty");
  }

  // Auto-detect sanity check: a build that spans a huge horizontal area almost
  // certainly means we swept up natural terrain. Ask for coordinates instead of
  // rendering a meaningless blob. (Skipped once coordinates scope the capture.)
  if (!center && (maxX - minX > AUTO_MAX_SPAN || maxZ - minZ > AUTO_MAX_SPAN)) {
    throw new PreviewError(
      "Couldn't isolate the build automatically. Enter the approximate build coordinates so we can preview just the build.",
      "needs_coords"
    );
  }

  // 3. Surface cull — keep a voxel only if at least one of its 6 face-neighbours
  // is air/absent. Interiors are invisible, so this slashes the render count.
  onProgress?.(0.7);
  const positions = []; // relative Int16 x,y,z
  const colorIdx = [];
  const neighbors = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];

  // We need the original coords to test neighbours; reconstruct from the key.
  // (key = ((x+BIAS)*4194304 + (z+BIAS))*512 + (y+64))
  let exposed = 0;
  for (const [k, ci] of occ) {
    const y = (k % 512) - 64;
    const rest = Math.floor(k / 512);
    const z = (rest % 4194304) - BIAS;
    const x = Math.floor(rest / 4194304) - BIAS;

    let onSurface = false;
    for (const [dx, dy, dz] of neighbors) {
      if (!occ.has(keyOf(x + dx, y + dy, z + dz))) {
        onSurface = true;
        break;
      }
    }
    if (!onSurface) continue;

    exposed++;
    if (exposed > MAX_EXPOSED_VOXELS) {
      throw new PreviewError("World is too detailed to preview.", "too_large");
    }
    positions.push(x - minX, y - minY, z - minZ);
    colorIdx.push(ci);
  }
  onProgress?.(0.85);

  // 4. Serialise.
  const header = {
    version: ARTIFACT_VERSION,
    bounds: {
      min: [minX, minY, minZ],
      size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1],
    },
    voxelCount: exposed,
    palette,
    // When the build was scoped to builder-supplied coordinates, record how the
    // capture was framed so the delivery has a reproducible reference.
    ...(center ? { scoped: true, center, radius } : {}),
  };
  const headerBytes = strToU8(JSON.stringify(header));
  const posArr = Int16Array.from(positions);
  const colArr = Uint8Array.from(colorIdx);

  const total = 4 + 4 + headerBytes.length + posArr.byteLength + colArr.byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = 0;
  for (let i = 0; i < 4; i++) out[off++] = MAGIC.charCodeAt(i);
  dv.setUint32(off, headerBytes.length, true);
  off += 4;
  out.set(headerBytes, off);
  off += headerBytes.length;
  out.set(new Uint8Array(posArr.buffer, posArr.byteOffset, posArr.byteLength), off);
  off += posArr.byteLength;
  out.set(colArr, off);

  onProgress?.(0.93);
  const bytes = gzipSync(out);
  onProgress?.(1);

  return {
    bytes,
    meta: {
      version: ARTIFACT_VERSION,
      voxelCount: exposed,
      bounds: header.bounds,
      ...(center ? { scoped: true, center, radius } : {}),
    },
  };
}

// Mirror of the encoder for the viewer side: gunzip + parse a BXV1 artifact into
// { bounds, voxelCount, palette, positions: Int16Array, colorIdx: Uint8Array }.
export function decodePreview(gzBytes, gunzip) {
  const raw = gunzip(gzBytes);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let off = 0;
  const magic = String.fromCharCode(raw[0], raw[1], raw[2], raw[3]);
  if (magic !== MAGIC) throw new Error("Unrecognised preview artifact");
  off = 4;
  const headerLen = dv.getUint32(off, true);
  off += 4;
  const headerJson = new TextDecoder("utf-8").decode(
    raw.subarray(off, off + headerLen)
  );
  off += headerLen;
  const header = JSON.parse(headerJson);
  const n = header.voxelCount;
  // `off` is JSON-length-dependent and usually odd, so we CANNOT build an
  // Int16Array view directly onto `raw.buffer` (that throws unless the byte
  // offset is 2-aligned). Copy the slice into its own buffer first — the
  // resulting Uint8Array is byteOffset 0 and therefore safe to reinterpret.
  const posU8 = raw.slice(off, off + n * 3 * 2);
  const positions = new Int16Array(posU8.buffer, 0, n * 3);
  off += n * 3 * 2;
  const colorIdx = raw.slice(off, off + n);
  return {
    bounds: header.bounds,
    voxelCount: n,
    palette: header.palette,
    positions,
    colorIdx,
  };
}
