"use client";

// # chat: the global chat (migration 0120) — one room for the whole
// community. Messages arrive live (Supabase Realtime); consecutive messages
// from one person within a few minutes are grouped under one name. Anyone can
// read; signed-in members write (Enter sends, Shift+Enter is a new line),
// reply to a message, or report it. Moderators can hide a message or pause
// someone's messages for a day.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { formatDateTime } from "../../../lib/i18n/format.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import SmartText from "../../../lib/ui/SmartText";
import { reportContent } from "../../../lib/community/api";
import { CHAT_MAX, fetchAuthors, fetchChat, muteChatUser, sendChat, setChatHidden, subscribeChat } from "../../../lib/community/chat";
import Toast from "../../components/Toast";
import ChannelHeader from "./ChannelHeader";
import EmptyState from "./EmptyState";
import ReportDialog from "./ReportDialog";

const GROUP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM = 240;

function nearBottom() {
  const doc = document.documentElement;
  return window.innerHeight + window.scrollY >= doc.scrollHeight - NEAR_BOTTOM;
}

function scrollToBottom(smooth = false) {
  window.requestAnimationFrame(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  );
}

function timeOf(iso, lang) {
  return formatDateTime(iso, lang, { hour: "2-digit", minute: "2-digit" });
}

function MessageActions({ msg, mine, signedIn, isAdmin, onReply, onReport, onHide, onMute }) {
  const t = useT();
  const btn = "flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-line/[0.08] hover:text-ink";
  if (!signedIn) return null;
  return (
    <span className="absolute -top-3 right-2 hidden items-center gap-0.5 rounded-lg border border-line/10 bg-surface p-0.5 shadow-pop group-hover:flex group-focus-within:flex">
      <button type="button" onClick={() => onReply(msg)} className={btn} title={t("community.chat.reply")} aria-label={t("community.chat.reply")}>
        <Icon name="reply" size={15} />
      </button>
      {!mine && (
        <button type="button" onClick={() => onReport(msg)} className={btn} title={t("community.report.short")} aria-label={t("community.report.short")}>
          <Icon name="flag" size={14} />
        </button>
      )}
      {isAdmin && (
        <>
          <button type="button" onClick={() => onHide(msg)} className={btn} title={t("community.topic.hide")} aria-label={t("community.topic.hide")}>
            <Icon name="eyeOff" size={14} />
          </button>
          {!mine && (
            <button type="button" onClick={() => onMute(msg)} className={btn} title={t("community.chat.mute")} aria-label={t("community.chat.mute")}>
              <Icon name="none" size={14} />
            </button>
          )}
        </>
      )}
    </span>
  );
}

