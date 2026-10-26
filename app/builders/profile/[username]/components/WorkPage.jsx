"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "../../../../../lib/ui/Avatar";
import SaveButton from "../../../../../lib/ui/SaveButton";
import { publicAsset } from "../../../../home/utils";
import { useScrollLock } from "../../../../../lib/useScrollLock";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { formatPrice, relativeAgo } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";
import { tierDuration } from "./PriceList";
import { LikeButton, WorkCoauthors, WorkFacts, viewsLabel } from "./workParts";
import { LEAVE_MS, PULL_GO, usePullToSwitch } from "./usePullToSwitch";

const RING = 2 * Math.PI * 17;

// What a pull offers: a ring that fills as the finger travels, turning green
// once letting go will switch, and the work it leads to.
function SwitchHint({ work, dir, progress, armed, leaving }) {
  const t = useT();
  const label = armed
    ? t("profile.viewer.releaseToOpen")
    : t(dir === "next" ? "profile.viewer.nextWork" : "profile.viewer.prevWork");
  return (
    <div
      className="pointer-events-none flex flex-col items-center gap-2"
      style={{
        opacity: leaving ? 0 : Math.min(1, progress * 1.4),
        transform: `translateY(${(1 - progress) * (dir === "next" ? 14 : -14)}px) scale(${0.9 + 0.1 * progress})`,
        transition: leaving ? "opacity 160ms ease-out" : undefined,
      }}
    >
      <span
        className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-150 ${
          armed ? "bg-accent text-accent-fg" : "bg-raised text-ink"
        }`}
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - progress)}
          />
        </svg>
        <Icon
          name={dir === "next" ? "chevronUp" : "chevronDown"}
          size={20}
          className={`transition-transform duration-200 ${armed ? "scale-110" : ""}`}
        />
      </span>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <span className="flex max-w-[260px] items-center gap-2 rounded-xl border border-line/[0.08] bg-surface/95 p-1.5 pr-3 shadow-pop">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={publicAsset(work.photos[0]?.url)} alt="" className="h-8 w-11 flex-shrink-0 rounded-lg object-cover" />
        <span className="truncate text-[13px] font-semibold text-ink">{work.title || t("profile.works.untitled")}</span>
      </span>
    </div>
  );
}

// Phone: one work as its own screen over the profile (opened by tapping a
// card) — a swipeable photo carousel, the details, more of the builder's
// works, and a fixed bar to save the builder or discuss a similar build.
// Pulling past the bottom moves on to the next work, past the top back to the
// previous one (usePullToSwitch).
export default function WorkPage({
  work,
  builder,
  tier,
  moreWorks,
  worksTotal,
  prevWork,
  nextWork,
  like,
  isOwner,
  onToggleLike,
  saved,
  onToggleSave,
  onBack,
  onOpenWork,
  onDiscuss,
  onShare,
}) {
  const t = useT();
  const [photo, setPhoto] = useState(0);
  const scrollerRef = useRef(null);
  const pageRef = useRef(null);
  const count = work.photos.length;
  const title = work.title || t("profile.works.untitled");

  useScrollLock(true);

  // A different work opened from "More works": start at its first photo, top.
  useEffect(() => {
    setPhoto(0);
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [work.id]);

  const onPhotoScroll = (event) => {
    const el = event.currentTarget;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== photo) setPhoto(next);
  };

  const duration = tier ? tierDuration(tier, t) : null;

  const { pull, phase, dir, done } = usePullToSwitch(pageRef, {
    canPrev: Boolean(prevWork),
    canNext: Boolean(nextWork),
    onSwitch: (to) => onOpenWork(to === "next" ? nextWork : prevWork),
  });
  const progress = Math.min(1, Math.abs(pull) / PULL_GO);
  const hintWork = dir === "next" ? nextWork : prevWork;
  const showHint =
    hintWork && (phase === "leave" || ((phase === "drag" || phase === "settle") && pull !== 0));

  // The content follows the finger, springs back, or leaves towards the pull.
  let bodyStyle;
  if (phase === "drag") bodyStyle = { transform: `translateY(${pull}px)` };
  else if (phase === "settle")
    bodyStyle = { transform: "translateY(0)", transition: "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)" };
  else if (phase === "leave")
    bodyStyle = {
      transform: `translateY(${dir === "next" ? "-30vh" : "30vh"})`,
      opacity: 0,
      transition: `transform ${LEAVE_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${LEAVE_MS}ms ease-in`,
    };
  // Animations inside (a like's burst, a photo dot) bubble up too.
  const ownEvent = (handler) => (event) => {
    if (event.target === event.currentTarget) handler();
  };

  return (
    <div ref={pageRef} className="fixed inset-0 z-[150] overflow-y-auto overscroll-contain bg-canvas pb-24">
      <div className="sticky top-0 z-10 flex h-[52px] items-center justify-between border-b border-line/[0.06] bg-canvas/90 px-1.5 backdrop-blur-md">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center text-ink" aria-label={t("profile.viewer.back")}>
          <Icon name="arrowLeft" size={22} />
        </button>
        <span className="text-base font-semibold text-ink">{t("profile.viewer.title")}</span>
        <button type="button" onClick={onShare} className="flex h-11 w-11 items-center justify-center text-ink" aria-label={t("profile.viewer.share")}>
          <Icon name="send" size={20} />
        </button>
      </div>

      <div
        key={work.id}
        style={bodyStyle}
        className={phase === "enter" ? `work-enter-${dir}` : ""}
        onAnimationEnd={ownEvent(done)}
        onTransitionEnd={ownEvent(done)}
      >
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={onPhotoScroll}
          className="hide-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        >
          {work.photos.map((p, i) => (
            <div key={p.id} className="relative aspect-[4/3] flex-[0_0_100%] snap-start bg-raised">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicAsset(p.url)}
                alt={t("profile.viewer.photoOf", { n: i + 1, total: count })}
                className="absolute inset-0 h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <span className="absolute right-3 top-3 rounded-lg bg-black/55 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
              {photo + 1} / {count}
            </span>
            <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
              {work.photos.map((p, i) => (
                <span
                  key={p.id}
                  className={`h-[5px] rounded-full transition-all ${i === photo ? "w-[18px] bg-white" : "w-[5px] bg-white/50"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onBack} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label={t("profile.viewer.back")}>
            <Avatar src={builder.avatar} name={builder.display_name} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">{builder.display_name}</span>
              <span className="block truncate text-xs text-ink-3">
                {relativeAgo(work.createdAt, t.lang)}
                {builder.online && <span className="text-accent-ink"> · {t("card.online")}</span>}
              </span>
            </span>
          </button>
          <LikeButton
            like={like}
            onToggle={onToggleLike}
            size={17}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-raised px-3 text-[13px] font-semibold text-ink"
          />
        </div>

        <div>
          <h1 className="text-[21px] font-bold tracking-[-0.015em] text-ink">{title}</h1>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Icon name="eye" size={13} /> {viewsLabel(work, t)}
          </p>
          {work.description && (
            <p className="mt-2.5 whitespace-pre-line break-words text-[14.5px] leading-relaxed text-ink-2">{work.description}</p>
          )}
        </div>

        <WorkFacts work={work} tone="card" />
        <WorkCoauthors work={work} />

        {tier && !isOwner && (
          <div className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent/[0.08] p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t("profile.viewer.wantSimilar")}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
                {tier.name}
                {duration ? ` · ${duration}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-ink-3">{t("profile.prices.from")}</p>
              <p className="font-mark text-xl font-bold text-accent-ink">{formatPrice(tier.priceFromCents, t.lang)}</p>
            </div>
          </div>
        )}
      </div>

      {moreWorks.length > 0 && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3 px-4">
            <p className="min-w-0 truncate text-[15px] font-semibold text-ink">
              {t("profile.viewer.moreWorksBy", { name: builder.display_name })}
            </p>
            {worksTotal > 1 && (
              <button type="button" onClick={onBack} className="flex-shrink-0 text-[13px] font-semibold text-accent-ink">
                {t("profile.viewer.allWorks", { count: worksTotal })}
              </button>
            )}
          </div>
          <div className="hide-scrollbar mt-2.5 flex gap-2.5 overflow-x-auto px-4 pb-2">
            {moreWorks.slice(0, 10).map((w) => (
              <button key={w.id} type="button" onClick={() => onOpenWork(w)} className="w-[150px] flex-shrink-0 text-left">
                <span className="block aspect-[4/3] overflow-hidden rounded-xl bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicAsset(w.photos[0]?.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                </span>
                <span className="mt-1.5 block truncate text-[12.5px] font-semibold text-ink">
                  {w.title || t("profile.works.untitled")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {nextWork && (
        <p className="mt-7 flex items-center justify-center gap-1.5 text-xs text-ink-3">
          <Icon name="chevronUp" size={14} />
          {t("profile.viewer.swipeHint")}
        </p>
      )}
      </div>

      {showHint && dir === "prev" && (
        <div className="pointer-events-none fixed inset-x-0 top-[64px] z-10 flex justify-center px-4">
          <SwitchHint work={hintWork} dir="prev" progress={progress} armed={progress >= 1} leaving={phase === "leave"} />
        </div>
      )}

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col items-center ${
          isOwner ? "safe-bottom pb-6" : ""
        }`}
      >
        {showHint && dir === "next" && (
          <div className="mb-3 px-4">
            <SwitchHint work={hintWork} dir="next" progress={progress} armed={progress >= 1} leaving={phase === "leave"} />
          </div>
        )}
        {!isOwner && (
          <div className="safe-bottom pointer-events-auto flex w-full gap-2 border-t border-line/10 bg-canvas/90 px-4 pt-3 backdrop-blur-md">
            <SaveButton
              saved={saved}
              onToggle={onToggleSave}
              size={19}
              aria-label={saved ? t("card.removeFavorite") : t("card.addFavorite")}
              className="flex w-14 flex-shrink-0 items-center justify-center self-stretch rounded-xl bg-raised text-ink"
            />
            <button type="button" onClick={onDiscuss} className="btn btn-primary btn-lg min-w-0 flex-1">
              <Icon name="chat" size={17} />
              {t("profile.viewer.discuss")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
