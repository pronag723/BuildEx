"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";

// Eight particles around the heart: hearts and dots alternating, at uneven
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
 * The "save this builder" button, shared by the feed card and the profile.
 *
 * Saving pops the heart, fills it red and plays a burst (a ring and eight
 * particles); un-saving only shrinks and empties it. The burst belongs to the
 * click, never to the state: a favourite that arrives from the server, or is
 * already set on first render, just shows filled.
 *
 * `onToggle` is FavoritesContext's toggleFavorite (bound to this builder).
 * The heart flips the moment it is clicked; if the toggle resolves with
 * `{ ok: false }` it flips back and the burst is cut short.
 *
 * `stopPropagation` keeps a click inside a link (the feed card) from
 * following it. Everything else (aria-label, className, a visible label as
 * children) goes on the button.
 */
export default function FavoriteHeart({
  favorited,
  onToggle,
  size = 16,
  stopPropagation = false,
  className = "",
  iconClassName = "",
  children,
  ...rest
}) {
  // What the user just asked for, shown until the context catches up.
  const [pending, setPending] = useState(null);
  // The latest click's effect: { id, kind: "like" | "unlike" }. `id` remounts
  // the animated nodes so a second click replays from the start.
  const [fx, setFx] = useState(null);

  const shown = pending ?? favorited;

  useEffect(() => {
    if (pending !== null && pending === favorited) setPending(null);
  }, [pending, favorited]);

  const onClick = async (e) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const next = !shown;
    setPending(next);
    setFx((prev) => ({ id: (prev?.id || 0) + 1, kind: next ? "like" : "unlike" }));

    const result = await onToggle?.();
    if (!result?.ok) {
      setPending(null);
      setFx(null);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={shown}
      className={className}
      {...rest}
    >
      <span className="fav-heart" data-fav={shown ? "on" : "off"}>
        <span key={fx?.id ?? 0} className="fav-heart-icon" data-fx={fx?.kind || undefined}>
          <Icon name="heart" size={size} filled={shown} className={iconClassName} />
        </span>
        {fx?.kind === "like" && (
          <span key={fx.id} className="fav-burst" aria-hidden="true">
            {/* The ring runs longest: when it ends, the burst is over. */}
            <span
              className="fav-burst-ring"
              onAnimationEnd={() => setFx((f) => f && { ...f, kind: null })}
            />
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="fav-burst-particle"
                style={{ "--a": `${p.a}deg`, "--d": `${p.d}px` }}
              >
                {i % 2 === 0 ? (
                  <Icon name="heart" size={7} filled strokeWidth={0} />
                ) : (
                  <span className="fav-burst-dot" />
                )}
              </span>
            ))}
          </span>
        )}
      </span>
      {children}
    </button>
  );
}
