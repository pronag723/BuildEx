"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { publicAsset } from "../../../../home/utils";
import { useScrollLock } from "../../../../../lib/useScrollLock";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../../../lib/icons";

// Full-screen photos of one work: arrows, Esc and swipe. Rendered into
// document.body so no ancestor's overflow or stacking context can clip it.
export default function PhotoLightbox({ photos, title, startIndex = 0, onClose }) {
  const t = useT();
  const [index, setIndex] = useState(startIndex);
  const [touchX, setTouchX] = useState(null);
  const count = photos.length;

  useScrollLock(true);

  const go = useCallback((dir) => setIndex((i) => (i + dir + count) % count), [count]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && count > 1) go(-1);
      if (event.key === "ArrowRight" && count > 1) go(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, go, onClose]);

  if (typeof document === "undefined" || count === 0) return null;
  const photo = photos[index];
  const navButton =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20";

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-3 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title || t("profile.fullScreenPhoto")}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
        aria-label={t("profile.closeFullScreen")}
      >
        <Icon name="close" size={20} />
      </button>
      <div
        className="relative flex h-full w-full items-center justify-center"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => setTouchX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          const endX = event.changedTouches[0]?.clientX;
          if (touchX != null && endX != null && Math.abs(endX - touchX) > 36 && count > 1) {
            go(endX < touchX ? 1 : -1);
          }
          setTouchX(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={publicAsset(photo.url)}
          alt={title || t("profile.portfolioImage")}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className={`${navButton} left-1 sm:left-4`} aria-label={t("profile.previousPhoto")}>
              <Icon name="chevronLeft" size={22} />
            </button>
            <button type="button" onClick={() => go(1)} className={`${navButton} right-1 sm:right-4`} aria-label={t("profile.nextPhoto")}>
              <Icon name="chevronRight" size={22} />
            </button>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-2.5 py-1 text-xs tabular-nums text-white/80">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
