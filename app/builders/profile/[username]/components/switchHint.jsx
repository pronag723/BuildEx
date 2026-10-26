"use client";

// The "switch to the next / previous work" hint shared by the phone work
// screen (pulled with a finger, usePullToSwitch) and the desktop dialog
// (scrolled past an end with the wheel, useWheelToSwitch), plus the style
// writes both use while the gesture runs — outside React, so a pull
// re-renders nothing.

import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../../../lib/icons";
import { LEAVE_MS, PULL_GO } from "./usePullToSwitch";

const RING = 2 * Math.PI * 12;
const SPRING = "320ms cubic-bezier(0.2, 0.8, 0.2, 1)";

// What a pull offers, as one compact pill: a ring that fills as the gesture
// goes on (green once it will switch), an arrow towards where that work lies
// — below for the next, above for the previous — and its title. It sits in a
// box exactly as tall as the gap the pull has opened, so it never covers the
// content; `armedLabelKey` is what the pill says once it will switch.
export function SwitchHint({ boxRef, work, dir, armed, armedLabelKey = "profile.viewer.releaseToOpen", className = "" }) {
  const t = useT();
  const label = armed
    ? t(armedLabelKey)
    : t(dir === "next" ? "profile.viewer.nextWork" : "profile.viewer.prevWork");
  return (
    <div
      ref={boxRef}
      className={`pointer-events-none flex h-0 w-full items-center justify-center overflow-hidden px-4 ${className}`}
    >
      <div className="flex min-w-0 max-w-full items-center gap-2.5 rounded-full border border-line/[0.08] bg-surface py-1 pl-1 pr-4 opacity-0 shadow-pop">
        <span
          className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${
            armed ? "bg-accent text-accent-fg" : "bg-raised text-ink"
          }`}
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING}
            />
          </svg>
          <Icon name={dir === "next" ? "chevronDown" : "chevronUp"} size={18} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[11px] text-ink-3">{label}</span>
          <span className="block truncate text-[13px] font-semibold text-ink">
            {work.title || t("profile.works.untitled")}
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * One step of a pull: the content moves by `px` (signed, negative = up) and
 * the hint's box opens to match. 0 springs both back. `move` is the
 * transition for a non-zero step: none under a finger, a short ease for the
 * wheel's coarser steps.
 */
export function applyPullStyles(body, box, px, move = "none") {
  const spring = px === 0;
  if (body) {
    body.style.transition = spring ? `transform ${SPRING}` : move === "none" ? "none" : `transform ${move}`;
    body.style.transform = `translate3d(0, ${px}px, 0)`;
  }
  if (!box) return;
  const d = Math.abs(px);
  const progress = Math.min(1, d / PULL_GO);
  box.style.transition = spring ? `height ${SPRING}` : move === "none" ? "none" : `height ${move}`;
  box.style.height = `${d}px`;
  if (!spring) box.style.opacity = "1";
  const pill = box.firstElementChild;
  if (pill) {
    pill.style.transition = spring
      ? `opacity ${SPRING}, transform ${SPRING}`
      : move === "none"
        ? "none"
        : `opacity ${move}, transform ${move}`;
    pill.style.opacity = String(Math.min(1, Math.max(0, (d - 20) / 36)));
    pill.style.transform = `scale(${0.88 + 0.12 * progress})`;
  }
  const ring = box.querySelector("circle");
  if (ring) ring.style.strokeDashoffset = String(RING * (1 - progress));
}

/** The switch itself: the content leaves towards the pull, the hint fades. */
export function applyLeaveStyles(body, box, dir, distance = "30vh") {
  if (body) {
    body.style.transition = `transform ${LEAVE_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${LEAVE_MS}ms ease-in`;
    body.style.transform = `translate3d(0, ${dir === "next" ? "-" : ""}${distance}, 0)`;
    body.style.opacity = "0";
  }
  if (box) {
    box.style.transition = "opacity 150ms ease-out";
    box.style.opacity = "0";
  }
}
