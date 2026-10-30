"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SmartText from "../../../lib/ui/SmartText";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate, formatDateTime } from "../../../lib/i18n/format.mjs";
import { fetchAnnouncements } from "../../../lib/chat/api";
import { UpdatesAvatar } from "./ChatAvatars";

function eventRange(post, lang) {
  if (!post.event_starts_at) return "";
  const opts = { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" };
  const start = formatDateTime(post.event_starts_at, lang, opts);
  if (!post.event_ends_at) return start;
  return `${start} – ${formatDateTime(post.event_ends_at, lang, opts)}`;
}

// One post. Also the live preview in the moderator console, so what a
// moderator sees before sending is exactly what everyone will get.
export function AnnouncementCard({ post }) {
  const t = useT();
  const isEvent = post.kind === "event";
  const link = (post.link_url || "").trim();
  const internal = link.startsWith("/");
  return (
    <article className="card max-w-xl p-4">
      {isEvent && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="tag">{t("chat.updates.event")}</span>
          <span className="text-xs text-ink-2">{eventRange(post, t.lang)}</span>
        </div>
      )}
      <h3 className="text-[15px] font-semibold leading-snug">{post.title || t("chat.updates.untitled")}</h3>
      {post.body && (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">
          <SmartText>{post.body}</SmartText>
        </p>
      )}
      {link && (
        <div className="mt-3">
          {internal ? (
            <Link href={link} className="btn btn-secondary btn-sm">
              {post.link_label || t("chat.updates.open")}
            </Link>
          ) : (
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              {post.link_label || t("chat.updates.open")}
              <Icon name="external" size={13} />
            </a>
          )}
        </div>
      )}
    </article>
  );
}

// The read-only "BuildEx Updates" channel. Posts come from public.announcements
// (0112) — one feed for everyone, not a copy in each inbox.
export default function UpdatesChannel({ muted, onToggleMute, onBack, onRead }) {
  const t = useT();
  const [posts, setPosts] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchAnnouncements().then(({ posts: rows }) => {
      if (cancelled) return;
      setPosts(rows);
      onRead?.();
    });
    return () => {
      cancelled = true;
    };
  }, [onRead]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [posts]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line/[0.08] px-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-ghost btn-icon -ml-1 lg:hidden"
          aria-label={t("chat.backToConversations")}
        >
          <Icon name="arrowLeft" size={19} />
        </button>
        <UpdatesAvatar size={34} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
            <span className="truncate">{t("chat.updates.name")}</span>
            <Icon name="verified" size={14} className="flex-shrink-0 text-ink-2" />
          </p>
          <p className="truncate text-xs text-ink-3">{t("chat.updates.subtitle")}</p>
        </div>
      </div>

      <div ref={scrollRef} className="bx-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-5">
        {posts === null ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <UpdatesAvatar size={56} />
            <p className="mt-3 text-sm font-semibold">{t("chat.updates.emptyTitle")}</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-2">{t("chat.updates.emptyBody")}</p>
          </div>
        ) : (
          posts.map((post, i) => {
            const prev = posts[i - 1];
            const newDay =
              !prev || new Date(prev.created_at).toDateString() !== new Date(post.created_at).toDateString();
            return (
              <div key={post.id}>
                {newDay && (
                  <p className="mb-3 text-center text-[11px] font-medium text-ink-3">
                    {formatDate(post.created_at, t.lang, { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}
                <AnnouncementCard post={post} />
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 border-t border-line/[0.08] px-4 py-3">
        <p className="flex-1 text-xs text-ink-3">{t("chat.updates.readOnly")}</p>
        <label htmlFor="updates-notifications" className="flex-shrink-0 text-xs font-medium text-ink-2">
          {t("chat.updates.notifications")}
        </label>
        <button
          id="updates-notifications"
          type="button"
          role="switch"
          aria-checked={!muted}
          onClick={onToggleMute}
          className="switch flex-shrink-0"
        />
      </div>
    </div>
  );
}
