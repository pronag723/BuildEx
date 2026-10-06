"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useUnread } from "../../../lib/chat/UnreadContext";
import { Icon } from "../../../lib/icons";
import Toast from "../../components/Toast";
import { withBase } from "../../home/utils";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import {
  fetchMessages,
  getOrCreateConversation,
  haveIReportedConversation,
  listConversations,
  markConversationRead,
  reportConversation,
  resolveProfileByUsername,
  sendMessage,
  sendImageMessage,
  subscribeToConversation,
  subscribeToInbox,
} from "../../../lib/chat/api";
import ConversationList from "./ConversationList";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { translate } from "../../../lib/i18n/translate.mjs";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import MessageThread from "./MessageThread";

// Inbox row → the peer identity shape MessageThread/ConversationList consume.
function peerFromConversation(c) {
  return {
    id: c.other_id,
    username: c.other_username,
    display_name: c.other_display_name,
    avatar_url: c.other_avatar_url,
  };
}

// Merge fetched history with any optimistic/realtime messages already in state,
// keyed by id and pinned to the active conversation, so neither a late fetch nor
// a duplicate realtime event can wipe or double a just-sent message.
function mergeMessages(prev, rows, convId) {
  const map = new Map();
  for (const m of prev) if (m.conversation_id === convId) map.set(m.id, m);
  for (const m of rows) map.set(m.id, m);
  return [...map.values()].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
}

// Conversation-list width bounds (desktop only). Telegram-style drag divider.
const LIST_MIN = 76;
const LIST_MAX = 520;
const LIST_DEFAULT = 340;
const LIST_COMPACT_BELOW = 200;
const LIST_WIDTH_KEY = "buildex-chats-list-width";