export default function CommunityChat({ onBack }) {
  const t = useT();
  const { status, user, profile } = useAuth();
  const signedIn = status === "authenticated";
  const meId = user?.id || null;
  const isAdmin = profile?.is_admin === true;
  const [messages, setMessages] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);
  const [notice, setNotice] = useState(null);
  const [fresh, setFresh] = useState(0); // new messages below while scrolled up
  const authors = useRef({});
  const inputRef = useRef(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const remember = (list) => {
    list.forEach((m) => {
      if (m.author?.id && m.author.displayName) authors.current[m.author.id] = m.author;
    });
  };

  // First page, then live inserts.
  useEffect(() => {
    let cancelled = false;
    fetchChat().then(({ messages: rows }) => {
      if (cancelled) return;
      remember(rows);
      setMessages(rows);
      setMore(rows.length >= 50);
      scrollToBottom();
    });
    const unsubscribe = subscribeChat(async (row) => {
      if (!row?.id) return;
      let author = authors.current[row.author_id];
      if (!author) {
        const found = await fetchAuthors([row.author_id]);
        author = found[row.author_id] || { id: row.author_id, displayName: null, username: null, avatarUrl: null };
        authors.current[row.author_id] = author;
      }
      const stick = nearBottom() || row.author_id === meId;
      setMessages((prev) => {
        if (!prev || prev.some((m) => m.id === row.id)) return prev;
        const parent = row.reply_to_id ? prev.find((m) => m.id === row.reply_to_id) : null;
        return [
          ...prev,
          {
            id: row.id,
            body: row.body,
            createdAt: row.created_at,
            replyToId: row.reply_to_id || null,
            replyBody: parent ? parent.body.slice(0, 140) : null,
            replyAuthor: parent ? parent.author.displayName : null,
            author,
          },
        ];
      });
      if (stick) scrollToBottom(true);
      else setFresh((n) => n + 1);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [meId]);

  useEffect(() => {
    const onScroll = () => {
      if (nearBottom()) setFresh(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function loadOlder() {
    if (!messages?.length) return;
    setLoadingMore(true);
    const doc = document.documentElement;
    const before = doc.scrollHeight;
    const { messages: rows } = await fetchChat({ before: messages[0].createdAt });
    remember(rows);
    setLoadingMore(false);
    setMore(rows.length >= 50);
    setMessages((prev) => [...rows.filter((r) => !prev.some((p) => p.id === r.id)), ...prev]);
    // Keep the reader where they were.
    window.requestAnimationFrame(() => window.scrollBy({ top: doc.scrollHeight - before }));
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const { id, error } = await sendChat(body, replyTo?.id || null);
    setSending(false);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    // Realtime normally brings it back; add it now in case the socket is slow.
    const me = authors.current[meId] || {
      id: meId,
      username: profile?.username || null,
      displayName: profile?.display_name || profile?.username || null,
      avatarUrl: profile?.avatar_url || null,
    };
    setMessages((prev) =>
      (prev || []).some((m) => m.id === id)
        ? prev
        : [
            ...(prev || []),
            {
              id,
              body,
              createdAt: new Date().toISOString(),
              replyToId: replyTo?.id || null,
              replyBody: replyTo ? replyTo.body.slice(0, 140) : null,
              replyAuthor: replyTo ? replyTo.author.displayName : null,
              author: me,
            },
          ]
    );
    setDraft("");
    setReplyTo(null);
    scrollToBottom(true);
    inputRef.current?.focus();
  }

  async function hide(msg) {
    const { error } = await setChatHidden(msg.id, true);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  }

  async function mute(msg) {
    const { error } = await muteChatUser(msg.author.id, 24);
    showNotice(error ? serverMessage(error, "community.errors.failed") : t("community.chat.muted"));
  }

  const name = (a) => a?.displayName || a?.username || t("common.member");

  return (
    <>
      <ChannelHeader channel="chat" onBack={onBack} />

      <div className="flex min-h-[calc(100dvh-var(--header-h)-3.5rem)] flex-col">
        <div className="flex-1 px-2 pb-3 pt-3 sm:px-4">
          {messages === null ? (
            <div className="space-y-4 px-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="skeleton h-2.5 w-24 rounded" />
                    <div className="skeleton h-3 rounded" style={{ width: `${40 + ((i * 17) % 50)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="px-2 pt-2">
              <EmptyState icon="chatRoom" title={t("community.chat.emptyTitle")} body={t("community.chat.emptyBody")} />
            </div>
          ) : (
            <>
              {more && (
                <div className="mb-3 flex justify-center">
                  <button type="button" onClick={loadOlder} disabled={loadingMore} className="btn btn-ghost btn-sm">
                    {loadingMore ? t("community.loading") : t("community.chat.older")}
                  </button>
                </div>
              )}
              <ol aria-live="polite" aria-relevant="additions">
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const grouped =
                    prev &&
                    prev.author?.id === m.author?.id &&
                    !m.replyToId &&
                    Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
                  const mine = m.author?.id === meId;
                  return (
                    <li key={m.id} className={`group relative flex gap-3 rounded-lg px-2 py-0.5 hover:bg-line/[0.035] ${grouped ? "" : "mt-3"}`}>
                      <div className="w-9 flex-shrink-0">
                        {!grouped &&
                          (m.author?.username ? (
                            <Link href={`/builders/profile?u=${encodeURIComponent(m.author.username)}`} tabIndex={-1}>
                              <Avatar src={m.author.avatarUrl} name={name(m.author)} size={36} />
                            </Link>
                          ) : (
                            <Avatar src={m.author?.avatarUrl} name={name(m.author)} size={36} />
                          ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        {m.replyToId && (
                          <p className="mb-0.5 flex min-w-0 items-center gap-1 text-xs text-ink-3">
                            <Icon name="reply" size={12} className="flex-shrink-0 -scale-x-100" />
                            {m.replyBody !== null ? (
                              <>
                                <span className="flex-shrink-0 font-medium text-ink-2">{m.replyAuthor}</span>
                                <span className="truncate">{m.replyBody}</span>
                              </>
                            ) : (
                              <span className="italic">{t("community.chat.replyGone")}</span>
                            )}
                          </p>
                        )}
                        {!grouped && (
                          <p className="flex items-baseline gap-2">
                            <span className={`truncate text-sm font-semibold ${mine ? "text-accent-ink" : "text-ink"}`}>{name(m.author)}</span>
                            {m.author?.isBuilder && <span className="text-[11px] text-ink-3">{t("community.chat.builder")}</span>}
                            <time className="flex-shrink-0 text-[11px] text-ink-3" dateTime={m.createdAt}>{timeOf(m.createdAt, t.lang)}</time>
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink [overflow-wrap:anywhere]">
                          <SmartText>{m.body}</SmartText>
                        </p>
                      </div>
                      <MessageActions
                        msg={m}
                        mine={mine}
                        signedIn={signedIn}
                        isAdmin={isAdmin}
                        onReply={(x) => {
                          setReplyTo(x);
                          inputRef.current?.focus();
                        }}
                        onReport={setReport}
                        onHide={hide}
                        onMute={mute}
                      />
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>

        {fresh > 0 && (
          <div className="sticky bottom-24 z-10 flex justify-center">
            <button type="button" onClick={() => { setFresh(0); scrollToBottom(true); }} className="btn btn-primary btn-sm shadow-pop">
              <Icon name="chevronDown" size={15} />
              {t("community.chat.newBelow", { count: fresh })}
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="safe-bottom sticky bottom-0 z-10 border-t border-line/[0.08] bg-canvas px-3 py-3 sm:px-5">
          {signedIn ? (
            <>
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-line/[0.05] px-3 py-1.5 text-xs text-ink-2">
                  <Icon name="reply" size={13} className="flex-shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {t("community.chat.replyingTo", { name: name(replyTo.author) })}: {replyTo.body}
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} className="flex-shrink-0 text-ink-3 hover:text-ink" aria-label={t("common.cancel")}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, CHAT_MAX))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                    if (e.key === "Escape" && replyTo) setReplyTo(null);
                  }}
                  rows={1}
                  placeholder={t("community.chat.placeholder")}
                  aria-label={t("community.chat.placeholder")}
                  className="input max-h-40 min-h-[2.75rem] flex-1 resize-none py-2.5 leading-snug"
                />
                <button type="button" onClick={send} disabled={!draft.trim() || sending} className="btn btn-primary h-11 w-11 flex-shrink-0 p-0" aria-label={t("community.chat.send")}>
                  <Icon name="send" size={17} />
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-3">{t("community.chat.hint")}</p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-2">{t("community.chat.guest")}</p>
              <Link href={`/login?redirect=${encodeURIComponent("/community?s=chat")}`} className="btn btn-primary btn-sm">
                {t("community.shell.signIn")}
              </Link>
            </div>
          )}
        </div>
      </div>

      <ReportDialog
        open={Boolean(report)}
        title={t("community.chat.reportTitle")}
        onClose={() => setReport(null)}
        onSubmit={async (reason) => {
          const { error } = await reportContent("chat_message", report.id, reason);
          if (error) {
            showNotice(serverMessage(error, "community.errors.failed"));
            return { error };
          }
          showNotice(t("community.report.thanks"));
          return { error: null };
        }}
      />
      <Toast message={notice} />
    </>
  );
}
