"use client";

// Shared animated-gradient background used across the catalog/account/orders
// pages. Returns two refs — attach them to a `<div className="gradient-background" />`
// and `<div className="gradient-edge-glow" />` (in that order) inside the page
// root. The hook drives the CSS custom properties (--gradient-x/y) and the
// edge-glow opacity from scroll position + an idle drift.
//
// Kept dependency-free so it can be dropped into any client component without
// changing the surrounding theme management.

import { useEffect, useRef } from "react";

export function useGradientBackground() {
  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);

  useEffect(() => {
    const bg = gradientRef.current;
    const edge = edgeGlowRef.current;
    if (!bg || !edge) return undefined;

    const cfg = {
      edgeOffset: 12,
      speed: 1,
      smoothing: 0.08,
      idleDrift: 0.00003,
      swayAmp: 0.015,
      swaySpeed: 0.0004,
    };
    let cp1 = 0;
    let cp2 = 0.5;
    let tp1 = 0;
    let tp2 = 0.5;
    let lastScroll = window.pageYOffset;
    let raf = 0;

    // Respect users who ask for reduced motion: paint a single static frame and
    // skip the perpetual rAF loop entirely.
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function periToXY(p, off) {
      const pp = ((p % 1) + 1) % 1;
      const seg = pp * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0:
          return { x: off + sp * (100 - off * 2), y: off };
        case 1:
          return { x: 100 - off, y: off + sp * (100 - off * 2) };
        case 2:
          return { x: 100 - off - sp * (100 - off * 2), y: 100 - off };
        default:
          return { x: off, y: 100 - off - sp * (100 - off * 2) };
      }
    }

    function tick(ts) {
      const sy = window.pageYOffset;
      const delta = sy - lastScroll;
      if (Math.abs(delta) > 0) {
        tp1 += delta * 0.0008 * cfg.speed;
        tp2 -= delta * 0.0006 * cfg.speed;
      }
      tp1 += cfg.idleDrift;
      tp2 -= cfg.idleDrift * 0.7;
      lastScroll = sy;
      tp1 = ((tp1 % 1) + 1) % 1;
      tp2 = ((tp2 % 1) + 1) % 1;
      let d1 = tp1 - cp1;
      if (d1 > 0.5) d1 -= 1;
      if (d1 < -0.5) d1 += 1;
      let d2 = tp2 - cp2;
      if (d2 > 0.5) d2 -= 1;
      if (d2 < -0.5) d2 += 1;
      cp1 += d1 * cfg.smoothing;
      cp2 += d2 * cfg.smoothing;
      const sw1 = Math.sin(ts * cfg.swaySpeed) * cfg.swayAmp;
      const sw2 = Math.cos(ts * cfg.swaySpeed * 1.3) * cfg.swayAmp * 0.8;
      const p1 = periToXY(cp1 + sw1, cfg.edgeOffset);
      const p2 = periToXY(cp2 + sw2, cfg.edgeOffset + 3);
      bg.style.setProperty("--gradient-x", `${p1.x}%`);
      bg.style.setProperty("--gradient-y", `${p1.y}%`);
      bg.style.setProperty("--gradient-x2", `${p2.x}%`);
      bg.style.setProperty("--gradient-y2", `${p2.y}%`);
      const breathe = 1 + Math.sin(ts * 0.0003) * 0.12;
      edge.style.opacity = `${0.45 + breathe * 0.2}`;
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (raf) return;
      lastScroll = window.pageYOffset;
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    }

    if (reduceMotion) {
      // Single static frame, no animation loop.
      tick(0);
      stop();
      return undefined;
    }

    // Pause the loop while the tab is backgrounded so it isn't burning CPU/GPU
    // repainting a gradient nobody can see.
    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }
    document.addEventListener("visibilitychange", onVisibility);

    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { gradientRef, edgeGlowRef };
}
