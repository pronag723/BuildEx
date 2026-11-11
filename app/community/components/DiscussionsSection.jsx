"use client";

// A discussions channel: # questions, # guides, # suggestions, # team-search,
// # contests, # all-discussions and # my-topics are all this component with a
// different `kind` / `scope`. Contests get their own composer, a cover photo
// and their state (running / ended / official) on the row. Rows
// in one list divided by hairlines; a topic opens in place (?t=), see
// TopicView.jsx. The channel search filters the rows already loaded (the RPC
// has no text search), which is exact while a channel fits in a few pages.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { useScrollLock } from "../../../lib/useScrollLock";
import { Icon } from "../../../lib/icons";
import { publicAsset } from "../../home/utils";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { communityImageUrl, createTopic, fetchTopics, TOPIC_KINDS, TOPICS_PAGE } from "../../../lib/community/api";
import Toast from "../../components/Toast";
import ChannelHeader from "./ChannelHeader";
import EmptyState from "./EmptyState";
import FeedRow, { FeedList, FeedSkeleton } from "./FeedRow";
import { CHANNELS, channelForKind, channelHref } from "./channels";
import ContestComposer from "./ContestComposer";
import { ContestBadges } from "./ContestBits";

const TITLE_MAX = 120;
const BODY_MAX = 10000;
const SORTS = ["active", "new", "top"];

// Labels: `community.discussions.kinds.<kind>`.
export function KindTag({ kind }) {
  const t = useT();
  return <span className="tag">{t(`community.discussions.kinds.${kind}`)}</span>;
}

