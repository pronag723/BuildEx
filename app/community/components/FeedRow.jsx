"use client";

// One row of a channel feed: avatar, who and when, a title, up to two lines of
// text, tag chips, an optional image on the right and one line of numbers at
// the bottom. The whole row is the button; there are no buttons inside it.
// Rows sit in a `.feed` list divided by hairlines (see FeedList).

import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";

export function FeedList({ children, className = "" }) {
  return <ul className={`card divide-y divide-line/[0.06] overflow-hidden ${className}`}>{children}</ul>;
}

export function FeedSkeleton({ rows = 4 }) {
  return (
    <div className="card divide-y divide-line/[0.06]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-4">
          <div className="skeleton h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="skeleton h-2.5 w-1/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="skeleton h-2.5 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {object} p
 * @param {{ name: string, avatar: string|null }} p.author
 * @param {string} p.time  already formatted ("3 h ago")
 * @param {string} p.title
 * @param {string} [p.text]  excerpt, clamped to two lines
 * @param {import("react").ReactNode} [p.chips]
 * @param {string} [p.image]  preview on the right
 * @param {Array<{ icon: string, value: string|number, label?: string }>} [p.metrics]
 * @param {import("react").ReactNode} [p.status]  a short line before the title (status, "Solved")
 * @param {boolean} [p.pinned]
 * @param {boolean} [p.muted]  closed or hidden items
 */
export default function FeedRow({ author, time, title, text, chips, image, metrics = [], status, pinned, muted, onClick }) {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-line/[0.04] ${muted ? "opacity-70" : ""}`}
      >
        <Avatar src={author.avatar} name={author.name} size={36} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <span className="truncate font-medium text-ink-2">{author.name}</span>
            <span aria-hidden="true">·</span>
            <span className="flex-shrink-0">{time}</span>
            {pinned && (
              <>
                <Icon name="pin" size={12} className="ml-1 flex-shrink-0" />
                <span className="sr-only">{t("community.topic.pinned")}</span>
              </>
            )}
            {status && <span className="ml-auto flex-shrink-0 pl-2">{status}</span>}
          </p>
          <h3 className={`mt-0.5 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere] ${muted ? "text-ink-2" : "text-ink"}`}>{title}</h3>
          {text && <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{text}</p>}
          {chips && <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>}
          {metrics.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              {metrics.map((m) => (
                <span key={m.icon + (m.label || "")} className="inline-flex items-center gap-1 tabular-nums" title={m.label}>
                  <Icon name={m.icon} size={13} />
                  <span aria-hidden={m.label ? "true" : undefined}>{m.value}</span>
                  {m.label && <span className="sr-only">{m.label}</span>}
                </span>
              ))}
            </p>
          )}
        </div>
        {image && (
          <span className="block h-[4.5rem] w-24 flex-shrink-0 overflow-hidden rounded-lg bg-raised">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          </span>
        )}
      </button>
    </li>
  );
}
