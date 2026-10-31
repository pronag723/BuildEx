// Schematic files → preview: Sponge (.schem, versions 1–3, what WorldEdit
// writes) and Litematica (.litematic). Both are gzipped NBT. Coordinates are
// local to the schematic (0 at its corner), and so is the area a builder picks
// when a schematic is too big to show whole.
//
// Reference: https://github.com/SpongePowered/Schematic-Specification
//            https://github.com/maruohon/litematica (LitematicaBitArray)

import { decompressSync } from "fflate";
import { parseNbt } from "./nbt";
import { createCollector, PreviewError } from "./voxels";

// A schematic bigger than this many cells (air included) has to be cut to an
// area before we walk it.
const MAX_CELLS = 24_000_000;

function readNbtFile(bytes) {
  let raw;
  try {
    raw = decompressSync(bytes);
  } catch {
    raw = bytes; // some tools write it uncompressed
  }
  try {
    return parseNbt(raw);
  } catch {
    throw new PreviewError("Could not read the schematic file.", "parse_failed");
  }
}

const num = (v) => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));
const ushort = (v) => num(v) & 0xffff;

function tooBig(cells, clip) {
  if (!clip && cells > MAX_CELLS) {
    throw new PreviewError("The schematic is too big to show whole. Pick the area to preview.", "needs_area");
  }
}

// The cells to walk: everything, or only what an area covers.
function range(size, lo, hi) {
  return [Math.max(0, lo), Math.min(size - 1, hi)];
}

// ─── Sponge .schem ───────────────────────────────────────────────────────────

export function buildSchemPreview(bytes, onProgress, clip = null) {
  onProgress?.(0.05);
  const root = readNbtFile(bytes);
  // v3 nests everything under "Schematic"; v1/v2 put it at the root.
  const s = root.Schematic && typeof root.Schematic === "object" ? root.Schematic : root;
  const width = ushort(s.Width);
  const height = ushort(s.Height);
  const length = ushort(s.Length);
  const palette = s.Blocks?.Palette || s.Palette;
  const data = s.Blocks?.Data || s.BlockData;
  if (!width || !height || !length || !palette || !data) {
    throw new PreviewError(
      "This schematic format is not supported. Save it as .schem with WorldEdit (//schem save).",
      "unsupported"
    );
  }
  tooBig(width * height * length, clip);

  const names = [];
  for (const [name, id] of Object.entries(palette)) names[num(id)] = name;
  onProgress?.(0.15);

  const collector = createCollector({ clip, format: "schem" });
  const [x0, x1] = clip ? range(width, clip.minX, clip.maxX) : [0, width - 1];
  const [z0, z1] = clip ? range(length, clip.minZ, clip.maxZ) : [0, length - 1];
  const [y0, y1] = clip ? range(height, clip.minY, clip.maxY) : [0, height - 1];

  // Block ids are varints, one per cell, in x → z → y order.
  const total = width * height * length;
  let i = 0;
  for (let idx = 0; idx < total && i < data.length; idx++) {
    let value = 0;
    let shift = 0;
    let b;
    do {
      b = data[i++];
      value |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80 && i < data.length);

    const x = idx % width;
    const z = Math.floor(idx / width) % length;
    const y = Math.floor(idx / (width * length));
    if (x < x0 || x > x1 || z < z0 || z > z1 || y < y0 || y > y1) continue;
    const name = names[value];
    if (name) collector.visit(x, y, z, name);
    if ((idx & 0x3ffff) === 0) onProgress?.(0.15 + 0.55 * (idx / total));
  }
  return collector.finish(onProgress);
}

// ─── Litematica .litematic ───────────────────────────────────────────────────

function bitsFor(paletteLen) {
  let bits = 2;
  while (1 << bits < paletteLen) bits++;
  return bits;
}

export function buildLitematicPreview(bytes, onProgress, clip = null) {
  onProgress?.(0.05);
  const root = readNbtFile(bytes);
  const regions = root.Regions;
  if (!regions || typeof regions !== "object" || !Object.keys(regions).length) {
    throw new PreviewError("This .litematic file has no regions to show.", "unsupported");
  }

  // Each region has a position and a size that may be negative on any axis;
  // its real corner is position + size + 1 there. Shift everything so the
  // schematic's own corner is 0.
  const boxes = Object.values(regions).map((r) => {
    const pos = { x: num(r.Position?.x), y: num(r.Position?.y), z: num(r.Position?.z) };
    const size = { x: num(r.Size?.x), y: num(r.Size?.y), z: num(r.Size?.z) };
    const corner = (axis) => (size[axis] < 0 ? pos[axis] + size[axis] + 1 : pos[axis]);
    return {
      region: r,
      ox: corner("x"),
      oy: corner("y"),
      oz: corner("z"),
      sx: Math.abs(size.x),
      sy: Math.abs(size.y),
      sz: Math.abs(size.z),
    };
  });
  const minX = Math.min(...boxes.map((b) => b.ox));
  const minY = Math.min(...boxes.map((b) => b.oy));
  const minZ = Math.min(...boxes.map((b) => b.oz));
  tooBig(boxes.reduce((n, b) => n + b.sx * b.sy * b.sz, 0), clip);
  onProgress?.(0.15);

  const collector = createCollector({ clip, format: "litematic" });
  let done = 0;
  const totalCells = boxes.reduce((n, b) => n + b.sx * b.sy * b.sz, 0) || 1;

  for (const box of boxes) {
    const palette = (box.region.BlockStatePalette || []).map((p) => p?.Name || "minecraft:air");
    const states = box.region.BlockStates;
    const { sx, sy, sz } = box;
    if (!palette.length || !states || !states.length || !sx || !sy || !sz) continue;
    const bits = bitsFor(palette.length);
    const mask = (1n << BigInt(bits)) - 1n;
    const bx = box.ox - minX;
    const by = box.oy - minY;
    const bz = box.oz - minZ;

    const [x0, x1] = clip ? range(sx, clip.minX - bx, clip.maxX - bx) : [0, sx - 1];
    const [z0, z1] = clip ? range(sz, clip.minZ - bz, clip.maxZ - bz) : [0, sz - 1];
    const [y0, y1] = clip ? range(sy, clip.minY - by, clip.maxY - by) : [0, sy - 1];

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          // Indices are packed tightly and may straddle two longs.
          const index = (y * sz + z) * sx + x;
          const startBit = index * bits;
          const li = startBit >> 6;
          const off = startBit & 63;
          if (li >= states.length) continue;
          let v = BigInt.asUintN(64, states[li]) >> BigInt(off);
          if (off + bits > 64 && li + 1 < states.length) {
            v |= BigInt.asUintN(64, states[li + 1]) << BigInt(64 - off);
          }
          const name = palette[Number(v & mask)];
          if (name) collector.visit(bx + x, by + y, bz + z, name);
        }
      }
      done += sx * sz;
      if ((y & 7) === 0) onProgress?.(0.15 + 0.55 * Math.min(1, done / totalCells));
    }
  }
  return collector.finish(onProgress);
}
