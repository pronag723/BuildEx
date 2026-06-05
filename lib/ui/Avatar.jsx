"use client";

import { useState } from "react";

/**
 * Avatar with a graceful fallback. When no image URL is supplied — or the
 * image fails to load — it renders the same green "initial badge" used on the
 * profile page, so a missing avatar never shows up as a blank square.
 *
 * `className` controls the geometry of the badge (size, rounding, ring, and the
 * font-size of the fallback initial). The wrapper clips the image so any
 * rounding applies to the picture too.
 */
export default function Avatar({ src, name, alt, className = "" }) {
  const [broken, setBroken] = useState(false);
  const initial = ((name || "?").trim().charAt(0) || "?").toUpperCase();
  const showImg = Boolean(src) && !broken;

  return (
    <div
      className={`overflow-hidden flex items-center justify-center ${
        showImg
          ? ""
          : "bg-[#4ade80]/15 border border-[#4ade80]/40 text-[#4ade80] font-bold"
      } ${className}`}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? name ?? ""}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
