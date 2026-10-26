"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/LanguageProvider";
import { hexToHsv, hsvToHex, normalizeHex } from "./color.mjs";
import Slider from "./Slider";

const HUE_TRACK =
  "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)";

// A full colour picker: a saturation/brightness square with a draggable
// handle, a hue slider and the hex value (editable). It keeps its own HSV so
// the hue doesn't jump when the colour passes through grey or black, where a
// hex has no hue to give back.
export default function ColorPicker({ value, onChange, className = "" }) {
  const t = useT();
  const [hsv, setHsv] = useState(() => hexToHsv(value || "#000000"));
  const [hexDraft, setHexDraft] = useState(value || "");
  const squareRef = useRef(null);
  const dragging = useRef(null);
  const current = hsvToHex(hsv.h, hsv.s, hsv.v);

  // A value set from outside (a preset swatch) moves the handles.
  useEffect(() => {
    const next = normalizeHex(value);
    if (next && next !== current) setHsv(hexToHsv(next));
    if (next) setHexDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const apply = (next) => {
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    setHexDraft(hex);
    onChange(hex);
  };

  const fromPointer = (event) => {
    const box = squareRef.current.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    const v = Math.max(0, Math.min(1, 1 - (event.clientY - box.top) / box.height));
    apply({ ...hsv, s, v });
  };

  const onKeyDown = (event) => {
    const d = event.shiftKey ? 0.1 : 0.01;
    const moves = {
      ArrowRight: { s: hsv.s + d },
      ArrowLeft: { s: hsv.s - d },
      ArrowUp: { v: hsv.v + d },
      ArrowDown: { v: hsv.v - d },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const clamp = (x) => Math.max(0, Math.min(1, x));
    apply({ ...hsv, s: clamp(move.s ?? hsv.s), v: clamp(move.v ?? hsv.v) });
  };

  const hueColor = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;

  return (
    <div className={className}>
      <div
        ref={squareRef}
        role="slider"
        tabIndex={0}
        aria-label={t("account.editor.bg.sv")}
        aria-valuetext={current}
        aria-valuenow={Math.round(hsv.v * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={(event) => {
          event.preventDefault();
          squareRef.current.focus();
          try {
            squareRef.current.setPointerCapture(event.pointerId);
          } catch {
            /* still sets the colour */
          }
          dragging.current = event.pointerId;
          fromPointer(event);
        }}
        onPointerMove={(event) => dragging.current === event.pointerId && fromPointer(event)}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
        onKeyDown={onKeyDown}
        className="ui-slider relative h-[132px] cursor-crosshair touch-none select-none rounded-xl outline-none lg:h-[140px]"
        style={{ background: `linear-gradient(to top, #000, rgb(0 0 0 / 0)), linear-gradient(to right, #fff, ${hueColor})` }}
      >
        <span
          className="pointer-events-none absolute -ml-2.5 -mt-2.5 h-5 w-5 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.5)]"
          style={{ left: `${(hsv.s * 100).toFixed(1)}%`, top: `${((1 - hsv.v) * 100).toFixed(1)}%`, background: current }}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <span className="h-[30px] w-[30px] flex-shrink-0 rounded-lg shadow-[inset_0_0_0_1px_rgb(var(--line)/0.15)]" style={{ background: current }} />
        <Slider
          className="min-w-0 flex-1"
          value={Math.round(hsv.h)}
          min={0}
          max={360}
          onChange={(h) => apply({ ...hsv, h })}
          label={t("account.editor.bg.hue")}
          thumbColor={hueColor}
          track={
            <span
              className="pointer-events-none absolute inset-x-0 top-3 h-3 rounded-full"
              style={{ background: HUE_TRACK }}
            />
          }
        />
        <input
          type="text"
          value={hexDraft}
          onChange={(event) => {
            setHexDraft(event.target.value);
            const hex = normalizeHex(event.target.value);
            if (hex) {
              setHsv(hexToHsv(hex));
              onChange(hex);
            }
          }}
          onBlur={() => setHexDraft(current)}
          maxLength={7}
          spellCheck="false"
          aria-label={t("account.editor.bg.hex")}
          className="h-[30px] w-[78px] flex-shrink-0 rounded-lg border border-line/10 bg-raised px-2 font-mono text-[12.5px] font-semibold uppercase text-ink-2 outline-none focus:border-accent/60"
        />
      </div>
    </div>
  );
}
