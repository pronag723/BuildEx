"use client";

import { useState } from "react";

/**
 * A person's avatar: a rounded square — the shape of a Minecraft player head —
 * everywhere on the site. Falls back to their initial on a neutral tile when
 * there is no image or it fails to load, so a missing avatar never shows up as
 * a blank or broken box.
 *
 * Give it either `size` (px; the corner radius and the initial scale with it)
 * or size it yourself through `className`. Callers resolve `src` (publicAsset
 * etc.) before passing it in.
 */
export default function Avatar({ src, name, alt, size, className = "" }) {
  const [broken, setBroken] = useState(false);
  const initial = ((name || "?").trim().charAt(0) || "?").toUpperCase();
  const showImg = Boolean(src) && !broken;

  const style = size
    ? {
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        borderRadius: Math.max(6, Math.round(size * 0.22)),
      }
    : undefined;

  return (
    <div
      style={style}
      className={`flex-shrink-0 overflow-hidden flex items-center justify-center select-none ${
        size ? "" : "rounded-lg"
      } ${showImg ? "bg-raised" : "bg-line/10 text-ink-2 font-semibold"} ${className}`}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? ""}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}
