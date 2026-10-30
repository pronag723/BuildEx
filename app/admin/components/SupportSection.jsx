"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console: support inbox (migration 0112)
//
// Every user's support thread, by status: "open" (they wrote last — waiting on
// us), "waiting" (we wrote last — waiting on them), "closed". A moderator reads
// and answers in place; closing leaves a "Request closed" line the user sees,
// and the user writing again reopens it.
//
// Unlike the Chats tab this is not oversight of someone else's conversation —
// support threads are addressed to the team — so it reads and writes through
// the ordinary chat calls (RLS lets every is_admin into support threads) and
// moves the moderator's own read cursor.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { listSupportThreads, setSupportClosed, SUPPORT_STATUSES } from "../../../lib/admin/api";
import {
  chatImageUrl,
  fetchMessages,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
} from "../../../lib/chat/api";
import { useAuth } from "../../../lib/auth/AuthContext";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate as formatLocaleDate, formatTime, relativeStamp } from "../../../lib/i18n/format.mjs";
import { translateServerText } from "../../../lib/i18n/serverText.mjs";
import {
  profileHref,
  errText,
  Spinner,
  Avatar,
  EmptyState,
  ErrorLine,
  PillTabs,
  RefreshButton,
  LastSeen,
} from "./shared";

const TABS = [...SUPPORT_STATUSES.map((key) => ({ key })), { key: "all" }];

function personName(row, t) {
  return row.display_name || row.username || t("admin.reports.user");
}

