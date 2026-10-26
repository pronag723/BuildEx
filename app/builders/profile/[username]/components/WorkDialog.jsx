"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "../../../../../lib/ui/Avatar";
import SaveButton from "../../../../../lib/ui/SaveButton";
import { publicAsset } from "../../../../home/utils";
import { useScrollLock } from "../../../../../lib/useScrollLock";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { relativeAgo } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";
import { LikeButton, WorkCoauthors, WorkFacts, discussLabel, viewsLabel } from "./workParts";
import { SwitchHint, applyLeaveStyles, applyPullStyles } from "./switchHint";
import { useWheelToSwitch } from "./useWheelToSwitch";

// Desktop: one work in a dialog over the profile — photos on the left with
// thumbnails of this work only, details and actions on the right. Scrolling
// the details on past their end moves to the next work, past the top to the
// previous one (useWheelToSwitch).
export default function WorkDialog({
  work,
  builder,
  tier,
  moreWorks,
  prevWork,
  nextWork,
  like,
  isOwner,
  onToggleLike,
  saved,
  onToggleSave,
  onClose,
  onOpenWork,
  onDiscuss,
  onShare,
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const closeRef = useRef(null);
  const count = work.photos.length;

  useScrollLock(true);
  useEffect(() => setIndex(0), [work.id]);
  useEffect(() => closeRef.current?.focus(), []);

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

  const detailsRef = useRef(null);
  const bodyRef = useRef(null);
  const nextBoxRef = useRef(null);
  const prevBoxRef = useRef(null);
  const { phase, dir, armed, done } = useWheelToSwitch(detailsRef, {
    canPrev: Boolean(prevWork),
    canNext: Boolean(nextWork),
    onSwitch: (to) => onOpenWork(to === "next" ? nextWork : prevWork),
    // Short details that don't fill the column stay put (moving them would
    // only push the title out of view); the hint opens all the same.
    onPull: (px, to, step) => {
      const details = detailsRef.current;
      const fills = details && details.scrollHeight > details.clientHeight;
      applyPullStyles(fills ? bodyRef.current : null, (to === "next" ? nextBoxRef : prevBoxRef).current, px, step);
    },
  });

  useEffect(() => {
    if (phase === "leave")
      applyLeaveStyles(bodyRef.current, (dir === "next" ? nextBoxRef : prevBoxRef).current, dir, "120px");
  }, [phase, dir]);

  // A switched-to work starts at the top of its details.
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.scrollTop = 0;
  }, [work.id]);

  // Animations inside (a like's burst) bubble up too.
  const ownEvent = (handler) => (event) => {
    if (event.target === event.currentTarget) handler();
  };

  if (typeof document === "undefined") return null;
  const photo = work.photos[index];
  const title = work.title || t("profile.works.untitled");
  const arrow =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="flex h-[min(760px,92vh)] w-[min(1240px,96vw)] overflow-hidden rounded-2xl border border-line/[0.08] bg-surface shadow-pop"
      >
        {/* Photos: the whole photo, with a blurred copy of it filling the
            space around it instead of black bars. */}
        <div className="relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-black">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`bg-${photo.id}`}
              src={publicAsset(photo.url)}
              alt=""
              aria-hidden="true"
              className="work-photo-fade absolute inset-0 -z-10 h-full w-full scale-110 object-cover blur-2xl brightness-[0.55]"
            />
          )}
          <div className="relative min-h-0 flex-1">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={publicAsset(photo.url)}
                alt={title}
                className="work-photo-fade absolute inset-0 h-full w-full object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
              />
            )}
            {count > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} className={`${arrow} left-3.5`} aria-label={t("profile.previousPhoto")}>
                  <Icon name="chevronLeft" size={20} />
                </button>
                <button type="button" onClick={() => go(1)} className={`${arrow} right-3.5`} aria-label={t("profile.nextPhoto")}>
                  <Icon name="chevronRight" size={20} />
                </button>
                <span className="absolute left-4 top-4 rounded-lg bg-black/55 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
                  {index + 1} / {count}
                </span>
              </>
            )}
          </div>
          {count > 1 && (
            <div className="hide-scrollbar flex flex-shrink-0 gap-2.5 overflow-x-auto bg-black/35 px-4 py-3 backdrop-blur-md">
              {work.photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={t("profile.viewer.photoOf", { n: i + 1, total: count })}
                  aria-current={i === index}
                  className={`h-[68px] w-[90px] flex-shrink-0 overflow-hidden rounded-lg border-2 transition-opacity ${
                    i === index ? "border-accent" : "border-transparent opacity-55 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicAsset(p.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex w-[380px] flex-shrink-0 flex-col border-l border-line/[0.08]">
          <div className="flex h-[68px] flex-shrink-0 items-center gap-2.5 border-b border-line/[0.08] pl-5 pr-3">
            <Avatar src={builder.avatar} name={builder.display_name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{builder.display_name}</p>
              <p className="truncate text-xs text-ink-3">
                {relativeAgo(work.createdAt, t.lang)}
                {builder.online && <span className="text-accent-ink"> · {t("card.online")}</span>}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-icon"
              aria-label={t("profile.viewer.close")}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* The details scroll; scrolling on past an end offers the next or
              previous work, its hint opening in the gap the content leaves. */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
          <div ref={detailsRef} className="bx-scroll absolute inset-0 overflow-y-auto overscroll-contain">
          <div
            key={work.id}
            ref={bodyRef}
            className={`space-y-4 px-5 py-4 ${phase === "enter" ? `work-enter-${dir}` : ""}`}
            onAnimationEnd={ownEvent(done)}
            onTransitionEnd={ownEvent(done)}
          >
            <div>
              <h2 className="text-[21px] font-bold tracking-[-0.015em] text-ink">{title}</h2>
              {work.description && (
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink-2">{work.description}</p>
              )}
            </div>
            <WorkFacts work={work} />
            <WorkCoauthors work={work} />
            {moreWorks.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-3">{t("profile.viewer.moreWorks")}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {moreWorks.slice(0, 6).map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onOpenWork(w)}
                      aria-label={w.title || t("profile.works.untitled")}
                      className="aspect-[4/3] overflow-hidden rounded-lg bg-raised"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicAsset(w.photos[0]?.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {nextWork && (
              <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-ink-3">
                <Icon name="chevronDown" size={14} />
                {t("profile.viewer.scrollHint")}
              </p>
            )}
          </div>
          </div>
          {prevWork && (
            <div className="pointer-events-none absolute inset-x-0 top-0">
              <SwitchHint
                boxRef={prevBoxRef}
                work={prevWork}
                dir="prev"
                armed={armed && dir === "prev"}
                armedLabelKey="profile.viewer.opening"
              />
            </div>
          )}
          {nextWork && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0">
              <SwitchHint
                boxRef={nextBoxRef}
                work={nextWork}
                dir="next"
                armed={armed && dir === "next"}
                armedLabelKey="profile.viewer.opening"
              />
            </div>
          )}
          </div>

          <div className="flex-shrink-0 border-t border-line/[0.08] px-5 pb-[18px] pt-3.5">
            <div className="flex items-center gap-4 text-[13px] text-ink-2">
              <LikeButton
                like={like}
                onToggle={onToggleLike}
                className="inline-flex items-center gap-1.5 font-semibold text-ink disabled:opacity-60"
                size={20}
              />
              <span className="inline-flex items-center gap-1.5">
                <Icon name="eye" size={17} /> {viewsLabel(work, t)}
              </span>
              {!isOwner && (
                <SaveButton
                  saved={saved}
                  onToggle={onToggleSave}
                  aria-label={saved ? t("card.removeFavorite") : t("card.addFavorite")}
                  title={saved ? t("card.removeFavorite") : t("card.addFavorite")}
                  className="btn btn-secondary btn-icon ml-auto"
                />
              )}
              <button
                type="button"
                onClick={onShare}
                className={`btn btn-secondary btn-icon ${isOwner ? "ml-auto" : ""}`}
                aria-label={t("profile.viewer.share")}
              >
                <Icon name="share" size={16} />
              </button>
            </div>
            {!isOwner && (
              <button type="button" onClick={onDiscuss} className="btn btn-primary btn-lg mt-3 w-full">
                <Icon name="chat" size={16} />
                {discussLabel(tier, t)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