export default function ChatsPage() {
  const { status, user, displayUser } = useAuth();
  const t = useT();
  const { refresh: refreshUnread, setActiveConversation } = useUnread();
  useRequireAuth(); // bounces to /login (preserving ?to/?c) when unauthenticated

  const meId = user?.id || null;

  // ── Resizable conversation-list pane (desktop) ──────────────────────────────
  const containerRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [listWidth, setListWidth] = useState(LIST_DEFAULT);
  const listWidthRef = useRef(LIST_DEFAULT);
  const draggingRef = useRef(false);
  useEffect(() => {
    listWidthRef.current = listWidth;
  }, [listWidth]);

  // ── Track desktop breakpoint + restore the saved list width ─────────────────
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    const saved = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
    if (saved >= LIST_MIN && saved <= LIST_MAX) setListWidth(saved);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ── Drag-to-resize the divider between the inbox and the open thread ────────
  const startResize = useCallback((e) => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  }, []);

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return;
      const left = containerRef.current?.getBoundingClientRect().left ?? 0;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const next = Math.max(LIST_MIN, Math.min(clientX - left, LIST_MAX));
      setListWidth(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.localStorage.setItem(LIST_WIDTH_KEY, String(Math.round(listWidthRef.current)));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useScrollLock(mobileMenuOpen);
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);

  const [activeConvId, setActiveConvId] = useState(null);
  const [activePeer, setActivePeer] = useState(null);
  const [activeConversationMeta, setActiveConversationMeta] = useState(null);
  const [isDraft, setIsDraft] = useState(false);

  // Mirror activeConvId into a ref so the long-lived inbox subscription (which
  // only re-binds on auth change) can read the current thread without stale
  // closures.
  const activeConvIdRef = useRef(null);
  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  // Tell the global unread badge which thread is open so messages landing in it
  // (read live) don't light or stick the avatar dot. Clear it on unmount.
  useEffect(() => {
    setActiveConversation(activeConvId);
    return () => setActiveConversation(null);
  }, [activeConvId, setActiveConversation]);

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  // Whether the open thread already has a report from me, so the header can say
  // "Reported" instead of offering the action a second time.
  const [threadReported, setThreadReported] = useState(false);

  // 'list' | 'thread' — only matters on mobile (both panes show side-by-side ≥lg)
  const [mobileView, setMobileView] = useState("list");
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const replaceUrl = useCallback((convId) => {
    const qs = convId ? `?c=${encodeURIComponent(convId)}` : "";
    window.history.replaceState(window.history.state, "", withBase(`/chats${qs}`));
  }, []);

  const openConversation = useCallback(
    (convId, peer, meta = null) => {
      setIsDraft(false);
      setActivePeer(peer);
      setActiveConversationMeta(meta);
      setActiveConvId(convId);
      setMobileView("thread");
      replaceUrl(convId);
    },
    [replaceUrl]
  );

  const openDraft = useCallback((peer) => {
    setIsDraft(true);
    setActivePeer(peer);
    setActiveConversationMeta(null);
    setActiveConvId(null);
    setMessages([]);
    setMobileView("thread");
  }, []);

  // ── One-time init: load the inbox, then honour ?to / ?c ─────────────────────
  const initRef = useRef(false);
  useEffect(() => {
    if (status !== "authenticated" || !meId || initRef.current) return;
    initRef.current = true;

    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const to = params.get("to");
      const c = params.get("c");

      const { conversations: rows } = await listConversations();
      if (cancelled) return;
      setConversations(rows);
      setConvLoading(false);

      if (to) {
        const peer = await resolveProfileByUsername(to);
        if (cancelled) return;
        if (!peer) {
          showNotice(translate("chat.notices.builderNotFound"));
          return;
        }
        if (peer.id === meId) {
          showNotice(translate("chat.notices.ownProfile"));
          return;
        }
        const existing = rows.find((x) => x.other_id === peer.id);
        if (existing) openConversation(existing.conversation_id, peerFromConversation(existing), existing);
        else openDraft(peer);
      } else if (c) {
        const conv = rows.find((x) => x.conversation_id === c);
        if (conv) openConversation(conv.conversation_id, peerFromConversation(conv), conv);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, meId, openConversation, openDraft, showNotice]);

  // ── Load + subscribe to the active conversation's messages ──────────────────
  useEffect(() => {
    if (!activeConvId || !meId) return undefined;
    let cancelled = false;
    setMessagesLoading(true);

    fetchMessages(activeConvId).then(({ messages: rows }) => {
      if (cancelled) return;
      setMessages((prev) => mergeMessages(prev, rows, activeConvId));
      setMessagesLoading(false);
    });

    markConversationRead(activeConvId).then(() => {
      setConversations((prev) =>
        prev.map((x) =>
          x.conversation_id === activeConvId ? { ...x, unread_count: 0 } : x
        )
      );
      refreshUnread();
    });

    const unsub = subscribeToConversation(activeConvId, (row) => {
      setMessages((prev) =>
        prev.some((m) => m.id === row.id) ? prev : [...prev, row]
      );
      if (row.sender_id !== meId) markConversationRead(activeConvId).then(refreshUnread);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [activeConvId, meId, refreshUnread]);

  // Has this thread already been reported by me? Resets to false first so the
  // previous thread's answer can never flash on the new one.
  useEffect(() => {
    setThreadReported(false);
    if (!activeConvId) return undefined;
    let cancelled = false;
    haveIReportedConversation(activeConvId).then((yes) => {
      if (!cancelled) setThreadReported(yes);
    });
    return () => {
      cancelled = true;
    };
  }, [activeConvId]);

  // ── Live-refresh the inbox as messages land in any of my threads ────────────
  useEffect(() => {
    if (status !== "authenticated" || !meId) return undefined;
    const unsub = subscribeToInbox(() => {
      listConversations().then(({ conversations: rows }) => {
        const act = activeConvIdRef.current;
        // The open thread is being read live, so never show a stale unread badge
        // on it while the mark-as-read write settles.
        setConversations(
          act
            ? rows.map((r) =>
                r.conversation_id === act ? { ...r, unread_count: 0 } : r
              )
            : rows
        );
      });
    });
    return unsub;
  }, [status, meId]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // ── Send (creates the thread lazily on the very first message) ──────────────
  // Returns { error } so the composer can put a rejected message back in the
  // box. That matters now that get_or_create_conversation can legitimately say
  // no (0100's per-hour / per-day limit on opening new threads): losing what you
  // typed to a rate limit you didn't know existed is its own small injury. The
  // RPC's message is written for a person, so it goes to the toast as-is.
  const handleSend = useCallback(
    async (body) => {
      if (!activePeer || !meId || sending) return { error: null };
      setSending(true);
      try {
        let convId = activeConvId;
        if (!convId) {
          const { conversationId, error } = await getOrCreateConversation(activePeer.id);
          if (error || !conversationId) {
            showNotice(serverMessage(error, "chat.notices.startFailed"));
            return { error: error || new Error("No conversation") };
          }
          convId = conversationId;
          setActiveConvId(convId);
          setIsDraft(false);
          replaceUrl(convId);
        }

        const { message, error } = await sendMessage(convId, meId, body);
        if (error || !message) {
          showNotice(serverMessage(error, "chat.notices.messageFailed"));
          return { error: error || new Error("Not sent") };
        }
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message]
        );

        const { conversations: rows } = await listConversations();
        setConversations(rows);
        return { error: null };
      } finally {
        setSending(false);
      }
    },
    [activePeer, meId, sending, activeConvId, replaceUrl, showNotice]
  );

  // Send a photo. Mirrors handleSend (lazy thread creation + optimistic append +
  // inbox refresh) but routes through sendImageMessage.
  const handleSendImage = useCallback(
    async (file) => {
      if (!activePeer || !meId || sending || !file) return;
      setSending(true);
      try {
        let convId = activeConvId;
        if (!convId) {
          const { conversationId, error } = await getOrCreateConversation(activePeer.id);
          if (error || !conversationId) {
            showNotice(serverMessage(error, "chat.notices.startFailed"));
            return;
          }
          convId = conversationId;
          setActiveConvId(convId);
          setIsDraft(false);
          replaceUrl(convId);
        }

        const { message, error } = await sendImageMessage(convId, meId, file);
        if (error || !message) {
          showNotice(serverMessage(error, "chat.notices.photoFailed"));
          return;
        }
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message]
        );

        const { conversations: rows } = await listConversations();
        setConversations(rows);
      } finally {
        setSending(false);
      }
    },
    [activePeer, meId, sending, activeConvId, replaceUrl, showNotice]
  );

  // Report the open thread. The RPC's errors are written for a person to read
  // (already reported, daily cap, empty reason), so they go straight to the
  // toast; the dialog stays open on failure and closes on success.
  const handleReport = useCallback(
    async (reason) => {
      if (!activeConvId) {
        const error = new Error(translate("chat.notices.reportNeedsMessage"));
        showNotice(error.message);
        return { error };
      }
      const { error } = await reportConversation(activeConvId, reason);
      if (error) {
        showNotice(serverMessage(error, "chat.notices.reportFailed"));
        return { error };
      }
      setThreadReported(true);
      showNotice(translate("chat.notices.reportThanks"));
      return { error: null };
    },
    [activeConvId, showNotice]
  );

  const handleSelect = useCallback(
    (conv) => openConversation(conv.conversation_id, peerFromConversation(conv), conv),
    [openConversation]
  );

  const showThreadPane = Boolean(activePeer);

  // ── Auth gating: keep the chrome, show a spinner until we know who's here ───
  const authReady = status === "authenticated" && meId;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main className="sm:px-5 sm:py-5">
        <div className="mx-auto max-w-6xl">
          <div
            ref={containerRef}
            className="flex h-[calc(100dvh-var(--header-h))] min-h-[360px] overflow-hidden bg-surface sm:h-[calc(100dvh-var(--header-h)-2.5rem)] sm:min-h-[480px] sm:rounded-xl sm:border sm:border-line/[0.09] sm:shadow-card"
          >
            {!authReady ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
              </div>
            ) : (
              <>
                {/* ── Conversation list pane ───────────────────────────────── */}
                <aside
                  style={isDesktop ? { width: `${listWidth}px` } : undefined}
                  className={`${
                    showThreadPane && mobileView === "thread" ? "hidden" : "flex"
                  } lg:flex w-full lg:w-80 xl:w-96 flex-shrink-0 flex-col border-r border-line/[0.08] min-h-0`}
                >
                  {isDesktop && listWidth < LIST_COMPACT_BELOW ? (
                    <div className="flex h-14 flex-shrink-0 items-center justify-center border-b border-line/[0.08]">
                      <span title={t("nav.messages")} aria-label={t("nav.messages")} className="text-ink-2">
                        <Icon name="chat" size={20} />
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-14 flex-shrink-0 items-center border-b border-line/[0.08] px-4">
                      <h1 className="text-base font-semibold">{t("nav.messages")}</h1>
                    </div>
                  )}
                  <ConversationList
                    conversations={conversations}
                    loading={convLoading}
                    activeId={activeConvId}
                    onSelect={handleSelect}
                    compact={isDesktop && listWidth < LIST_COMPACT_BELOW}
                  />
                </aside>

                {/* ── Drag divider (Telegram-style, desktop only) ──────────── */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t("chat.resizeList")}
                  onMouseDown={startResize}
                  onTouchStart={startResize}
                  className="hidden lg:flex flex-shrink-0 w-1.5 -ml-1 cursor-col-resize items-center justify-center group transition-colors"
                >
                  <span className="w-0.5 h-8 rounded-full bg-transparent group-hover:bg-line/30 group-active:bg-accent transition-colors" />
                </div>

                {/* ── Thread pane ──────────────────────────────────────────── */}
                <section
                  className={`${
                    showThreadPane && mobileView === "thread" ? "flex" : "hidden"
                  } lg:flex flex-1 flex-col min-w-0 min-h-0`}
                >
                  {showThreadPane ? (
                    <MessageThread
                      peer={activePeer}
                      messages={messages}
                      meId={meId}
                      loading={messagesLoading && messages.length === 0}
                      sending={sending}
                      isDraft={isDraft}
                      conversationMeta={activeConversationMeta}
                      reported={threadReported}
                      onSend={handleSend}
                      onSendImage={handleSendImage}
                      onReport={handleReport}
                      onBack={() => {
                        setMobileView("list");
                      }}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                      <Icon name="chat" size={28} strokeWidth={1.5} className="mb-3 text-ink-3" />
                      <h2 className="text-base font-semibold">{t("chat.selectTitle")}</h2>
                      <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink-2">
                        {t.rich("chat.selectBody", {
                          cta: <span className="font-medium text-ink">{t("profile.contactBuilder")}</span>,
                        })}
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      <Toast message={notice} />
    </div>
  );
}
