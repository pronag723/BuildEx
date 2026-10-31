"use client";

// One discussion topic: breadcrumbs, the post, a flat list of replies (a reply
// can quote another), the best answer on a solved question, a composer pinned
// to the bottom, and a small card about the author. Text is plain with links
// (SmartText turns BuildEx links into labelled chips).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { formatDate } from "../../../lib/i18n/format.mjs";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import SmartText from "../../../lib/ui/SmartText";
import { publicAsset } from "../../home/utils";
import {
  editReply,
  editTopic,
  fetchTopic,
  markSolved,
  replyToTopic,
  reportContent,
  setForumHidden,
  setTopicPinned,
  toggleHelpful,
  toggleTopicSave,
} from "../../../lib/community/api";
import Toast from "../../components/Toast";
import ReportDialog from "./ReportDialog";
import { KindTag } from "./DiscussionsSection";

function Author({ name, avatar, isBuilder, username, at, edited }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <Avatar src={avatar ? publicAsset(avatar) : null} name={name} size={28} />
      <div className="min-w-0 text-xs">
        <p className="flex items-center gap-1.5">
          {isBuilder && username ? (
            <Link href={`/builders/profile?u=${encodeURIComponent(username)}`} className="truncate font-medium text-ink hover:underline">
              {name}
            </Link>
          ) : (
            <span className="truncate font-medium text-ink">{name}</span>
          )}
          {isBuilder && <span className="tag h-[18px] px-1.5 text-[10px]">{t("chat.builderTag")}</span>}
        </p>
        <p className="text-ink-3">
          {relativeAgo(at, t.lang)}
          {edited && ` · ${t("community.topic.edited")}`}
        </p>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, active = false, filled = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-line/[0.06] disabled:opacity-40 ${
        active ? "text-ink" : "text-ink-3 hover:text-ink"
      }`}
    >
      <Icon name={icon} size={14} filled={filled} />
      {label}
    </button>
  );
}

function EditBox({ initialTitle, initialBody, withTitle, onCancel, onSave }) {
  const t = useT();
  const [title, setTitle] = useState(initialTitle || "");
  const [body, setBody] = useState(initialBody || "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      {withTitle && <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} className="input" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, withTitle ? 10000 : 5000))} rows={6} className="input h-auto resize-y py-2.5 leading-relaxed" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
        <button
          type="button"
          disabled={busy || !body.trim() || (withTitle && title.trim().length < 3)}
          onClick={async () => {
            setBusy(true);
            await onSave(title.trim(), body.trim());
            setBusy(false);
          }}
          className="btn btn-primary btn-sm"
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

export default function TopicView({ topicId, onBack }) {
  const t = useT();
  const { status, user, profile } = useAuth();
  const signedIn = status === "authenticated";
  const meId = user?.id || null;
  const isAdmin = profile?.is_admin === true;
  const [data, setData] = useState(null); // { topic, replies } | { missing: true }
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState(null);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null); // "topic" | reply id
  const [report, setReport] = useState(null); // { type, id }
  const [notice, setNotice] = useState(null);
  const taRef = useRef(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  }, []);

  const load = useCallback(async () => {
    const { topic, replies } = await fetchTopic(topicId);
    setData(topic ? { topic, replies } : { missing: true });
  }, [topicId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load, status]);

  async function run(callFn, okKey) {
    const { error } = await callFn();
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return false;
    }
    if (okKey) showNotice(t(okKey));
    await load();
    return true;
  }

  if (data === null) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="card h-48 skeleton" />
      </div>
    );
  }
  if (data.missing) {
    return (
      <div className="rounded-xl border border-dashed border-line/15 px-6 py-14 text-center">
        <p className="text-sm font-medium">{t("community.topic.missing")}</p>
        <button type="button" onClick={onBack} className="btn btn-secondary btn-sm mt-4">{t("community.topic.back")}</button>
      </div>
    );
  }

  const { topic, replies } = data;
  const mine = topic.author_id === meId;
  const authorName = topic.author_display_name || topic.author_username || t("common.member");
  const byId = Object.fromEntries(replies.map((r) => [r.id, r]));
  const best = topic.solved_reply_id ? byId[topic.solved_reply_id] : null;

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await replyToTopic(topic.id, body, quote?.id || null);
    setSending(false);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    setDraft("");
    setQuote(null);
    await load();
  }

  function renderReply(r, { highlight = false } = {}) {
    const name = r.author_display_name || r.author_username || t("common.member");
    const quoted = r.quote_reply_id ? byId[r.quote_reply_id] : null;
    const isBest = topic.solved_reply_id === r.id;
    const ownReply = r.author_id === meId;
    return (
      <li key={`${highlight ? "best-" : ""}${r.id}`} id={highlight ? undefined : `reply-${r.id}`} className={`px-4 py-4 ${highlight ? "" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <Author name={name} avatar={r.author_avatar_url} isBuilder={r.author_is_builder} username={r.author_username} at={r.created_at} edited={Boolean(r.edited_at)} />
          {isBest && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink">
              <Icon name="check" size={13} />
              {t("community.topic.best")}
            </span>
          )}
        </div>
        {quoted && (
          <button
            type="button"
            onClick={() => document.getElementById(`reply-${quoted.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="mt-2 block w-full rounded-lg border-l-2 border-line/20 bg-raised px-3 py-2 text-left text-xs text-ink-3"
          >
            <span className="font-medium text-ink-2">{quoted.author_display_name || quoted.author_username}</span>
            {": "}
            <span className="line-clamp-2">{quoted.body || t("community.topic.hiddenReply")}</span>
          </button>
        )}
        {editing === r.id ? (
          <div className="mt-2">
            <EditBox
              initialBody={r.body}
              onCancel={() => setEditing(null)}
              onSave={async (_, body) => {
                if (await run(() => editReply(r.id, body))) setEditing(null);
              }}
            />
          </div>
        ) : r.body === null ? (
          <p className="mt-2 text-sm italic text-ink-3">{t("community.topic.hiddenReply")}</p>
        ) : (
          <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed ${r.hidden ? "text-ink-3" : "text-ink"}`}>
            <SmartText>{r.body}</SmartText>
          </p>
        )}
        {!highlight && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <ActionButton
              icon="star"
              filled={r.helpful_by_me}
              active={r.helpful_by_me}
              disabled={!signedIn || ownReply}
              label={`${t("community.topic.helpful")}${r.helpful_count ? ` · ${r.helpful_count}` : ""}`}
              onClick={() => run(() => toggleHelpful("reply", r.id))}
            />
            {signedIn && (
              <ActionButton
                icon="chat"
                label={t("community.topic.quote")}
                onClick={() => {
                  setQuote(r);
                  taRef.current?.focus();
                }}
              />
            )}
            {mine && topic.kind === "question" && (
              <ActionButton
                icon="check"
                active={isBest}
                label={isBest ? t("community.topic.unmarkBest") : t("community.topic.markBest")}
                onClick={() => run(() => markSolved(topic.id, isBest ? null : r.id))}
              />
            )}
            {ownReply && <ActionButton icon="pencil" label={t("common.edit")} onClick={() => setEditing(r.id)} />}
            {signedIn && !ownReply && (
              <ActionButton icon="flag" label={t("community.report.short")} onClick={() => setReport({ type: "reply", id: r.id })} />
            )}
            {isAdmin && (
              <ActionButton
                icon={r.hidden ? "eye" : "eyeOff"}
                label={r.hidden ? t("community.topic.unhide") : t("community.topic.hide")}
                onClick={() => run(() => setForumHidden("reply", r.id, !r.hidden))}
              />
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <nav aria-label={t("community.topic.breadcrumbs")} className="mb-3 flex flex-wrap items-center gap-1 text-xs text-ink-3">
          <button type="button" onClick={onBack} className="hover:text-ink">{t("community.sections.discussions")}</button>
          <Icon name="chevronRight" size={12} />
          <span>{t(`community.discussions.kindsPlural.${topic.kind}`)}</span>
        </nav>

        <article className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <KindTag kind={topic.kind} />
            {topic.kind === "question" && topic.solved_reply_id && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink">
                <Icon name="check" size={13} />
                {t("community.discussions.solved")}
              </span>
            )}
            {topic.pinned && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Icon name="pin" size={12} />{t("community.topic.pinned")}</span>}
            {topic.hidden && <span className="text-xs font-medium text-danger">{t("community.requests.hiddenTag")}</span>}
          </div>
          {editing === "topic" ? (
            <div className="mt-3">
              <EditBox
                withTitle
                initialTitle={topic.title}
                initialBody={topic.body}
                onCancel={() => setEditing(null)}
                onSave={async (title, body) => {
                  if (await run(() => editTopic(topic.id, title, body))) setEditing(null);
                }}
              />
            </div>
          ) : (
            <>
              <h1 className="mt-2 text-xl font-semibold leading-snug [overflow-wrap:anywhere]">{topic.title}</h1>
              <div className="mt-3">
                <Author name={authorName} avatar={topic.author_avatar_url} isBuilder={topic.author_is_builder} username={topic.author_username} at={topic.created_at} edited={Boolean(topic.edited_at)} />
              </div>
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                <SmartText>{topic.body}</SmartText>
              </p>
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line/[0.06] pt-3">
            <ActionButton
              icon="star"
              filled={topic.helpful_by_me}
              active={topic.helpful_by_me}
              disabled={!signedIn || mine}
              label={`${t("community.topic.helpful")}${topic.helpful_count ? ` · ${topic.helpful_count}` : ""}`}
              onClick={() => run(() => toggleHelpful("topic", topic.id))}
            />
            {signedIn && (
              <ActionButton
                icon="bookmark"
                filled={topic.saved_by_me}
                active={topic.saved_by_me}
                label={topic.saved_by_me ? t("community.topic.saved") : t("community.topic.save")}
                onClick={() => run(() => toggleTopicSave(topic.id))}
              />
            )}
            {mine && <ActionButton icon="pencil" label={t("common.edit")} onClick={() => setEditing("topic")} />}
            {signedIn && !mine && <ActionButton icon="flag" label={t("community.report.short")} onClick={() => setReport({ type: "topic", id: topic.id })} />}
            {isAdmin && (
              <>
                <ActionButton icon="pin" active={topic.pinned} label={topic.pinned ? t("community.topic.unpin") : t("community.topic.pin")} onClick={() => run(() => setTopicPinned(topic.id, !topic.pinned))} />
                <ActionButton icon={topic.hidden ? "eye" : "eyeOff"} label={topic.hidden ? t("community.topic.unhide") : t("community.topic.hide")} onClick={() => run(() => setForumHidden("topic", topic.id, !topic.hidden))} />
              </>
            )}
          </div>
        </article>

        {best && (
          <div className="mt-4 rounded-xl border border-accent/40">
            <p className="px-4 pt-3 text-xs font-semibold text-accent-ink">{t("community.topic.bestTitle")}</p>
            <ul>{renderReply(best, { highlight: true })}</ul>
          </div>
        )}

        <h2 className="mb-2 mt-6 text-sm font-semibold">{t("community.topic.replies", { count: replies.length })}</h2>
        {replies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line/15 px-4 py-8 text-center text-sm text-ink-3">{t("community.topic.noReplies")}</p>
        ) : (
          <ul className="card divide-y divide-line/[0.06]">{replies.map((r) => renderReply(r))}</ul>
        )}

        {/* Composer, pinned to the bottom while reading */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-line/[0.08] bg-canvas px-4 py-3 sm:mx-0 sm:rounded-t-xl sm:border-x">
          {signedIn ? (
            <>
              {quote && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5 text-xs text-ink-3">
                  <span className="min-w-0 flex-1 truncate">
                    {t("community.topic.quoting", { name: quote.author_display_name || quote.author_username })}
                  </span>
                  <button type="button" onClick={() => setQuote(null)} aria-label={t("common.close")} className="text-ink-3 hover:text-ink">
                    <Icon name="close" size={13} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={taRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 5000))}
                  rows={2}
                  placeholder={t("community.topic.replyPlaceholder")}
                  className="input h-auto max-h-48 min-h-[2.75rem] flex-1 resize-y py-2.5 leading-snug"
                />
                <button type="button" onClick={send} disabled={!draft.trim() || sending} className="btn btn-primary h-11 flex-shrink-0">
                  {t("community.topic.reply")}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm text-ink-2">{t("community.topic.signInToReply")}</p>
              <Link href={`/login?redirect=${encodeURIComponent(`/community?s=discussions&t=${topic.id}`)}`} className="btn btn-primary btn-sm">
                {t("community.requests.signIn")}
              </Link>
            </div>
          )}
        </div>
      </div>

      <aside className="hidden h-fit xl:block">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-3">{t("community.topic.authorTitle")}</p>
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar src={topic.author_avatar_url ? publicAsset(topic.author_avatar_url) : null} name={authorName} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{authorName}</p>
              {topic.author_username && <p className="truncate text-xs text-ink-3">@{topic.author_username}</p>}
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            {t("community.topic.authorSince", { date: formatDate(topic.author_joined, t.lang, { month: "long", year: "numeric" }) })}
            {" · "}
            {t("community.topic.authorTopics", { count: topic.author_topics })}
          </p>
          {topic.author_is_builder && topic.author_username && (
            <Link href={`/builders/profile?u=${encodeURIComponent(topic.author_username)}`} className="btn btn-secondary btn-sm mt-3 w-full">
              {t("chat.profile")}
            </Link>
          )}
        </div>
      </aside>

      <ReportDialog
        open={Boolean(report)}
        title={report?.type === "topic" ? t("community.report.topic") : t("community.report.reply")}
        onClose={() => setReport(null)}
        onSubmit={async (reason) => {
          const { error } = await reportContent(report.type, report.id, reason);
          if (error) {
            showNotice(serverMessage(error, "community.errors.failed"));
            return { error };
          }
          showNotice(t("community.report.thanks"));
          return { error: null };
        }}
      />
      <Toast message={notice} />
    </div>
  );
}
