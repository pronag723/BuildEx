"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "../../../../../lib/haptics";

// How far the content follows the finger (it slows towards this), and how far
// it has to travel before letting go switches works.
export const PULL_MAX = 150;
export const PULL_GO = 72;
// The outgoing work's exit, before the next one is swapped in.
export const LEAVE_MS = 200;

/**
 * Telegram-style switching on the phone work screen: at the very bottom of a
 * work, keep pulling up and the next work is offered; at the very top, pull
 * down for the previous one. Let go past PULL_GO and it switches, short of it
 * and the content springs back. Ordinary scrolling and the sideways photo
 * carousel are left alone: the gesture only starts at an edge, moving away
 * from it, on a vertical drag.
 *
 * The pull itself never goes through React: every finger move calls
 * `onPull(px, dir)` (signed px, negative = up, towards "next") and the caller
 * writes styles directly, so dragging re-renders nothing. React state changes
 * only when something visible switches:
 *   phase — "idle" | "drag" | "settle" (springing back) | "leave" (the work
 *           exits) | "enter" (the new work arrives; call done() when its
 *           entry animation ends);
 *   dir   — "next" | "prev" for the current gesture;
 *   armed — letting go now would switch.
 *
 * Listeners are attached by hand because React's touch listeners are passive
 * and the pull has to stop the native overscroll with preventDefault.
 */
export function usePullToSwitch(ref, { canPrev, canNext, onSwitch, onPull }) {
  const [state, setState] = useState({ phase: "idle", dir: null, armed: false });
  const live = useRef(state);
  const opts = useRef({ canPrev, canNext, onSwitch, onPull });
  opts.current = { canPrev, canNext, onSwitch, onPull };
  const timer = useRef(null);

  const update = useCallback((next) => {
    const merged = { ...live.current, ...next };
    if (merged.phase === live.current.phase && merged.dir === live.current.dir && merged.armed === live.current.armed) {
      return;
    }
    live.current = merged;
    setState(merged);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let track = null;
    let pull = 0;

    const atTop = () => el.scrollTop <= 0;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    const setPull = (px, dir) => {
      pull = px;
      opts.current.onPull?.(px, dir);
    };

    const onStart = (event) => {
      track = null;
      if (event.touches.length !== 1 || live.current.phase === "leave") return;
      const p = event.touches[0];
      track = { x: p.clientX, y: p.clientY, lastY: p.clientY, axis: null, origin: null, dir: null };
    };

    const onMove = (event) => {
      if (!track) return;
      const p = event.touches[0];
      if (!track.axis) {
        const dx = Math.abs(p.clientX - track.x);
        const dy = Math.abs(p.clientY - track.y);
        if (dx < 6 && dy < 6) return;
        track.axis = dx > dy ? "x" : "y";
      }
      if (track.axis === "x") return;

      const step = p.clientY - track.lastY;
      track.lastY = p.clientY;

      // Not pulling yet: scroll as usual until an edge is reached while still
      // moving away from it, then take over from that point.
      if (track.origin == null) {
        const { canNext, canPrev } = opts.current;
        if (step < 0 && canNext && atBottom()) track.dir = "next";
        else if (step > 0 && canPrev && atTop()) track.dir = "prev";
        else return;
        track.origin = p.clientY;
      }

      const raw = p.clientY - track.origin;
      const signed = track.dir === "next" ? Math.min(0, raw) : Math.max(0, raw);
      // Back past where the pull began: hand the finger back to scrolling.
      if (signed === 0 && raw !== 0) {
        track.origin = null;
        setPull(0, track.dir);
        update({ phase: "idle", armed: false });
        return;
      }

      event.preventDefault();
      const dist = PULL_MAX * (1 - Math.exp(-Math.abs(signed) / PULL_MAX));
      const armed = dist >= PULL_GO;
      if (armed && !live.current.armed) haptic("tick");
      update({ phase: "drag", dir: track.dir, armed });
      setPull(track.dir === "next" ? -dist : dist, track.dir);
    };

    const onEnd = () => {
      const ended = track;
      track = null;
      if (!ended || ended.origin == null) return;
      if (Math.abs(pull) >= PULL_GO) {
        // touchend counts as a user gesture on iOS, so this one is felt on
        // iPhones too (the threshold tick above is Android-only there).
        haptic("confirm");
        update({ phase: "leave", dir: ended.dir, armed: true });
        timer.current = window.setTimeout(() => {
          opts.current.onSwitch(ended.dir);
          setPull(0, ended.dir);
          update({ phase: "enter", dir: ended.dir, armed: false });
        }, LEAVE_MS);
      } else {
        setPull(0, ended.dir);
        update({ phase: "settle", armed: false });
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      window.clearTimeout(timer.current);
    };
  }, [ref, update]);

  const done = useCallback(() => {
    if (live.current.phase === "enter" || live.current.phase === "settle") update({ phase: "idle" });
  }, [update]);

  return { ...state, done };
}
