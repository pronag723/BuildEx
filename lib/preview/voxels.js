// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — voxel collector and the BXV1 preview format
//
// Every source a builder can preview from — a world .zip, a Sponge .schem, a
// Litematica .litematic — is read into the same collector: block positions and
// colours, the bounding box, and a cap on how many blocks we will hold. The
// collector then keeps only the blocks you can see (a block whose six faces are
// all covered is invisible) and writes the compact artifact the chat sends.
//
// Artifact layout (little-endian), then gzipped:
//   [magic "BXV1" 4B][headerLen u32][header JSON utf8][positions Int16 ×3N][colorIdx Uint8 ×N]
// header = { version, bounds:{min:[x,y,z], size:[x,y,z]}, voxelCount, palette:[[r,g,b],...], format }
// Positions are relative to bounds.min. Only outer blocks and colours are
// stored — no block ids, no interiors — so a preview cannot be turned back
// into a usable schematic.
//
// Runs on the main thread (module workers broke under the GitHub Pages
// subpath in the old order flow); the caps keep it to a second or two.
// ─────────────────────────────────────────────────────────────────────────────

import { gzipSync, strToU8 } from "fflate";
import { colorForBlock, isAir } from "./blockColors";

export const MAGIC = "BXV1";
export const ARTIFACT_VERSION = 1;

// Caps. A commission is a localised build; these keep memory and the GPU happy
// and stop a whole generated map from hanging the tab.
export const MAX_RAW_VOXELS = 4_000_000;
export const MAX_EXPOSED_VOXELS = 500_000;
// Without an area, a capture wider than this almost certainly swept up natural
// terrain, so we ask for an area instead of rendering a blob.
export const AUTO_MAX_SPAN = 1024;
// The area the builder can pick: a square of side 2*radius around a centre.
export const DEFAULT_RADIUS = 96;
export const MAX_RADIUS = 512;

export class PreviewError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PreviewError";
    // "empty" | "too_large" | "needs_area" | "parse_failed" | "unsupported"
    this.code = code;
  }
}

// Normalise the optional area { center: {x, z, y?}, radius } into a clip box.
export function clipFromArea(area) {
  const c = area && area.center;
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) return null;
  const radius = Math.max(16, Math.min(Math.round(area.radius || DEFAULT_RADIUS), MAX_RADIUS));
  const y = Number.isFinite(c.y) ? Math.round(c.y) : null;
  return {
    center: { x: Math.round(c.x), z: Math.round(c.z), y },
    radius,
    minX: Math.round(c.x) - radius,
    maxX: Math.round(c.x) + radius,
    minZ: Math.round(c.z) - radius,
    maxZ: Math.round(c.z) + radius,
    minY: y === null ? -Infinity : y - radius,
    maxY: y === null ? Infinity : y + radius,
  };
}

// Pack signed coords into one Number key, inside 2^52 so it stays exact:
// X and Z fit ±2^19 (524 288 blocks), Y fits -2048..2047.
const BIAS = 1 << 19;
const SPAN = 1 << 20;
const keyOf = (x, y, z) => ((x + BIAS) * SPAN + (z + BIAS)) * 4096 + (y + 2048);

// "minecraft:oak_stairs[facing=east]" → "minecraft:oak_stairs".
export function baseBlockName(name) {
  if (!name) return name;
  const i = name.indexOf("[");
  return i === -1 ? name : name.slice(0, i);
}

/**
 * A collector for one preview. `visit(x, y, z, name)` adds a block (air is
 * ignored, anything outside `clip` too); `finish(onProgress)` culls, encodes
 * and returns { bytes, meta }.
 */
