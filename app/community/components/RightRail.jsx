"use client";

// The right column (≥1280px): real data only, from one call to
// community_rail (migration 0118). The author of an open topic or post, what
// is pinned in the current channel, the most helpful topics and posts of the
// last seven days, the most active members of the last seven days (by posts
// and replies, no ranks), and a short rules block. A block with nothing to
// show is not rendered.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate } from "../../../lib/i18n/format.mjs";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { publicAsset } from "../../home/utils";
import { fetchCommunityRail } from "../../../lib/community/api";
import { CHANNELS, channelForKind } from "./channels";

const EMPTY = { pinned: [], popular: [], active: [] };

function Block({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

function TopicLink({ topic, onOpen, meta }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(topic.id, channelForKind(topic.kind))} className="flex w-full gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-line/[0.05]">
        <Icon name={CHANNELS[channelForKind(topic.kind)]?.icon || "hash"} size={14} className="mt-0.5 flex-shrink-0 text-ink-3" />
        <span className="min-w-0">
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{topic.title}</span>
          <span className="mt-0.5 block text-[11px] text-ink-3">{meta}</span>
        </span>
      </button>
    </li>
  );
}

export default function RightRail({ channel, topic, onOpenTopic }) {
  const t = useT();
  const spec = CHANNELS[channel];
  const kind = spec && spec.kind !== undefined ? spec.kind : null;
  const [rail, setRail] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCommunityRail(kind).then(({ rail: data }) => {
      if (cancelled) return;
      setRail(data || EMPTY);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const authorName = topic ? topic.author_display_name || topic.author_username || t("common.member") : null;
  const showPinned = spec && spec.kind !== undefined && rail.pinned.length > 0;

  return (
    <aside className="sticky top-[var(--header-h)] hidden h-fit max-h-[calc(100dvh-var(--header-h))] w-72 flex-shrink-0 space-y-6 overflow-y-auto border-l border-line/[0.08] px-5 py-5 xl:block">
      {topic && (
        <Block title={t("community.topic.authorTitle")}>
          <div className="flex items-center gap-2.5">
            <Avatar src={topic.author_avatar_url ? publicAsset(topic.author_avatar_url) : null} name={authorName} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{authorName}</p>
              {topic.author_username && <p className="truncate text-xs text-ink-3">@{topic.author_username}</p>}
            </div>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-ink-3">
            {t("community.topic.authorSince", { date: formatDate(topic.author_joined, t.lang, { month: "long", year: "numeric" }) })}
            {" · "}
            {topic.kind === "showcase"
              ? t("community.topic.authorPosts", { count: topic.author_posts ?? 0 })
              : t("community.topic.authorTopics", { count: topic.author_topics ?? 0 })}
          </p>
          {topic.author_is_builder && topic.author_username && (
            <Link href={`/builders/profile?u=${encodeURIComponent(topic.author_username)}`} className="btn btn-secondary btn-sm mt-3 w-full">
              {t("chat.profile")}
            </Link>
          )}
        </Block>
      )}

      {loading && (
        <div aria-hidden="true" className="space-y-2">
          <div className="skeleton h-2.5 w-24 rounded" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-9 rounded-lg" />
          ))}
        </div>
      )}

      {showPinned && (
        <Block title={t("community.rail.pinned")}>
          <ul className="-mx-2 space-y-0.5">
            {rail.pinned.map((x) => (
              <TopicLink key={x.id} topic={x} onOpen={onOpenTopic} meta={t("community.topic.replies", { count: x.reply_count })} />
            ))}
          </ul>
        </Block>
      )}

      {rail.popular.length > 0 && (
        <Block title={t("community.rail.popular")}>
          <ul className="-mx-2 space-y-0.5">
            {rail.popular.map((x) => (
              <TopicLink
                key={x.id}
                topic={x}
                onOpen={onOpenTopic}
                meta={`${t("community.rail.helpfulCount", { count: x.helpful_count })} · ${relativeAgo(x.created_at, t.lang)}`}
              />
            ))}
          </ul>
        </Block>
      )}

      {rail.active.length > 0 && (
        <Block title={t("community.rail.active")}>
          <ul className="space-y-1.5">
            {rail.active.map((m) => {
              const name = m.display_name || m.username || t("common.member");
              const inner = (
                <>
                  <Avatar src={m.avatar_url ? publicAsset(m.avatar_url) : null} name={name} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{name}</span>
                  <span className="flex-shrink-0 text-[11px] tabular-nums text-ink-3">{t("community.rail.activeCount", { count: m.count })}</span>
                </>
              );
              return (
                <li key={m.username || name}>
                  {m.is_builder && m.username ? (
                    <Link href={`/builders/profile?u=${encodeURIComponent(m.username)}`} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-line/[0.05]">
                      {inner}
                    </Link>
                  ) : (
                    <div className="-mx-2 flex items-center gap-2 px-2 py-1">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      <Block title={t("community.rail.rulesTitle")}>
        <ul className="space-y-1.5 text-[13px] leading-snug text-ink-2">
          {["own", "kind", "spam"].map((k) => (
            <li key={k} className="flex gap-2">
              <Icon name="check" size={14} className="mt-0.5 flex-shrink-0 text-ink-3" />
              <span>{t(`community.rail.rules.${k}`)}</span>
            </li>
          ))}
        </ul>
        <Link href="/legal/community" className="mt-2.5 inline-block text-xs text-ink-3 underline hover:text-ink">
          {t("community.rail.rulesLink")}
        </Link>
      </Block>
    </aside>
  );
}
