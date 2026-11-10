"use client";

// The right column (≥1280px): real data only. The author of an open topic,
// what is pinned in the current channel, the most helpful topics started this
// week, and a short rules block. A block that has nothing to show is not
// rendered.
//
// "Popular this week" is read from the top of list_forum_topics(sort=top) and
// trimmed to the last seven days, which is exact while the forum is small;
// stage 2 replaces it (and adds "Active members") with one RPC.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate } from "../../../lib/i18n/format.mjs";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { publicAsset } from "../../home/utils";
import { fetchTopics } from "../../../lib/community/api";
import { CHANNELS, channelForKind } from "./channels";

const WEEK = 7 * 24 * 60 * 60 * 1000;

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
      <button type="button" onClick={() => onOpen(topic.id, channelForKind(topic.kind))} className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-line/[0.05]">
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{topic.title}</span>
        <span className="mt-0.5 block text-[11px] text-ink-3">{meta}</span>
      </button>
    </li>
  );
}

export default function RightRail({ channel, topic, onOpenTopic }) {
  const t = useT();
  const spec = CHANNELS[channel];
  const forum = spec && spec.kind !== undefined;
  const [pinned, setPinned] = useState([]);
  const [popular, setPopular] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!forum) {
      setPinned([]);
      return undefined;
    }
    fetchTopics({ kind: spec.kind, sort: "active" }).then(({ topics }) => {
      if (!cancelled) setPinned(topics.filter((x) => x.pinned).slice(0, 5));
    });
    return () => {
      cancelled = true;
    };
  }, [forum, spec?.kind]);

  useEffect(() => {
    let cancelled = false;
    fetchTopics({ sort: "top" }).then(({ topics }) => {
      if (cancelled) return;
      const since = Date.now() - WEEK;
      setPopular(topics.filter((x) => x.helpful_count > 0 && new Date(x.created_at).getTime() >= since).slice(0, 5));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const authorName = topic ? topic.author_display_name || topic.author_username || t("common.member") : null;

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
            {t("community.topic.authorTopics", { count: topic.author_topics })}
          </p>
          {topic.author_is_builder && topic.author_username && (
            <Link href={`/builders/profile?u=${encodeURIComponent(topic.author_username)}`} className="btn btn-secondary btn-sm mt-3 w-full">
              {t("chat.profile")}
            </Link>
          )}
        </Block>
      )}

      {pinned.length > 0 && (
        <Block title={t("community.rail.pinned")}>
          <ul className="-mx-2 space-y-0.5">
            {pinned.map((x) => (
              <TopicLink key={x.id} topic={x} onOpen={onOpenTopic} meta={t("community.topic.replies", { count: x.reply_count })} />
            ))}
          </ul>
        </Block>
      )}

      {popular.length > 0 && (
        <Block title={t("community.rail.popular")}>
          <ul className="-mx-2 space-y-0.5">
            {popular.map((x) => (
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
