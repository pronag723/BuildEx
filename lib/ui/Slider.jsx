"use client";

import { useRef, useState } from "react";

const THUMB = 24; // px; the track is inset by its radius on both ends

// A slider that is easy to grab. The whole 36px row is the hit area; the thumb
// is inset by its radius, so the value maps exactly to the pointer — the thumb
// centre lands under the finger. Pressing anywhere jumps there and keeps
// dragging (pointer capture); the thumb grows a little while held.
//
// Keyboard: role="slider", arrows ±step, Shift+arrows ±10 steps, Home/End.
//
// `track` draws what sits under the thumb (a rainbow for hue); without it the
// slider is a plain bar filled with accent up to the value. `thumbColor` fills
// the thumb (white by default).
export default function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  labelledBy,
  valueText,
  track = null,
  thumbColor = null,
  className = "",
}) {
  const ref = useRef(null);
  const [held, setHeld] = useState(false);
  const pointer = useRef(null);
  const frac = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;

  const clampStep = (v) => {
    const stepped = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
  };

  const valueAt = (clientX) => {
    const box = ref.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - box.left - THUMB / 2) / (box.width - THUMB)));
    return clampStep(min + t * (max - min));
  };

  const set = (next) => {
    if (next !== value) onChange(next);
  };

  const onPointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    ref.current.focus();
    try {
      ref.current.setPointerCapture(event.pointerId);
    } catch {
      /* the jump below still works */
    }
    pointer.current = event.pointerId;
    setHeld(true);
    set(valueAt(event.clientX));
  };

  const onPointerMove = (event) => {
    if (pointer.current !== event.pointerId) return;
    set(valueAt(event.clientX));
  };

  const release = (event) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setHeld(false);
  };

  const onKeyDown = (event) => {
    const big = event.shiftKey ? 10 : 1;
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + step * big;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - step * big;
    else if (event.key === "PageUp") next = value + step * 10;
    else if (event.key === "PageDown") next = value - step * 10;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next == null) return;
    event.preventDefault();
    set(clampStep(next));
  };

  const at = `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${frac.toFixed(4)})`;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={onKeyDown}
      className={`ui-slider relative h-9 cursor-pointer touch-none select-none rounded-[10px] outline-none ${className}`}
    >
      {track || (
        <>
          <span className="pointer-events-none absolute inset-x-0 top-[15px] h-1.5 rounded-full bg-line/20" />
          <span className="pointer-events-none absolute left-0 top-[15px] h-1.5 rounded-full bg-accent" style={{ width: at }} />
        </>
      )}
      <span
        className={`pointer-events-none absolute top-1.5 -ml-3 h-6 w-6 rounded-full shadow-[0_1px_6px_rgb(0_0_0/0.55)] transition-transform duration-150 ${
          thumbColor ? "border-[3px] border-white" : "bg-white"
        } ${held ? "scale-[1.15]" : ""}`}
        style={{ left: at, background: thumbColor || undefined }}
      />
    </div>
  );
}