function NewTopicDialog({ open, initialKind, onClose, onCreated }) {
  const t = useT();
  const [kind, setKind] = useState(initialKind || "question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useScrollLock(open);
  useEffect(() => {
    if (open) {
      setKind(initialKind || "question");
      setTitle("");
      setBody("");
      setError(null);
    }
  }, [open, initialKind]);
  if (!open || typeof document === "undefined") return null;
  const ok = title.trim().length >= 3 && body.trim().length >= 1;

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const { topicId, error: e } = await createTopic(kind, title.trim(), body.trim());
    setBusy(false);
    if (e) {
      setError(serverMessage(e, "community.errors.failed"));
      return;
    }
    onCreated(topicId, kind);
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("community.discussions.newTitle")}>
      <div className="absolute inset-0 hidden bg-black/60 sm:block" onClick={() => !busy && onClose()} />
      <div className="relative flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-line/10 sm:shadow-pop">
        <header className="flex flex-shrink-0 items-center gap-2 border-b border-line/[0.08] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost btn-icon -ml-2" aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
          <h2 className="flex-1 text-base font-semibold">{t("community.discussions.newTitle")}</h2>
        </header>
        <div className="bx-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("community.discussions.kindLabel")}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("community.discussions.kindLabel")}>
              {TOPIC_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)} className="filter-chip">
                  <Icon name={CHANNELS[channelForKind(k)].icon} size={14} />
                  {t(`community.discussions.kinds.${k}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 flex text-sm font-medium">
              {t("community.discussions.titleLabel")}
              <span className="ml-auto text-xs font-normal text-ink-3">{title.length} / {TITLE_MAX}</span>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))} placeholder={t(`community.discussions.titleHint.${kind}`)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 flex text-sm font-medium">
              {t("community.discussions.bodyLabel")}
              <span className="ml-auto text-xs font-normal text-ink-3">{body.length} / {BODY_MAX}</span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
              rows={10}
              placeholder={t(`community.discussions.bodyHint.${kind}`)}
              className="input h-auto resize-y py-2.5 leading-relaxed"
            />
          </label>
          <p className="text-xs text-ink-3">{t("community.discussions.linksHint")}</p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <footer className="safe-bottom flex flex-shrink-0 justify-end gap-2 border-t border-line/[0.08] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost hidden sm:inline-flex">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={submit} disabled={!ok || busy} className="btn btn-primary w-full sm:w-auto">
            {t("community.discussions.publish")}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function matches(topic, q) {
  if (!q) return true;
  return [topic.title, topic.excerpt, topic.author_display_name, topic.author_username].join(" ").toLowerCase().includes(q);
}

/**
 * @param {object} p
 * @param {string} p.channel  "questions" | "guides" | "ideas" | "discussions" | "mytopics"
 * @param {string|null} [p.kind]  topic kind, null for every kind
 * @param {"all"|"mine"} [p.scope]
 */
export default function DiscussionsSection({ channel, kind = null, scope = "all", onBack, onOpenTopic }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [sort, setSort] = useState("active");
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState(null);
  const [more, setMore] = useState(false);
  const [composer, setComposer] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    const { topics: rows } = await fetchTopics({ kind, sort, scope });
    setTopics(rows);
    setMore(rows.length >= TOPICS_PAGE);
  }, [kind, sort, scope]);

  useEffect(() => {
    setTopics(null);
    load();
  }, [load, status]);

  async function loadMore() {
    const { topics: rows } = await fetchTopics({ kind, sort, scope, offset: topics.length });
    setTopics((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    setMore(rows.length >= TOPICS_PAGE);
  }

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (topics || []).filter((x) => matches(x, q)), [topics, q]);

  const contests = kind === "contest";
  const actionLabel = t(contests ? "community.contest.new" : "community.discussions.new");
  const actionIcon = contests ? "trophy" : "plus";
  const action = signedIn
    ? { label: actionLabel, icon: actionIcon, onClick: () => setComposer(true) }
    : { label: actionLabel, icon: actionIcon, href: `/login?redirect=${encodeURIComponent(channelHref(channel))}` };

  const sortLabels = Object.fromEntries(SORTS.map((k) => [k, t(`community.discussions.sort.${k}`)]));

  return (
    <>
      <ChannelHeader
        channel={channel}
        onBack={onBack}
        search={{ value: query, onChange: setQuery }}
        sort={{ value: sort, options: SORTS, labels: sortLabels, onChange: setSort }}
        action={action}
      />

      <div className="px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
        {topics === null ? (
          <FeedSkeleton />
        ) : topics.length === 0 ? (
          <EmptyState
            icon={CHANNELS[channel]?.icon || "chat"}
            title={t(scope === "mine" ? "community.discussions.emptyMineTitle" : contests ? "community.contest.emptyTitle" : "community.discussions.emptyTitle")}
            body={t(kind ? `community.discussions.emptyBodyByKind.${kind}` : "community.discussions.emptyBody")}
            action={action}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title={t("community.shell.noMatches")} body={t("community.shell.noMatchesBody")} />
        ) : (
          <>
            <FeedList>
              {visible.map((topic) => {
                const name = topic.author_display_name || topic.author_username || t("common.member");
                const metrics = [{ icon: "chat", value: topic.reply_count, label: t("community.topic.replies", { count: topic.reply_count }) }];
                if (topic.helpful_count > 0) metrics.push({ icon: "star", value: topic.helpful_count, label: t("community.rail.helpfulCount", { count: topic.helpful_count }) });
                return (
                  <FeedRow
                    key={topic.id}
                    author={{ name, avatar: topic.author_avatar_url ? publicAsset(topic.author_avatar_url) : null }}
                    time={relativeAgo(topic.last_activity_at, t.lang)}
                    title={topic.title}
                    text={topic.excerpt}
                    pinned={topic.pinned}
                    muted={topic.hidden}
                    image={topic.cover ? communityImageUrl(topic.cover) : undefined}
                    status={
                      topic.kind === "question" && topic.solved ? (
                        <span className="inline-flex items-center gap-1 font-medium text-accent-ink">
                          <Icon name="check" size={12} />
                          {t("community.discussions.solved")}
                        </span>
                      ) : null
                    }
                    chips={
                      <>
                        {kind === null && <KindTag kind={topic.kind} />}
                        {topic.kind === "contest" && <ContestBadges endsAt={topic.contest_ends_at} official={topic.pinned} prize={topic.contest_prize} />}
                        {topic.hidden && <span className="tag text-danger">{t("community.requests.hiddenTag")}</span>}
                      </>
                    }
                    metrics={metrics}
                    onClick={() => onOpenTopic(topic.id, channel === "mytopics" ? channelForKind(topic.kind) : channel)}
                  />
                );
              })}
            </FeedList>
            {more && !q && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={loadMore} className="btn btn-secondary">
                  {t("community.showMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {contests ? (
        <ContestComposer
          open={composer}
          onClose={() => setComposer(false)}
          onCreated={(id) => {
            setComposer(false);
            setNotice(t("community.contest.published"));
            window.setTimeout(() => setNotice(null), 3000);
            onOpenTopic(id, "contests");
          }}
        />
      ) : (
      <NewTopicDialog
        open={composer}
        initialKind={kind}
        onClose={() => setComposer(false)}
        onCreated={(id, createdKind) => {
          setComposer(false);
          setNotice(t("community.discussions.published"));
          window.setTimeout(() => setNotice(null), 3000);
          onOpenTopic(id, channelForKind(createdKind));
        }}
      />
      )}
      <Toast message={notice} />
    </>
  );
}
