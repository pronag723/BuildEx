"use client";

import { useEffect, useRef } from "react";

// ─── Voxel cube ───────────────────────────────────────────────────────────────
//
// An isometric block drawn from scratch: three faces, each a 4×4 grid of
// "pixels" laid onto the face with an affine matrix. Pixel letters pick a
// shade (a–f), and each variant's shades are CSS variables (.vx-<variant> in
// globals.css), so the palette follows the theme. The left and right faces are
// darkened by an overlay rather than by a second palette.
//
// viewBox 0 0 28 32: top vertex (14,0), left (0,8), centre (14,16), right
// (28,8), and the faces hang 16 units down from those.

const FACES = {
  top: "matrix(14 -8 14 8 0 8)",
  left: "matrix(14 8 0 16 0 8)",
  right: "matrix(14 -8 0 16 14 16)",
};

const SHADE = {
  left: "0,8 14,16 14,32 0,24",
  right: "14,16 28,8 28,24 14,32",
};

// Row-major 4×4 textures, one letter per pixel. `right` falls back to `left`.
const VARIANTS = {
  grass: { top: "abacbcababcabacb", left: "abbadfdeedfddedf", right: "babadedffdeddfde" },
  dirt: { top: "dedffdededfddfde", left: "edfddedffdedeefd" },
  stone: { top: "dedeefdddfededde", left: "eddeddfefeddeded" },
  planks: { top: "ddedffffeddeffff", left: "dddeffffeddfffff" },
  gold: { top: "abbabcababcbbbab", left: "bacbcbabbabccbab" },
  glow: { top: "dedeeddfdfedeedd", left: "edfddeedfdedeedf", right: "abcabacbcbababca" },
};

function Face({ face, texture }) {
  return (
    <g transform={FACES[face]}>
      {texture.split("").map((ch, i) => (
        <rect
          key={i}
          className={`vp-${ch}`}
          x={(i % 4) / 4}
          y={Math.floor(i / 4) / 4}
          // A hair over a quarter so neighbouring pixels overlap and no
          // anti-aliased seam shows between them.
          width={0.26}
          height={0.26}
        />
      ))}
    </g>
  );
}

export function VoxelCube({ variant = "grass", className = "" }) {
  const v = VARIANTS[variant] || VARIANTS.grass;
  return (
    <svg viewBox="0 0 28 32" className={`vx vx-${variant} ${className}`} aria-hidden="true" focusable="false">
      <Face face="top" texture={v.top} />
      <Face face="left" texture={v.left} />
      <Face face="right" texture={v.right || v.left} />
      <polygon points={SHADE.left} className="vx-shade-l" />
      <polygon points={SHADE.right} className="vx-shade-r" />
    </svg>
  );
}

// ─── The feed's side blocks ───────────────────────────────────────────────────
//
// Each block sits in a gutter beside the max-w-7xl column:
//   y      where it starts, in vh
//   gx     how far across its gutter (0 = outer edge, 1 = against the column)
//   size   px, at full width
//   speed  how much of the scroll it follows (lower = deeper and slower)
//   spin   degrees it turns per px scrolled
//   lg     one of the two kept (shrunk) between `lg` and 1440px, where the
//          gutter is only the column's 2rem padding
// The idle bob/drift/rock clocks come from the hero's blocks.
const BLOCKS = [
  { side: "left", variant: "grass", y: 18, gx: 0.55, size: 56, speed: 0.42, spin: 0.012, o: 0.9, bob: "3.6s", drift: "5.7s", rock: "7.3s", sway: 1, delay: "-2.1s", lg: true },
  { side: "left", variant: "stone", y: 52, gx: 0.2, size: 32, speed: 0.22, spin: -0.018, o: 0.6, bob: "4.3s", drift: "6.9s", rock: "8.1s", sway: -1, delay: "-5.4s" },
  { side: "left", variant: "gold", y: 78, gx: 0.7, size: 26, speed: 0.15, spin: 0.02, o: 0.5, bob: "3.9s", drift: "6.2s", rock: "7.7s", sway: -0.8, delay: "-3.3s" },
  { side: "left", variant: "planks", y: 104, gx: 0.35, size: 44, speed: 0.34, spin: -0.01, o: 0.75, bob: "4.1s", drift: "6.5s", rock: "7.9s", sway: 0.9, delay: "-1.2s" },
  { side: "right", variant: "glow", y: 30, gx: 0.5, size: 64, speed: 0.5, spin: -0.01, o: 0.95, bob: "4.4s", drift: "6.1s", rock: "8.4s", sway: -1, delay: "-4.6s", lg: true },
  { side: "right", variant: "dirt", y: 64, gx: 0.25, size: 28, speed: 0.18, spin: 0.016, o: 0.55, bob: "3.7s", drift: "5.9s", rock: "7.1s", sway: 0.8, delay: "-0.7s" },
  { side: "right", variant: "grass", y: 90, gx: 0.6, size: 40, speed: 0.3, spin: -0.014, o: 0.7, bob: "4.0s", drift: "6.6s", rock: "7.5s", sway: 1, delay: "-2.8s" },
  { side: "right", variant: "stone", y: 6, gx: 0.15, size: 24, speed: 0.12, spin: 0.022, o: 0.45, bob: "4.6s", drift: "7.1s", rock: "8.8s", sway: -0.9, delay: "-6.2s" },
];

// Decorative Minecraft blocks floating in the feed's side gutters. They live
// in a fixed layer behind the content (no layout, no pointer events) and
// drift with the scroll at their own depth: one passive, rAF-throttled scroll
// listener writes `--scroll` on the layer and CSS works out every block's
// transform from it (see .feed-blocks in globals.css).
export default function FeedFloatingBlocks() {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let frame = 0;
    const write = () => {
      frame = 0;
      layer.style.setProperty("--scroll", String(Math.round(window.scrollY)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };

    write();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={layerRef} className="feed-blocks" aria-hidden="true">
      {BLOCKS.map((b, i) => (
        <div
          key={i}
          className={`feed-block feed-block-${b.side}${b.lg ? " feed-block-lg" : ""}`}
          style={{
            "--y": b.y,
            // Raw values: the stylesheet derives --gx/--size from them, so
            // the narrow-gutter media query can still override both.
            "--x": b.gx,
            "--s": `${b.size}px`,
            "--speed": b.speed,
            "--spin": b.spin,
            "--o": b.o,
            "--bob": b.bob,
            "--drift": b.drift,
            "--rock": b.rock,
            "--sway": b.sway,
            "--delay": b.delay,
          }}
        >
          <VoxelCube variant={b.variant} />
        </div>
      ))}
    </div>
  );
}