export function createCollector({ clip = null, format = "world" } = {}) {
  const occ = new Map();
  const palette = [];
  const paletteIndex = new Map();
  const nameIndex = new Map();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const colorIndexFor = (name) => {
    let pi = nameIndex.get(name);
    if (pi !== undefined) return pi;
    const [r, g, b] = colorForBlock(baseBlockName(name));
    const ck = `${r},${g},${b}`;
    pi = paletteIndex.get(ck);
    if (pi === undefined) {
      pi = palette.length;
      palette.push([r, g, b]);
      paletteIndex.set(ck, pi);
    }
    nameIndex.set(name, pi);
    return pi;
  };

  function visit(x, y, z, name) {
    if (isAir(baseBlockName(name))) return;
    if (
      clip &&
      (x < clip.minX || x > clip.maxX || z < clip.minZ || z > clip.maxZ || y < clip.minY || y > clip.maxY)
    ) {
      return;
    }
    const k = keyOf(x, y, z);
    if (!occ.has(k) && occ.size >= MAX_RAW_VOXELS) {
      throw new PreviewError("Too many blocks to preview.", "too_large");
    }
    occ.set(k, colorIndexFor(name));
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  function finish(onProgress) {
    if (occ.size === 0) {
      throw new PreviewError(
        clip ? "Nothing was found in that area." : "The file has no blocks to show.",
        clip ? "needs_area" : "empty"
      );
    }
    if (!clip && (maxX - minX > AUTO_MAX_SPAN || maxZ - minZ > AUTO_MAX_SPAN)) {
      throw new PreviewError("The build is too spread out. Pick the area to preview.", "needs_area");
    }

    onProgress?.(0.75);
    const positions = [];
    const colorIdx = [];
    const n6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [k, ci] of occ) {
      const y = (k % 4096) - 2048;
      const rest = Math.floor(k / 4096);
      const z = (rest % SPAN) - BIAS;
      const x = Math.floor(rest / SPAN) - BIAS;
      let surface = false;
      for (const [dx, dy, dz] of n6) {
        if (!occ.has(keyOf(x + dx, y + dy, z + dz))) {
          surface = true;
          break;
        }
      }
      if (!surface) continue;
      if (colorIdx.length >= MAX_EXPOSED_VOXELS) {
        throw new PreviewError("The build is too detailed to preview. Pick a smaller area.", "too_large");
      }
      positions.push(x - minX, y - minY, z - minZ);
      colorIdx.push(ci);
    }
    onProgress?.(0.88);

    const header = {
      version: ARTIFACT_VERSION,
      format,
      bounds: { min: [minX, minY, minZ], size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1] },
      voxelCount: colorIdx.length,
      blockCount: occ.size,
      palette,
      ...(clip ? { area: { center: clip.center, radius: clip.radius } } : {}),
    };
    const headerBytes = strToU8(JSON.stringify(header));
    const posArr = Int16Array.from(positions);
    const colArr = Uint8Array.from(colorIdx);
    const out = new Uint8Array(8 + headerBytes.length + posArr.byteLength + colArr.byteLength);
    const dv = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) out[i] = MAGIC.charCodeAt(i);
    dv.setUint32(4, headerBytes.length, true);
    let off = 8;
    out.set(headerBytes, off);
    off += headerBytes.length;
    out.set(new Uint8Array(posArr.buffer, posArr.byteOffset, posArr.byteLength), off);
    off += posArr.byteLength;
    out.set(colArr, off);
    const bytes = gzipSync(out);
    onProgress?.(1);
    return {
      bytes,
      meta: {
        format,
        size: header.bounds.size,
        voxels: header.voxelCount,
        blocks: header.blockCount,
        ...(clip ? { area: header.area } : {}),
      },
    };
  }

  return { visit, finish };
}

// Viewer side: gunzip + parse a BXV1 artifact into
// { bounds, voxelCount, palette, positions: Int16Array, colorIdx: Uint8Array }.
export function decodePreview(gzBytes, gunzip) {
  const raw = gunzip(gzBytes);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const magic = String.fromCharCode(raw[0], raw[1], raw[2], raw[3]);
  if (magic !== MAGIC) throw new Error("Unrecognised preview artifact");
  const headerLen = dv.getUint32(4, true);
  let off = 8;
  const header = JSON.parse(new TextDecoder("utf-8").decode(raw.subarray(off, off + headerLen)));
  off += headerLen;
  const n = header.voxelCount;
  // `off` depends on the JSON length and is usually odd, so an Int16Array view
  // straight onto raw.buffer would throw. Copy the slice into its own buffer
  // first: that one starts at byte 0 and is safe to reinterpret.
  const posU8 = raw.slice(off, off + n * 3 * 2);
  const positions = new Int16Array(posU8.buffer, 0, n * 3);
  off += n * 3 * 2;
  const colorIdx = raw.slice(off, off + n);
  return { bounds: header.bounds, voxelCount: n, palette: header.palette, positions, colorIdx, format: header.format };
}
