"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console: every conversation (migration 0111)
//
// A two-pane reader: the conversation list on the left (newest activity
// first, 40 at a time, searchable by "@handle", name or message text), the
// selected thread on the right. On a phone the two panes take turns.
//
// Read-only by design — a moderator acts on what they read from the Builders
// tab or a report, never from inside someone's thread. Message text is shown
// raw, not linkified: a moderator needs to see the real address a scam link
// points to, and should not be one click away from opening it.
//
// Opening a thread goes through admin_get_conversation_messages, which logs
// the view server-side (admin_conversation_views).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  listAdminConversations,
  getAdminConversationMessages,
  CONVERSATIONS_PAGE_SIZE,
} from "../../../lib/admin/api";
import { chatImageUrl } from "../../../lib/chat/api";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate as formatLocaleDate, formatTime, relativeStamp } from "../../../lib/i18n/format.mjs";
import {
  formatDate,
  profileHref,
  errText,
  Spinner,
  SearchBox,
  useDebounced,
  Avatar,
  EmptyState,
  ErrorLine,
  RefreshButton,
} from "./shared";

function personName(c, side, t) {
  return c[`${side}_display_name`] || c[`${side}_username`] || t("admin.reports.user");
}

// The search term as the server matched it: "@handle" searches handles only,
// so there is nothing to highlight in message text.
function textTerm(search) {
  const term = (search || "").trim();
  return term && !term.startsWith("@") ? term : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, term }) {
  const value = String(text ?? "");
  if (!term) return value;
  const parts = value.split(new RegExp(`(${escapeRegExp(term)})`, "ig"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-accent/25 px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

export default function ChatsSection({ initialSearch = "" }) {
  const t = useT();
  const [query, setQuery] = useState(initialSearch);
  const search = useDebounced(query);
  const [conversations, setConversations] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const id = ++requestRef.current;
    setError(null);
    setConversations(null);
    listAdminConversations({ search }).then(({ conversations: rows, error: e }) => {
      if (requestRef.current !== id) return; // a newer search already landed
      if (e) setError(errText(e, "admin.errors.loadChats"));
      setConversations(rows || []);
      setHasMore((rows || []).length >= CONVERSATIONS_PAGE_SIZE);
    });
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(() => {
    const rows = conversations || [];
    const last = rows[rows.length - 1];
    if (!last || loadingMore) return;
    const id = requestRef.current;
    setLoadingMore(true);
    listAdminConversations({ search, before: last.last_message_at }).then(
      ({ conversations: more, error: e }) => {
        setLoadingMore(false);
        if (requestRef.current !== id) return;
        if (e) {
          setError(errText(e, "admin.errors.loadChats"));
          return;
        }
        // A thread that got a new message between pages could show up twice.
        setConversations((prev) => {
          const seen = new Set((prev || []).map((c) => c.conversation_id));
          return [...(prev || []), ...(more || []).filter((c) => !seen.has(c.conversation_id))];
        });
        setHasMore((more || []).length >= CONVERSATIONS_PAGE_SIZE);
      }
    );
  }, [conversations, loadingMore, search]);

  const selected = useMemo(
    () => (conversations || []).find((c) => c.conversation_id === selectedId) || null,
    [conversations, selectedId]
  );
  const term = textTerm(search);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder={t("admin.chats.searchPlaceholder")}
            label={t("admin.chats.searchAria")}
          />
        </div>
        <RefreshButton onClick={load} title={t("admin.reports.reload")} />
      </div>

      <ErrorLine>{error}</ErrorLine>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section
          className={`card overflow-hidden lg:flex lg:h-[calc(100vh-16rem)] lg:min-h-[520px] lg:flex-col ${
            selected ? "hidden" : ""
          }`}
          aria-label={t("admin.chats.listAria")}
        >
          {conversations === null ? (
            <Spinner />
          ) : conversations.length === 0 ? (
            <div className="p-4">
              <EmptyState>{search ? t("admin.chats.noMatch") : t("admin.chats.none")}</EmptyState>
            </div>
          ) : (
            <div className="bx-scroll min-h-0 flex-1 overflow-y-auto">
              <ul className="divide-y divide-line/[0.07]">
                {conversations.map((c) => (
                  <ConversationRow
                    key={c.conversation_id}
                    conversation={c}
                    term={term}
                    active={c.conversation_id === selectedId}
                    onSelect={() => setSelectedId(c.conversation_id)}
                  />
                ))}
              </ul>
              {hasMore && (
                <div className="p-3">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full rounded-full border border-line/10 py-2 text-xs font-semibold text-ink-2 hover:border-accent/40 hover:text-accent-ink transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? t("admin.chats.loading") : t("admin.chats.loadMore")}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className={`min-w-0 ${selected ? "" : "hidden lg:block"}`}>
          {selected ? (
            <ThreadView
              key={selected.conversation_id}
              conversation={selected}
              term={term}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="card flex h-[calc(100vh-16rem)] min-h-[520px] items-center justify-center p-8 text-center text-sm text-ink-3">
              <div>
                <Icon name="chat" size={28} className="mx-auto mb-3 text-ink-3" />
                {t("admin.chats.pick")}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PairAvatars({ c, t }) {
  return (
    <div className="relative h-10 w-10 flex-shrink-0">
      <div className="absolute left-0 top-0">
        <Avatar url={c.a_avatar_url} name={personName(c, "a", t)} size={28} />
      </div>
      <div className="absolute bottom-0 right-0 rounded-full ring-2 ring-[rgb(var(--surface))]">
        <Avatar url={c.b_avatar_url} name={personName(c, "b", t)} size={28} />
      </div>
    </div>
  );
}

function ConversationRow({ conversation: c, term, active, onSelect }) {
  const t = useT();
  const preview = c.match_snippet || c.last_message_preview || "";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`flex w-full gap-3 px-3.5 py-3 text-left transition-colors ${
          active ? "bg-accent/10" : "hover:bg-line/[0.04]"
        }`}
      >
        <PairAvatars c={c} t={t} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-ink">
              {personName(c, "a", t)}
              <span className="mx-1 font-normal text-ink-3">↔</span>
              {personName(c, "b", t)}
            </p>
            <span className="flex-shrink-0 text-[11px] text-ink-3">
              {relativeStamp(c.last_message_at, t.lang)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 break-words text-[12px] leading-snug text-ink-2">
            <Highlight text={preview} term={term} />
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-3">
            <span>{t("admin.chats.messages", { count: c.message_count ?? 0 })}</span>
            {c.open_reports > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-danger">
                <Icon name="flag" size={11} />
                {t("admin.chats.reported")}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function Party({ c, side, align = "left" }) {
  const t = useT();
  const name = personName(c, side, t);
  const username = c[`${side}_username`];
  const isBuilder = c[`${side}_is_builder`];
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <Avatar url={c[`${side}_avatar_url`]} name={name} size={32} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="truncate text-[11px] text-ink-3">
          {username && isBuilder ? (
            <Link
              href={profileHref(username)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent-ink transition-colors"
            >
              @{username} · {t("admin.users.builder")}
            </Link>
          ) : username ? (
            `@${username}`
          ) : (
            t("admin.users.noHandle")
          )}
        </p>
      </div>
    </div>
  );
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function ThreadView({ conversation: c, term, onBack }) {
  const t = useT();
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const load = useCallback(() => {
    setError(null);
    getAdminConversationMessages(c.conversation_id).then(({ messages: rows, error: e }) => {
      if (e) setError(errText(e, "admin.errors.loadConversation"));
      setMessages(rows || []);
    });
  }, [c.conversation_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Land on the newest message, like the chat itself does.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && messages?.length) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="card flex h-[calc(100dvh-9rem)] min-h-[420px] flex-col overflow-hidden lg:h-[calc(100vh-16rem)] lg:min-h-[520px]">
      <header className="flex-shrink-0 border-b border-line/[0.08] px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("admin.chats.back")}
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-line/5 hover:text-ink lg:hidden"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
            <Party c={c} side="a" />
            <Party c={c} side="b" align="right" />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <span>{t("admin.chats.started", { date: formatDate(c.created_at) })}</span>
          <span>{t("admin.chats.messages", { count: c.message_count ?? 0 })}</span>
          {c.open_reports > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <Icon name="flag" size={11} />
              {t("admin.chats.openReports", { count: c.open_reports })}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            className="ml-auto inline-flex items-center gap-1 hover:text-accent-ink transition-colors"
          >
            <Icon name="refresh" size={11} />
            {t("admin.reports.reload")}
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="bx-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <ErrorLine>{error}</ErrorLine>
        {messages === null ? (
          <Spinner small />
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">{t("admin.reports.noMessages")}</p>
        ) : (
          <ol className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || !sameDay(prev.created_at, m.created_at);
              const firstOfRun = newDay || prev.sender_id !== m.sender_id;
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className="py-2 text-center text-[11px] font-medium text-ink-3">
                      {formatLocaleDate(m.created_at, t.lang, {
                        weekday: "short",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </li>
                  )}
                  <ThreadMessage
                    message={m}
                    side={m.sender_id === c.b_id ? "b" : "a"}
                    showName={firstOfRun}
                    term={term}
                  />
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>

      <footer className="flex flex-shrink-0 items-center gap-1.5 border-t border-line/[0.08] px-4 py-2 text-[11px] text-ink-3">
        <Icon name="eye" size={12} />
        {t("admin.chats.logged")}
      </footer>
    </div>
  );
}

function ThreadMessage({ message: m, side, showName, term }) {
  const t = useT();
  const right = side === "b";
  const name = m.sender_display_name || m.sender_username || t("admin.reports.user");
  const imageUrl = m.msg_type === "image" ? chatImageUrl(m.meta) : null;
  const isImage = Boolean(imageUrl);

  // Anything that is neither text nor a photo is a system line (the order
  // events of the old marketplace still sit in some threads).
  if (m.msg_type && m.msg_type !== "text" && !isImage) {
    return (
      <li className="py-1 text-center text-[11px] italic text-ink-3">
        {m.body} · {formatTime(m.created_at, t.lang)}
      </li>
    );
  }

  return (
    <li className={`flex ${right ? "justify-end" : "justify-start"} ${showName ? "pt-2" : ""}`}>
      <div className={`flex min-w-0 max-w-[82%] flex-col ${right ? "items-end" : "items-start"}`}>
        {showName && <span className="mb-0.5 px-1 text-[11px] font-medium text-ink-2">{name}</span>}
        <div
          className={`rounded-2xl border px-3 py-2 text-[13px] leading-relaxed text-ink ${
            right
              ? "rounded-tr-md border-accent/20 bg-accent/10"
              : "rounded-tl-md border-line/10 bg-raised"
          }`}
        >
          {isImage && (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={m.body || t("chat.photo")}
                className="mb-1 max-h-60 w-auto rounded-xl border border-line/10 object-cover"
                loading="lazy"
              />
            </a>
          )}
          {m.body && (
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              <Highlight text={m.body} term={term} />
            </p>
          )}
          <span className="mt-0.5 block text-right text-[10px] text-ink-3">
            {formatTime(m.created_at, t.lang)}
          </span>
        </div>
      </div>
    </li>
  );
}
