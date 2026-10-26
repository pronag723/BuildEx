"use client";

import { useCallback, useState } from "react";
import { Icon } from "../icons";

// Eight particles around the icon: small icons and dots alternating, at uneven
// angles and distances so the burst doesn't read as a stamped ring.
const PARTICLES = [
  { a: 0, d: 19 },
  { a: 47, d: 15 },
  { a: 88, d: 20 },
  { a: 136, d: 16 },
  { a: 180, d: 19 },
  { a: 223, d: 14 },
  { a: 271, d: 20 },
  { a: 314, d: 16 },
];

/**
 * The latest click's effect for a BurstIcon: `fx` is { id, kind: "on" | "off" }
 * or null. `play(kind)` starts one (a new id replays it from the start),
 * `cancel()` drops it (a toggle that failed), `end()` lets the burst go once
 * its ring has finished.
 */
export function useBurst() {
  const [fx, setFx] = useState(null);
  const play = useCallback((kind) => setFx((prev) => ({ id: (prev?.id || 0) + 1, kind })), []);
  const cancel = useCallback(() => setFx(null), []);
  const end = useCallback(() => setFx((f) => f && { ...f, kind: null }), []);
  return { fx, play, cancel, end };
}

/**
 * An icon that pops and bursts (a ring and eight particles) when switched on,
 * and only gives a small squeeze when switched off. Shared by the work like
 * (a red heart) and the save-builder bookmark (yellow). The animation belongs
 * to the click, never to the state: an icon that is already on when it first
 * renders, or turns on from the server, just shows filled.
 *
 * `tone` picks the colour ("heart" | "save"). All of it is transform and
 * opacity, and the burst is skipped under reduced motion (globals.css).
 */
export default function BurstIcon({ name, on, fx, onBurstEnd, size = 18, tone = "heart", className = "" }) {
  return (
    <span className={`burst ${className}`} data-on={on ? "on" : "off"} data-tone={tone}>
      <span key={fx?.id ?? 0} className="burst-icon" data-fx={fx?.kind || undefined}>
        <Icon name={name} size={size} filled={on} />
      </span>
      {fx?.kind === "on" && (
        <span key={fx.id} className="burst-fx" aria-hidden="true">
          {/* The ring runs longest: when it ends, the burst is over. */}
          <span className="burst-ring" onAnimationEnd={onBurstEnd} />
          {PARTICLES.map((p, i) => (
            <span key={i} className="burst-particle" style={{ "--a": `${p.a}deg`, "--d": `${p.d}px` }}>
              {i % 2 === 0 ? <Icon name={name} size={7} filled strokeWidth={0} /> : <span className="burst-dot" />}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
