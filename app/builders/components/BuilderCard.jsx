"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { publicAsset } from "../../home/utils";
import { useFavorites } from "../../../lib/favorites/FavoritesContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { styleChipLabel } from "../../../lib/i18n/labels.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";

// One builder in the feed. The whole card is the link to their profile, so it
// carries no separate "View profile" button: what it spends its space on is
// the work (a swipeable strip of their portfolio) and the few facts a client
// scans for — who they are, how much they have shown, what they build.
export default function BuilderCard({ builder }) {
  const t = useT();
  const previews = builder.portfolio.slice(0, 6);
  const count = previews.length;
  const buildCount = builder.portfolio.length;

  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);

  const { canFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(builder.id, "builder");

  // Three tags fit from `sm` up; the rest collapse into a "+N".
  const wideOverflow = Math.max(0, builder.specialties.length - 3);

  // Everything inside the card that is interactive must not follow its link.
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const go = (e, dir) => {
    stop(e);
    setIndex((i) => (i + dir + count) % count);
  };

  const selectSlide = (e, nextIndex) => {
    stop(e);
    setIndex(nextIndex);
  };

  const onToggleFavorite = (e) => {
    stop(e);
    toggleFavorite(builder.id, "builder");
  };

  const onTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event) => {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX == null || endX == null || Math.abs(endX - startX) < 36 || count < 2) return;
    setIndex((current) => (endX < startX ? (current + 1) % count : (current - 1 + count) % count));
  };

  const overlayButton =
    "flex items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/70";

  return (
    <Link
      href={`/builders/profile?u=${encodeURIComponent(builder.username)}`}
      className="builder-card card group flex flex-col overflow-hidden"
    >
      {/* ── Portfolio strip ─────────────────────────────────────────────── */}
      <div
        className="group/media card-carousel relative aspect-[4/3] flex-shrink-0 overflow-hidden bg-raised"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {count === 0 ? (
          <div className="block-grid flex h-full w-full items-center justify-center px-2 text-center text-xs text-ink-3">
            {t("card.portfolioSoon")}
          </div>
        ) : (
          <div
            className="card-carousel-track flex h-full w-full"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {previews.map((p, i) => (
              <div key={p.id} className="relative h-full w-full flex-shrink-0 overflow-hidden">
                <img
                  src={publicAsset(p.thumbnail)}
                  alt={i === index ? p.title : ""}
                  className="builder-card-img h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label={t("card.previousBuild")}
              onClick={(e) => go(e, -1)}
              className={`carousel-arrow absolute left-2 top-1/2 z-10 h-8 w-8 -translate-y-1/2 ${overlayButton}`}
            >
              <Icon name="chevronLeft" size={18} />
            </button>
            <button
              type="button"
              aria-label={t("card.nextBuild")}
              onClick={(e) => go(e, 1)}
              className={`carousel-arrow absolute right-2 top-1/2 z-10 h-8 w-8 -translate-y-1/2 ${overlayButton}`}
            >
              <Icon name="chevronRight" size={18} />
            </button>

            {/* Slide position */}
            <div
              className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1"
              role="tablist"
              aria-label={t("card.portfolioImages")}
            >
              {previews.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={(event) => selectSlide(event, i)}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={t("card.showImage", { n: i + 1 })}
                  className={`carousel-progress-indicator h-1.5 rounded-full shadow-[0_0_2px_rgba(0,0,0,0.4)] ${
                    i === index ? "w-4 bg-white" : "w-1.5 bg-white/55"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Presence — only when the builder is actually online (a real
            heartbeat on profiles.last_seen_at, see lib/presence). */}
        {builder.online && (
          <div
            className="absolute left-2 top-2 z-10 flex h-6 items-center gap-1.5 rounded-md bg-black/55 px-1.5 text-[11px] font-medium text-white backdrop-blur-sm xs:px-2"
            title={t("card.onlineNow")}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            <span className="hidden xs:inline">{t("card.online")}</span>
            <span className="sr-only xs:hidden">{t("card.onlineNow")}</span>
          </div>
        )}

        {canFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorited}
            aria-label={favorited ? t("card.removeFavorite") : t("card.addFavorite")}
            title={favorited ? t("card.removeFavorite") : t("card.addFavorite")}
            className={`absolute right-2 top-2 z-20 h-8 w-8 ${overlayButton}`}
          >
            <Icon name="heart" size={16} filled={favorited} className={favorited ? "text-accent" : ""} />
          </button>
        )}
      </div>

      {/* ── Builder ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2.5 p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <Avatar
            src={builder.avatar}
            name={builder.display_name}
            className="h-8 w-8 text-sm sm:h-9 sm:w-9"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="min-w-0 truncate text-sm font-semibold leading-tight sm:text-[15px]">
                {builder.display_name}
              </p>
              <Icon
                name="arrowRight"
                size={14}
                className="hidden flex-shrink-0 -translate-x-1 text-ink-3 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 sm:block"
              />
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-3">
              @{builder.username}
              {buildCount > 0 && (
                <span className="hidden xs:inline">
                  {" · "}
                  {t("card.builds", { count: buildCount })}
                </span>
              )}
            </p>
          </div>
        </div>

        {builder.specialties.length > 0 && (
          <>
            {/* Phones: one muted line, so two-up cards keep an even height
                however many styles a builder picked. */}
            <p className="truncate text-xs text-ink-3 sm:hidden">
              {builder.specialties.map((s) => styleChipLabel(s, t.lang)).join(" · ")}
            </p>
            <div className="hidden flex-wrap gap-1 sm:flex">
              {builder.specialties.slice(0, 3).map((s) => (
                <span key={s} className="tag">
                  {styleChipLabel(s, t.lang)}
                </span>
              ))}
              {wideOverflow > 0 && <span className="tag">+{wideOverflow}</span>}
            </div>
          </>
        )}

        {/* The wrapper carries the "not on the narrowest cards" rule. Putting
            `hidden xs:block` on the paragraph itself would beat the
            `display: -webkit-box` that line-clamp needs. */}
        {builder.bio && (
          <div className="hidden xs:block">
            <p className="line-clamp-2 text-[13px] leading-relaxed text-ink-2">{builder.bio}</p>
          </div>
        )}
      </div>
    </Link>
  );
}
