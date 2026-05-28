"use client";

import { useEffect, useRef, useState } from "react";

export function useThemedBackground() {
  const [theme, setTheme] = useState(null);
  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const bg = gradientRef.current;
    const edge = edgeGlowRef.current;
    if (!bg || !edge) return;

    const cfg = {
      edgeOffset: 12,
      smoothing: 0.08,
      idleDrift: 0.00003,
      swayAmp: 0.015,
      swaySpeed: 0.0004
    };

    let cp1 = 0;
    let cp2 = 0.5;
    let tp1 = 0;
    let tp2 = 0.5;
    let lastScroll = window.pageYOffset;
    let raf = 0;

    function periToXY(progress, offset) {
      const p = ((progress % 1) + 1) % 1;
      const seg = p * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0:
          return { x: offset + sp * (100 - offset * 2), y: offset };
        case 1:
          return { x: 100 - offset, y: offset + sp * (100 - offset * 2) };
        case 2:
          return { x: 100 - offset - sp * (100 - offset * 2), y: 100 - offset };
        default:
          return { x: offset, y: 100 - offset - sp * (100 - offset * 2) };
      }
    }

    function tick(ts) {
      const sy = window.pageYOffset;
      const delta = sy - lastScroll;
      if (Math.abs(delta) > 0) {
        tp1 += delta * 0.0008;
        tp2 -= delta * 0.0006;
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

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { theme, setTheme, gradientRef, edgeGlowRef, isLight: theme === "light" };
}
