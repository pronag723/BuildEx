// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Anvil region (.mca) reader for the world preview (Stage 7)
//
// Reads the block grid out of Minecraft Anvil region files in the browser /
// Web Worker. A region file packs up to 32×32 chunks; each chunk is a separately
// (zlib/gzip) compressed NBT document. We decompress with fflate (no Buffer
// needed) and parse the NBT with our own reader (lib/preview/nbt.js).
//
// We support the modern chunk layout (Minecraft 1.18+: top-level `sections` with
// `block_states` { palette, data }) and the 1.13–1.17 layout (`Level.Sections`
// with `Palette` + `BlockStates`). We assume the 1.16+ packed-long format where
// palette indices do NOT span across longs (each long holds floor(64/bits)
// padded indices) — this covers essentially all worlds a builder ships today.
// Pre-1.16 tightly-packed worlds may render incompletely; that's an accepted v1
// limitation (the preview is best-effort, the real file is always delivered).
//
// Reference: https://minecraft.wiki/w/Region_file_format
//            https://minecraft.wiki/w/Chunk_format
// ─────────────────────────────────────────────────────────────────────────────

import { decompressSync } from "fflate";
import { parseNbt } from "./nbt";
import { isAir } from "./blockColors";

const SECTOR = 4096;

// Extract the chunk NBT roots present in one region file. Returns an array of
// parsed chunk objects (already decompressed + NBT-parsed). Skips empty slots
// and any chunk that fails to decompress/parse (best-effort).
function readRegionChunks(bytes) {
  if (!bytes || bytes.length < SECTOR * 2) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];

  for (let i = 0; i < 1024; i++) {
    const entry = view.getUint32(i * 4, false);
    const offsetSectors = entry >>> 8; // high 3 bytes
    const sectorCount = entry & 0xff; // low byte
    if (offsetSectors === 0 || sectorCount === 0) continue;

    const start = offsetSectors * SECTOR;
    if (start + 5 > bytes.length) continue;

    const length = view.getUint32(start, false); // includes the 1 compression byte
    const compression = view.getUint8(start + 4);
    const dataStart = start + 5;
    const dataEnd = dataStart + (length - 1);
    if (length <= 1 || dataEnd > bytes.length) continue;

    const payload = bytes.subarray(dataStart, dataEnd);
    try {
      // compression: 1=gzip, 2=zlib, 3=uncompressed. decompressSync auto-detects
      // gzip/zlib/raw; only the rare "3" (uncompressed) needs the passthrough.
      const raw = compression === 3 ? payload : decompressSync(payload);
      chunks.push(parseNbt(raw));
    } catch {
      // Corrupt or unsupported chunk — skip it, keep the rest of the region.
    }
  }
  return chunks;
}

// Number of bits used to index a palette of the given length (min 4).
function bitsForPalette(paletteLen) {
  if (paletteLen <= 1) return 0;
  let bits = 0;
  let n = paletteLen - 1;
  while (n > 0) {
    bits++;
    n >>= 1;
  }
  return Math.max(4, bits);
}

// Walk one section's packed block_states, invoking visit() for every non-air
// block with its in-section linear index (0..4095) and resolved block name.
function forEachSectionBlock(palette, data, visit) {
  if (!palette || palette.length === 0) return;

  // Single-entry palette: the whole 16³ section is that block (data omitted).
  if (palette.length === 1) {
    const name = palette[0]?.Name;
    if (isAir(name)) return;
    for (let idx = 0; idx < 4096; idx++) visit(idx, name);
    return;
  }

  if (!data || data.length === 0) return;
  const bits = bitsForPalette(palette.length);
  const valuesPerLong = Math.floor(64 / bits);
  const mask = (1n << BigInt(bits)) - 1n;
  const names = palette.map((p) => p?.Name || "minecraft:air");

  for (let idx = 0; idx < 4096; idx++) {
    const longIndex = Math.floor(idx / valuesPerLong);
    if (longIndex >= data.length) break;
    const within = idx % valuesPerLong;
    const word = BigInt.asUintN(64, data[longIndex]);
    const pi = Number((word >> BigInt(within * bits)) & mask);
    const name = names[pi];
    if (name && !isAir(name)) visit(idx, name);
  }
}

// Iterate every non-air block in a region file, calling
// visit(worldX, worldY, worldZ, blockName) for each. The visitor may throw to
// abort early (the encoder uses this to enforce the voxel cap).
export function forEachBlockInRegion(regionBytes, visit) {
  const chunks = readRegionChunks(regionBytes);

  for (const chunk of chunks) {
    // Modern (1.18+) keeps everything at the top level; older worlds nest it
    // under `Level`. Normalise both into one shape.
    const root = chunk.Level || chunk;
    const sections = chunk.sections || root.Sections || root.sections;
    if (!sections || sections.length === 0) continue;

    const chunkX = numberOf(chunk.xPos ?? root.xPos);
    const chunkZ = numberOf(chunk.zPos ?? root.zPos);
    if (chunkX === null || chunkZ === null) continue;
    const baseX = chunkX * 16;
    const baseZ = chunkZ * 16;

    for (const section of sections) {
      const sy = numberOf(section.Y);
      if (sy === null) continue;

      // 1.18+: block_states { palette, data }. 1.13–1.17: Palette + BlockStates.
      const bs = section.block_states;
      const palette = bs ? bs.palette : section.Palette;
      const data = bs ? bs.data : section.BlockStates;
      if (!palette) continue;

      const baseY = sy * 16;
      forEachSectionBlock(palette, data, (idx, name) => {
        const lx = idx & 15;
        const lz = (idx >> 4) & 15;
        const ly = (idx >> 8) & 15;
        visit(baseX + lx, baseY + ly, baseZ + lz, name);
      });
    }
  }
}

// NBT numbers come through as Number (byte/short/int) or BigInt (long). Coerce
// to a plain Number; return null for anything missing/unusable.
function numberOf(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return null;
}

// Filter for fflate's unzipSync: only the region/*.mca entries matter.
export function isRegionEntry(path) {
  return /(^|\/)region\/.*\.mca$/i.test(path) || /\.mca$/i.test(path);
}
