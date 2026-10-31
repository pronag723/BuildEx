"use client";

// Discussions (stage 4b): one section, three kinds of topic — question, guide,
// idea (stage-0 proposal П7: no separate Help/Guides/Ideas while the community
// is small). The list is rows divided by lines, not cards; a topic opens in
// place (?t=), see TopicView.jsx.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { useScrollLock } from "../../../lib/useScrollLock";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { publicAsset } from "../../home/utils";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { createTopic, fetchTopics, TOPIC_KINDS, TOPICS_PAGE } from "../../../lib/community/api";
import Toast from "../../components/Toast";

const TITLE_MAX = 120;
const BODY_MAX = 10000;

// Labels: `community.discussions.kinds.<kind>`.
export function KindTag({ kind }) {
  const t = useT();
  return <span className="tag">{t(`community.discussions.kinds.${kind}`)}</span>;
}

function TopicRow({ topic, onOpen }) {
  const t = useT();
  const name = topic.author_display_name || topic.author_username || t("common.member");
  return (
    <li>
      <button type="button" onClick={() => onOpen(topic.id)} className="flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-line/[0.04]">
        <Avatar src={topic.author_avatar_url ? publicAsset(topic.author_avatar_url) : null} name={name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {topic.pinned && <Icon name="pin" size={13} className="text-ink-3" />}
            <span className={`truncate text-sm font-semibold ${topic.hidden ? "text-ink-3 line-through" : ""}`}>{topic.title}</span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-3">{topic.excerpt}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            <KindTag kind={topic.kind} />
            {topic.kind === "question" && topic.solved && (
              <span className="inline-flex items-center gap-1 font-medium text-accent-ink">
                <Icon name="check" size={12} />
                {t("community.discussions.solved")}
              </span>
            )}
            <span>{name}</span>
            <span>· {relativeAgo(topic.last_activity_at, t.lang)}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <Icon name="chat" size={13} />
            {topic.reply_count}
          </span>
          {topic.helpful_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon name="star" size={12} />
              {topic.helpful_count}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function NewTopicDialog({ open, onClose, onCreated }) {
  const t = useT();
  const [kind, setKind] = useState("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useScrollLock(open);
  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setError(null);
    }
  }, [open]);
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
    onCreated(topicId);
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
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`tag-toggle ${kind === k ? "border-accent/60 bg-raised text-ink" : ""}`}
                >
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
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder={t(`community.discussions.titleHint.${kind}`)}
              className="input"
            />
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

export default function DiscussionsSection({ scope = "all", onOpenTopic }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [sort, setSort] = useState("active");
  const [kind, setKind] = useState(null);
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

  const titleKey = scope === "mine" ? "community.sections.mytopics" : "community.sections.discussions";

  return (
    <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <header className="mb-4 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
            <p className="mt-1 text-sm text-ink-2">{t(scope === "mine" ? "community.discussions.mineSubtitle" : "community.discussions.subtitle")}</p>
          </div>
          {signedIn ? (
            <button type="button" onClick={() => setComposer(true)} className="btn btn-primary">
              <Icon name="plus" size={16} />
              {t("community.discussions.new")}
            </button>
          ) : (
            <Link href={`/login?redirect=${encodeURIComponent("/community?s=discussions")}`} className="btn btn-primary">
              {t("community.discussions.new")}
            </Link>
          )}
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1" role="tablist" aria-label={t("community.showcase.sortAria")}>
            {["active", "new", "top"].map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={sort === key}
                onClick={() => setSort(key)}
                className={`relative h-9 px-3 text-sm font-medium transition-colors ${
                  sort === key ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent" : "text-ink-2 hover:text-ink"
                }`}
              >
                {t(`community.discussions.sort.${key}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setKind(null)} aria-pressed={!kind} className={`tag-toggle ${!kind ? "border-accent/60 bg-raised text-ink" : ""}`}>
              {t("community.discussions.allKinds")}
            </button>
            {TOPIC_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(kind === k ? null : k)}
                aria-pressed={kind === k}
                className={`tag-toggle ${kind === k ? "border-accent/60 bg-raised text-ink" : ""}`}
              >
                {t(`community.discussions.kindsPlural.${k}`)}
              </button>
            ))}
          </div>
        </div>

        {topics === null ? (
          <div className="card divide-y divide-line/[0.06]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 px-4 py-4">
                <div className="skeleton h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="skeleton h-2.5 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line/15 px-6 py-14 text-center">
            <p className="text-sm font-medium">{t("community.discussions.emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-3">{t("community.discussions.emptyBody")}</p>
          </div>
        ) : (
          <>
            <ul className="card divide-y divide-line/[0.06] overflow-hidden">
              {topics.map((topic) => (
                <TopicRow key={topic.id} topic={topic} onOpen={onOpenTopic} />
              ))}
            </ul>
            {more && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={loadMore} className="btn btn-secondary">
                  {t("community.showMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="hidden h-fit space-y-3 xl:block">
        <div className="card p-4">
          <p className="text-sm font-semibold">{t("community.discussions.aboutTitle")}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{t("community.discussions.aboutBody")}</p>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            {TOPIC_KINDS.map((k) => (
              <li key={k}>
                <span className="font-medium text-ink">{t(`community.discussions.kinds.${k}`)}</span>
                {" — "}
                {t(`community.discussions.kindAbout.${k}`)}
              </li>
            ))}
          </ul>
          <Link href="/legal/community" className="mt-3 inline-block text-xs text-ink-3 underline hover:text-ink">
            {t("community.rules")}
          </Link>
        </div>
      </aside>

      <NewTopicDialog
        open={composer}
        onClose={() => setComposer(false)}
        onCreated={(id) => {
          setComposer(false);
          setNotice(t("community.discussions.published"));
          window.setTimeout(() => setNotice(null), 3000);
          onOpenTopic(id);
        }}
      />
      <Toast message={notice} />
    </section>
  );
}
