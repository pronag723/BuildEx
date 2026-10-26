"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Avatar from "../../../../../lib/ui/Avatar";
import { publicAsset } from "../../../../home/utils";
import { useScrollLock } from "../../../../../lib/useScrollLock";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { relativeAgo } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";
import { LikeButton, discussLabel, viewsLabel } from "./workParts";

// A view counts once the slide has been on screen this long.
const VIEW_AFTER_MS = 1000;

const railButton =
  "flex w-[52px] flex-col items-center gap-0.5 text-xs font-semibold text-white drop-shadow";

function Slide({ work, builder, tier, like, isOwner, onToggleLike, onChat, onShare, onDetails, onDiscuss }) {
  const t = useT();
  const cover = work.photos[0];
  const coauthorNames = work.coauthors
    .map((c) => (c.profile ? `@${c.profile.username}` : c.name))
    .join(", ");

  return (
    <article className="relative h-[100dvh] snap-start snap-always overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={publicAsset(cover.url)} alt="" aria-hidden="true" className="absolute -inset-10 h-[calc(100%+5rem)] w-[calc(100%+5rem)] object-cover blur-[28px] brightness-[0.45]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={publicAsset(cover.url)}
        alt={work.title || t("profile.works.untitled")}
        className="absolute left-0 top-1/2 max-h-[70%] w-full -translate-y-[58%] object-contain"
      />
      <span className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/90 to-transparent" />

      <div className="absolute bottom-32 right-2 flex flex-col items-center gap-4">
        <LikeButton like={like} onToggle={onToggleLike} size={30} className={railButton} />
        {!isOwner && (
          <button type="button" onClick={onChat} className={railButton} aria-label={t("profile.viewer.chatAria")}>
            <Icon name="chat" size={28} />
            {t("profile.viewer.chat")}
          </button>
        )}
        <button type="button" onClick={onShare} className={railButton} aria-label={t("profile.viewer.share")}>
          <Icon name="share" size={26} />
          {t("profile.viewer.shareShort")}
        </button>
      </div>

      <div className="absolute bottom-7 left-4 right-[76px] text-white">
        <div className="flex items-center gap-2 text-[13px]">
          <Avatar src={builder.avatar} name={builder.display_name} size={30} />
          <span className="font-semibold">{builder.username}</span>
          {work.createdAt && <span className="text-white/65">· {relativeAgo(work.createdAt, t.lang)}</span>}
        </div>
        <h2 className="mt-2.5 text-lg font-bold tracking-[-0.01em]">{work.title || t("profile.works.untitled")}</h2>
        {work.description && (
          <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-snug text-white/85">{work.description}</p>
        )}
        <button type="button" onClick={onDetails} className="mt-1.5 text-[13px] font-semibold text-white underline underline-offset-[3px]">
          {t("profile.viewer.details")}
        </button>
        {coauthorNames && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent">
            <Icon name="users" size={14} /> {t("profile.viewer.feat", { name: coauthorNames })}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1 text-xs text-white/70">
            <Icon name="eye" size={13} /> {viewsLabel(work, t)}
          </span>
          {!isOwner && (
            <button type="button" onClick={onDiscuss} className="h-[30px] rounded-[9px] bg-accent/20 px-3 text-[12.5px] font-semibold text-accent">
              {discussLabel(tier, t)}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// Phone: the works as a full-screen vertical feed — one work per swipe,
// starting from the card that was tapped. Loads more as it nears the end.
export default function WorkFeed({
  works,
  startId,
  builder,
  tiers,
  hasMore,
  likeOf,
  isOwner,
  onToggleLike,
  onClose,
  onDetails,
  onDiscuss,
  onShare,
  onLoadMore,
  onViewed,
}) {
  const t = useT();
  const scrollerRef = useRef(null);
  const startIndex = Math.max(0, works.findIndex((w) => w.id === startId));
  const [index, setIndex] = useState(startIndex);

  useScrollLock(true);

  // Jump straight to the tapped work before the first paint.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = startIndex * el.clientHeight;
    // Only on open; later index changes come from the user's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = (event) => {
    const el = event.currentTarget;
    const next = Math.round(el.scrollTop / el.clientHeight);
    if (next !== index) setIndex(next);
  };

  // Count a view once a slide has stayed on screen; fetch more near the end.
  const current = works[index];
  useEffect(() => {
    if (!current) return undefined;
    const id = window.setTimeout(() => onViewed(current), VIEW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [current, onViewed]);

  useEffect(() => {
    if (hasMore && index >= works.length - 2) onLoadMore();
  }, [index, works.length, hasMore, onLoadMore]);

  const tierOf = (work) => tiers.find((tier) => tier.id === work.priceTierId) || null;

  return (
    <div className="fixed inset-0 z-[150] bg-black" role="dialog" aria-modal="true" aria-label={t("profile.viewer.feed")}>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="hide-scrollbar absolute inset-0 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {works.map((work) => (
          <Slide
            key={work.id}
            work={work}
            builder={builder}
            tier={tierOf(work)}
            like={likeOf(work)}
            isOwner={isOwner}
            onToggleLike={() => onToggleLike(work)}
            onChat={() => onDiscuss(work)}
            onShare={() => onShare(work)}
            onDetails={() => onDetails(work)}
            onDiscuss={() => onDiscuss(work)}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-1.5 text-white">
        <button type="button" onClick={onClose} className="pointer-events-auto flex h-11 w-11 items-center justify-center" aria-label={t("profile.viewer.close")}>
          <Icon name="arrowLeft" size={22} />
        </button>
        <span className="text-[15px] font-semibold">{t("profile.viewer.feed")}</span>
        <span className="w-11 text-center text-[12.5px] tabular-nums text-white/75">
          {index + 1}/{works.length}
        </span>
      </div>
    </div>
  );
}