export default function SupportSection({ initialConversation = null }) {
  const t = useT();
  const [tab, setTab] = useState(initialConversation ? "all" : "open");
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(initialConversation);
  // The open thread stays open after a reply or a close moves it to another
  // tab: this keeps the last row seen for it, patched locally.
  const [selectedRow, setSelectedRow] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const id = ++requestRef.current;
    setError(null);
    listSupportThreads(tab === "all" ? null : tab).then(({ threads: rows, error: e }) => {
      if (requestRef.current !== id) return;
      if (e) setError(errText(e, "admin.errors.loadSupport"));
      setThreads(rows || []);
    });
  }, [tab]);

  useEffect(() => {
    setThreads(null);
    load();
  }, [load]);

  const listed = (threads || []).find((x) => x.conversation_id === selectedId) || null;
  useEffect(() => {
    if (listed) setSelectedRow(listed);
  }, [listed]);
  const selected =
    listed || (selectedRow && selectedRow.conversation_id === selectedId ? selectedRow : null);

  const patchSelected = useCallback(
    (patch) => {
      setSelectedRow((row) => (row ? { ...row, ...patch } : row));
      load();
    },
    [load]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PillTabs items={TABS} value={tab} onChange={setTab} label={(key) => t(`admin.support.tabs.${key}`)} />
        <RefreshButton onClick={load} title={t("admin.reports.reload")} />
      </div>

      <ErrorLine>{error}</ErrorLine>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section
          className={`card overflow-hidden lg:flex lg:h-[calc(100vh-16rem)] lg:min-h-[520px] lg:flex-col ${
            selected ? "hidden" : ""
          }`}
          aria-label={t("admin.support.listAria")}
        >
          {threads === null ? (
            <Spinner />
          ) : threads.length === 0 ? (
            <div className="p-4">
              <EmptyState>{t(`admin.support.empty.${tab}`)}</EmptyState>
            </div>
          ) : (
            <ul className="bx-scroll min-h-0 flex-1 divide-y divide-line/[0.07] overflow-y-auto">
              {threads.map((row) => (
                <li key={row.conversation_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.conversation_id)}
                    aria-current={row.conversation_id === selectedId ? "true" : undefined}
                    className={`flex w-full gap-3 px-3.5 py-3 text-left transition-colors ${
                      row.conversation_id === selectedId ? "bg-raised" : "hover:bg-line/[0.04]"
                    }`}
                  >
                    <Avatar url={row.avatar_url} name={personName(row, t)} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-sm font-semibold">{personName(row, t)}</p>
                        <span className="ml-auto flex-shrink-0 text-[11px] text-ink-3">
                          {relativeStamp(row.last_message_at, t.lang)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-ink-2">
                        {translateServerText(row.last_message_preview, t.lang)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {row.topic && <span className="tag">{t(`chat.support.topics.${row.topic}`)}</span>}
                        <span className="text-[11px] text-ink-3">{t(`admin.support.status.${row.status}`)}</span>
                        {row.unread_count > 0 && (
                          <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
                            {row.unread_count > 9 ? "9+" : row.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`min-w-0 ${selected ? "" : "hidden lg:block"}`}>
          {selected ? (
            <SupportThread
              key={selected.conversation_id}
              thread={selected}
              onBack={() => setSelectedId(null)}
              onChanged={patchSelected}
            />
          ) : (
            <div className="card flex h-[calc(100vh-16rem)] min-h-[520px] items-center justify-center p-8 text-center text-sm text-ink-3">
              <div>
                <Icon name="support" size={28} className="mx-auto mb-3 text-ink-3" />
                {t("admin.support.pick")}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function SupportThread({ thread, onBack, onChanged }) {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.id || null;
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const convId = thread.conversation_id;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchMessages(convId).then(({ messages: rows, error: e }) => {
      if (cancelled) return;
      if (e) setError(errText(e, "admin.errors.loadConversation"));
      setMessages(rows || []);
    });
    markConversationRead(convId);
    const unsub = subscribeToConversation(convId, (row) => {
      setMessages((prev) => (prev?.some((m) => m.id === row.id) ? prev : [...(prev || []), row]));
      markConversationRead(convId);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [convId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && messages?.length) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending || !meId) return;
    setSending(true);
    setError(null);
    const { message, error: e } = await sendMessage(convId, meId, body);
    setSending(false);
    if (e || !message) {
      setError(errText(e, "chat.notices.messageFailed"));
      return;
    }
    setDraft("");
    setMessages((prev) => (prev?.some((m) => m.id === message.id) ? prev : [...(prev || []), message]));
    onChanged({ status: "waiting", last_message_at: message.created_at, unread_count: 0 });
  }

  async function toggleClosed() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const closing = thread.status !== "closed";
    const { error: e } = await setSupportClosed(convId, closing);
    setBusy(false);
    if (e) {
      setError(errText(e, "admin.errors.supportClose"));
      return;
    }
    // Reopening by hand leaves it waiting on whoever wrote last; the next
    // reload says which.
    onChanged({ status: closing ? "closed" : "waiting" });
  }

  const name = personName(thread, t);

  return (
    <div className="card flex h-[calc(100dvh-9rem)] min-h-[420px] flex-col overflow-hidden lg:h-[calc(100vh-16rem)] lg:min-h-[520px]">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-line/[0.08] px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("admin.chats.back")}
          className="btn btn-ghost btn-icon -ml-1 lg:hidden"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <Avatar url={thread.avatar_url} name={name} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[11px] text-ink-3">
            {thread.username && thread.is_builder ? (
              <Link href={profileHref(thread.username)} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                @{thread.username} · {t("admin.users.builder")}
              </Link>
            ) : thread.username ? (
              `@${thread.username}`
            ) : null}
            {" · "}
            <LastSeen iso={thread.last_seen_at} />
          </p>
        </div>
        <button type="button" onClick={toggleClosed} disabled={busy} className="btn btn-secondary btn-sm flex-shrink-0">
          {thread.status === "closed" ? t("admin.support.reopen") : t("admin.support.close")}
        </button>
      </header>

      <div ref={scrollRef} className="bx-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <ErrorLine>{error}</ErrorLine>
        {messages === null ? (
          <Spinner small />
        ) : (
          <ol className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || !sameDay(prev.created_at, m.created_at);
              const fromUser = m.sender_id === thread.user_id;
              const imageUrl = m.msg_type === "image" ? chatImageUrl(m.meta) : null;
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className="py-2 text-center text-[11px] font-medium text-ink-3">
                      {formatLocaleDate(m.created_at, t.lang, { month: "long", day: "numeric", year: "numeric" })}
                    </li>
                  )}
                  {m.msg_type === "system" ? (
                    <li className="py-1 text-center text-[11px] text-ink-3">
                      {translateServerText(m.body, t.lang)} · {formatTime(m.created_at, t.lang)}
                    </li>
                  ) : (
                    <li className={`flex ${fromUser ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[82%] rounded-[14px] px-3 py-2 text-[13px] leading-relaxed ${
                          fromUser ? "rounded-bl-[4px] bg-raised text-ink" : "rounded-br-[4px] bg-accent text-accent-fg"
                        }`}
                      >
                        {imageUrl && (
                          <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageUrl}
                              alt={m.body || t("chat.photo")}
                              className="mb-1 max-h-60 w-auto rounded-[10px] object-cover"
                              loading="lazy"
                            />
                          </a>
                        )}
                        {m.body && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>}
                        <span
                          className={`mt-0.5 block text-right text-[10px] ${fromUser ? "text-ink-3" : "text-accent-fg/60"}`}
                        >
                          {formatTime(m.created_at, t.lang)}
                        </span>
                      </div>
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>

      <footer className="flex flex-shrink-0 items-end gap-2 border-t border-line/[0.08] p-2.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={t("admin.support.replyPlaceholder")}
          className="input h-auto max-h-[160px] min-h-[2.75rem] flex-1 resize-none py-2.5 leading-snug"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          className="btn btn-primary h-11 w-11 flex-shrink-0 p-0"
          aria-label={t("chat.sendMessage")}
        >
          <Icon name="send" size={18} />
        </button>
      </footer>
    </div>
  );
}
