"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LEAVE_MS, PULL_GO, PULL_MAX } from "./usePullToSwitch";

// Wheel travel (px) past an end that switches works: about three notches of
// a mouse wheel (~100 px each), or a short swipe on a trackpad.
export const WHEEL_GO = 240;
// Converts wheel travel into how far the content moves: it slows towards
// PULL_MAX and reaches PULL_GO (where the ring is full) exactly at WHEEL_GO.
const K = -Math.log(1 - PULL_GO / PULL_MAX) / WHEEL_GO;
// Wheel events further apart than this start a new gesture.
const GAP_MS = 160;
// Stop scrolling short of WHEEL_GO and the pull springs back after this.
const SETTLE_MS = 240;
// Each wheel step eases into place instead of jumping a notch at a time.
const STEP = "120ms ease-out";

/**
 * The desktop dialog's version of usePullToSwitch: with the details column
 * scrolled to its end, keep scrolling the wheel the same way and the next
 * (or, at the top, the previous) work is offered, the content easing away
 * from the end as the ring fills; reach WHEEL_GO and it switches at once.
 * Stop short and it springs back.
 *
 * Trackpads keep sending wheel events for a while after the fingers lift
 * (momentum), so the pull only starts in a gesture that *began* at the end:
 * scrolling down to the bottom never carries straight on into the next work,
 * and after a switch the rest of that gesture is swallowed.
 *
 * Same contract as usePullToSwitch: `onPull(px, dir, step)` writes styles
 * directly (`step` is the transition for a non-zero step); state is
 * { phase, dir, armed, done }.
 */
export function useWheelToSwitch(ref, { canPrev, canNext, onSwitch, onPull }) {
  const [state, setState] = useState({ phase: "idle", dir: null, armed: false });
  const live = useRef(state);
  const opts = useRef({ canPrev, canNext, onSwitch, onPull });
  opts.current = { canPrev, canNext, onSwitch, onPull };

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
    let gesture = null; // { dir } while this gesture may pull; null when it may not
    let blocked = false; // the rest of a gesture that just switched works
    let travel = 0;
    let lastWheel = 0;
    let settleTimer = null;
    let leaveTimer = null;

    const atTop = () => el.scrollTop <= 0;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 2;

    const settle = (dir) => {
      travel = 0;
      gesture = null;
      opts.current.onPull?.(0, dir, STEP);
      update({ phase: "settle", armed: false });
    };

    const onWheel = (event) => {
      if (event.ctrlKey) return; // pinch zoom
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      const dy = event.deltaY * unit;
      if (Math.abs(event.deltaX * unit) > Math.abs(dy) || dy === 0) return;

      const now = performance.now();
      const fresh = now - lastWheel > GAP_MS;
      lastWheel = now;

      if (live.current.phase === "leave" || (blocked && !fresh)) {
        event.preventDefault();
        return;
      }
      blocked = false;

      if (fresh && travel === 0) {
        const { canNext, canPrev } = opts.current;
        if (dy > 0 && canNext && atBottom()) gesture = { dir: "next" };
        else if (dy < 0 && canPrev && atTop()) gesture = { dir: "prev" };
        else gesture = null;
      }
      if (!gesture) return;

      const { dir } = gesture;
      travel = Math.max(0, travel + (dir === "next" ? dy : -dy));
      window.clearTimeout(settleTimer);
      // Scrolled back the other way past the end: an ordinary scroll again.
      if (travel === 0) {
        settle(dir);
        return;
      }

      event.preventDefault();
      const dist = PULL_MAX * (1 - Math.exp(-travel * K));
      const px = dir === "next" ? -dist : dist;

      if (travel >= WHEEL_GO) {
        travel = 0;
        gesture = null;
        blocked = true;
        opts.current.onPull?.(px, dir, STEP);
        update({ phase: "leave", dir, armed: true });
        leaveTimer = window.setTimeout(() => {
          opts.current.onSwitch(dir);
          opts.current.onPull?.(0, dir, STEP);
          update({ phase: "enter", dir, armed: false });
        }, LEAVE_MS);
        return;
      }

      update({ phase: "drag", dir, armed: false });
      opts.current.onPull?.(px, dir, STEP);
      settleTimer = window.setTimeout(() => settle(dir), SETTLE_MS);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settleTimer);
      window.clearTimeout(leaveTimer);
    };
  }, [ref, update]);

  const done = useCallback(() => {
    if (live.current.phase === "enter" || live.current.phase === "settle") update({ phase: "idle" });
  }, [update]);

  return { ...state, done };
}
