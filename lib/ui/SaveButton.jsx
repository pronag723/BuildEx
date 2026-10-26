"use client";

import { useEffect, useState } from "react";
import BurstIcon, { useBurst } from "./BurstIcon";

/**
 * The "save this builder" button: a bookmark that turns yellow, shared by the
 * feed card, the profile and the work viewers. (Hearts are for liking works.)
 *
 * `onToggle` is FavoritesContext's toggleFavorite (bound to this builder).
 * The bookmark flips the moment it is clicked; if the toggle resolves with
 * `{ ok: false }` it flips back and the burst is cut short.
 *
 * `stopPropagation` keeps a click inside a link (the feed card) from
 * following it. Everything else (aria-label, className, a visible label as
 * children) goes on the button.
 */
export default function SaveButton({
  saved,
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
  const { fx, play, cancel, end } = useBurst();

  const shown = pending ?? saved;

  useEffect(() => {
    if (pending !== null && pending === saved) setPending(null);
  }, [pending, saved]);

  const onClick = async (e) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const next = !shown;
    setPending(next);
    play(next ? "on" : "off");

    const result = await onToggle?.();
    if (!result?.ok) {
      setPending(null);
      cancel();
    }
  };

  return (
    <button type="button" onClick={onClick} aria-pressed={shown} className={className} {...rest}>
      <BurstIcon name="bookmark" tone="save" on={shown} fx={fx} onBurstEnd={end} size={size} className={iconClassName} />
      {children}
    </button>
  );
}
