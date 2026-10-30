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
  fetchAnnouncementsSummary,
  fetchMessages,
  getOrCreateConversation,
  haveIReportedConversation,
  isSupportConversation,
  listConversations,
  markAnnouncementsRead,
  markConversationRead,
  openSupportThread,
  reportConversation,
  resolveProfileByUsername,
  sendMessage,
  sendImageMessage,
  setAnnouncementsMuted,
  setConversationMuted,
  subscribeToConversation,
  subscribeToInbox,
} from "../../../lib/chat/api";
import ConversationList from "./ConversationList";
import NewChatDialog from "./NewChatDialog";
import UpdatesChannel from "./UpdatesChannel";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { translate } from "../../../lib/i18n/translate.mjs";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import MessageThread from "./MessageThread";
import { fetchWork } from "../../../lib/works/api";

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

// ?c= values for the two pinned threads. The support thread also answers to
// its real id (that is what bell and email links carry).
const UPDATES_KEY = "updates";
const SUPPORT_KEY = "support";

export default function ChatsPage() {
  const { status, user } = useAuth();
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
    try {
      const saved = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
      if (saved >= LIST_MIN && saved <= LIST_MAX) setListWidth(saved);
    } catch {
      // Storage blocked — keep the default width.
    }
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
      try {
        window.localStorage.setItem(LIST_WIDTH_KEY, String(Math.round(listWidthRef.current)));
      } catch {
        // Storage blocked — the width just isn't remembered.
      }
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

  // What the right pane shows: a direct thread, the support thread, the
  // updates channel, or nothing yet.
  const [activeKind, setActiveKind] = useState(null); // 'direct' | 'support' | 'updates' | null
  const [activeConvId, setActiveConvId] = useState(null);
  const [activePeer, setActivePeer] = useState(null);
  const [activeConversationMeta, setActiveConversationMeta] = useState(null);
  const [isDraft, setIsDraft] = useState(false);
  // Text to start the composer with, for one peer: "Discuss a similar build"
  // on a work links here with ?work=<id>, and the message names that work.
  // Never sent automatically — the visitor edits or sends it themselves.
  const [prefill, setPrefill] = useState(null); // { peerId, text }

  // The pinned system threads (0112). Until that migration runs, the summary
  // RPC does not exist and both rows stay hidden.
  const [systemAvailable, setSystemAvailable] = useState(false);
  const [updatesSummary, setUpdatesSummary] = useState(null);
  const [supportTopic, setSupportTopic] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);

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

  const replaceUrl = useCallback((key) => {
    const qs = key ? `?c=${encodeURIComponent(key)}` : "";
    window.history.replaceState(window.history.state, "", withBase(`/chats${qs}`));
  }, []);

  const openConversation = useCallback(
    (convId, peer, meta = null) => {
      setIsDraft(false);
      setActiveKind(isSupportConversation(meta) ? "support" : "direct");
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
    setActiveKind("direct");
    setActivePeer(peer);
    setActiveConversationMeta(null);
    setActiveConvId(null);
    setMessages([]);
    setMobileView("thread");
  }, []);

  // Support: the existing thread if there is one, otherwise an unsent draft
  // that becomes a thread with the first message (open_support_thread).
  const openSupport = useCallback(
    (rows) => {
      const existing = (rows || []).find(isSupportConversation);
      setActivePeer(null);
      setActiveKind("support");
      setMobileView("thread");
      if (existing) {
        setIsDraft(false);
        setActiveConversationMeta(existing);
        setActiveConvId(existing.conversation_id);
        replaceUrl(existing.conversation_id);
      } else {
        setIsDraft(true);
        setActiveConversationMeta(null);
        setActiveConvId(null);
        setMessages([]);
        replaceUrl(SUPPORT_KEY);
      }
    },
    [replaceUrl]
  );

  const openUpdates = useCallback(() => {
    setIsDraft(false);
    setActiveKind("updates");
    setActivePeer(null);
    setActiveConversationMeta(null);
    setActiveConvId(null);
    setMessages([]);
    setMobileView("thread");
    replaceUrl(UPDATES_KEY);
  }, [replaceUrl]);

  const loadSummary = useCallback(async () => {
    const { summary, available } = await fetchAnnouncementsSummary();
    setSystemAvailable(available);
    if (summary) setUpdatesSummary(summary);
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

      const [{ conversations: rows }] = await Promise.all([listConversations(), loadSummary()]);
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
        const workId = params.get("work");
        if (workId) {
          const { work } = await fetchWork(workId);
          if (cancelled) return;
          if (work && work.builderId === peer.id) {
            const link = `${window.location.origin}${withBase("/builders/profile/")}?u=${encodeURIComponent(peer.username || to)}&w=${work.id}`;
            setPrefill({
              peerId: peer.id,
              text: translate("chat.workDraft", {
                title: work.title || translate("profile.works.untitled"),
                link,
              }),
            });
          }
        }
        const existing = rows.find((x) => x.other_id === peer.id);
        if (existing) openConversation(existing.conversation_id, peerFromConversation(existing), existing);
        else openDraft(peer);
      } else if (c === UPDATES_KEY) {
        openUpdates();
      } else if (c === SUPPORT_KEY) {
        openSupport(rows);
      } else if (c) {
        const conv = rows.find((x) => x.conversation_id === c);
        if (conv && isSupportConversation(conv)) openSupport(rows);
        else if (conv) openConversation(conv.conversation_id, peerFromConversation(conv), conv);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, meId, openConversation, openDraft, openSupport, openUpdates, loadSummary, showNotice]);

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
    if (!activeConvId || activeKind !== "direct") return undefined;
    let cancelled = false;
    haveIReportedConversation(activeConvId).then((yes) => {
      if (!cancelled) setThreadReported(yes);
    });
    return () => {
      cancelled = true;
    };
  }, [activeConvId, activeKind]);

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

  // The thread that will receive the message, created on the first one: a
  // direct thread through get_or_create_conversation (rate limited by 0100),
  // the support thread through open_support_thread.
  const ensureConversation = useCallback(async () => {
    if (activeConvId) return activeConvId;
    const { conversationId, error } =
      activeKind === "support"
        ? await openSupportThread(supportTopic)
        : await getOrCreateConversation(activePeer.id);
    if (error || !conversationId) {
      showNotice(serverMessage(error, "chat.notices.startFailed"));
      return null;
    }
    setActiveConvId(conversationId);
    setIsDraft(false);
    replaceUrl(conversationId);
    return conversationId;
  }, [activeConvId, activeKind, activePeer, supportTopic, replaceUrl, showNotice]);

  const canSend = activeKind === "support" || Boolean(activePeer);

  // ── Send (creates the thread lazily on the very first message) ──────────────
  // Returns { error } so the composer can put a rejected message back in the
  // box. That matters now that get_or_create_conversation can legitimately say
  // no (0100's per-hour / per-day limit on opening new threads): losing what you
  // typed to a rate limit you didn't know existed is its own small injury. The
  // RPC's message is written for a person, so it goes to the toast as-is.
  const handleSend = useCallback(
    async (body) => {
      if (!canSend || !meId || sending) return { error: null };
      setSending(true);
      try {
        const convId = await ensureConversation();
        if (!convId) return { error: new Error("No conversation") };

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
    [canSend, meId, sending, ensureConversation, showNotice]
  );

  // Send a photo. Mirrors handleSend (lazy thread creation + optimistic append +
  // inbox refresh) but routes through sendImageMessage.
  const handleSendImage = useCallback(
    async (file) => {
      if (!canSend || !meId || sending || !file) return;
      setSending(true);
      try {
        const convId = await ensureConversation();
        if (!convId) return;

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
    [canSend, meId, sending, ensureConversation, showNotice]
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

  // The open thread's inbox row — fresher than the snapshot taken when it was
  // opened (presence, mute, support status all move).
  const activeRow =
    (activeConvId && conversations.find((c) => c.conversation_id === activeConvId)) ||
    activeConversationMeta;
  const activeMuted = Boolean(activeRow?.is_muted);

  const handleToggleMute = useCallback(async () => {
    if (!activeConvId) return;
    const next = !activeMuted;
    const { muted, error } = await setConversationMuted(activeConvId, next);
    if (error) {
      showNotice(serverMessage(error, "chat.notices.muteFailed"));
      return;
    }
    setConversations((prev) =>
      prev.map((c) => (c.conversation_id === activeConvId ? { ...c, is_muted: muted } : c))
    );
    refreshUnread();
    showNotice(translate(muted ? "chat.notices.muted" : "chat.notices.unmuted"));
  }, [activeConvId, activeMuted, refreshUnread, showNotice]);

  const handleUpdatesRead = useCallback(() => {
    markAnnouncementsRead().then(() =>
      setUpdatesSummary((s) => (s ? { ...s, unread: 0 } : s))
    );
  }, []);

  const handleToggleUpdatesMute = useCallback(async () => {
    const next = !updatesSummary?.muted;
    const { muted, error } = await setAnnouncementsMuted(next);
    if (error) {
      showNotice(serverMessage(error, "chat.notices.muteFailed"));
      return;
    }
    setUpdatesSummary((s) => ({ ...(s || {}), muted }));
  }, [updatesSummary?.muted, showNotice]);

  const closeNewChat = useCallback(() => setNewChatOpen(false), []);

  const handleSelect = useCallback(
    (conv) => openConversation(conv.conversation_id, peerFromConversation(conv), conv),
    [openConversation]
  );

  // A person picked from search or "New chat": their thread if one exists,
  // otherwise a draft that becomes one on the first message.
  const handleStartWith = useCallback(
    (person) => {
      setNewChatOpen(false);
      if (!person?.id || person.id === meId) return;
      const existing = conversations.find(
        (c) => c.other_id === person.id || (person.conversation_id && c.conversation_id === person.conversation_id)
      );
      if (existing) openConversation(existing.conversation_id, peerFromConversation(existing), existing);
      else
        openDraft({
          id: person.id,
          username: person.username,
          display_name: person.display_name,
          avatar_url: person.avatar_url,
          last_seen_at: person.last_seen_at,
        });
    },
    [conversations, meId, openConversation, openDraft]
  );

  const directConversations = conversations.filter((c) => !isSupportConversation(c));
  const supportRow = conversations.find(isSupportConversation) || null;
  const showThreadPane = activeKind === "support" || activeKind === "updates" || Boolean(activePeer);
  const activeKey = activeKind === "updates" ? UPDATES_KEY : activeKind === "support" ? SUPPORT_KEY : activeConvId;
  const compact = isDesktop && listWidth < LIST_COMPACT_BELOW;

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
                  {compact ? (
                    <div className="flex h-14 flex-shrink-0 items-center justify-center border-b border-line/[0.08]">
                      <button
                        type="button"
                        onClick={() => setNewChatOpen(true)}
                        className="btn btn-ghost btn-icon"
                        title={t("chat.newChat.title")}
                        aria-label={t("chat.newChat.title")}
                      >
                        <Icon name="newChat" size={19} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-14 flex-shrink-0 items-center gap-2 px-4">
                      <h1 className="flex-1 text-base font-semibold">{t("nav.messages")}</h1>
                      <button
                        type="button"
                        onClick={() => setNewChatOpen(true)}
                        className="btn btn-ghost btn-icon -mr-1.5"
                        title={t("chat.newChat.title")}
                        aria-label={t("chat.newChat.title")}
                      >
                        <Icon name="newChat" size={19} />
                      </button>
                    </div>
                  )}
                  <ConversationList
                    conversations={directConversations}
                    loading={convLoading}
                    activeKey={activeKey}
                    onSelect={handleSelect}
                    systemAvailable={systemAvailable}
                    updates={updatesSummary}
                    support={supportRow}
                    onOpenUpdates={openUpdates}
                    onOpenSupport={() => openSupport(conversations)}
                    onStartWith={handleStartWith}
                    compact={compact}
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
                  {activeKind === "updates" ? (
                    <UpdatesChannel
                      muted={Boolean(updatesSummary?.muted)}
                      onToggleMute={handleToggleUpdatesMute}
                      onRead={handleUpdatesRead}
                      onBack={() => setMobileView("list")}
                    />
                  ) : showThreadPane ? (
                    <MessageThread
                      mode={activeKind === "support" ? "support" : "direct"}
                      peer={activePeer}
                      peerLastSeenAt={activeRow?.other_last_seen_at ?? activePeer?.last_seen_at ?? null}
                      peerIsBuilder={
                        typeof activeRow?.other_is_builder === "boolean" ? activeRow.other_is_builder : null
                      }
                      messages={messages}
                      meId={meId}
                      loading={messagesLoading && messages.length === 0}
                      sending={sending}
                      isDraft={isDraft}
                      conversationMeta={activeRow}
                      reported={threadReported}
                      muted={activeMuted}
                      supportStatus={activeRow?.support_status ?? null}
                      supportTopic={supportTopic}
                      onPickSupportTopic={setSupportTopic}
                      initialDraft={prefill && prefill.peerId === activePeer?.id ? prefill.text : ""}
                      onSend={handleSend}
                      onSendImage={handleSendImage}
                      onReport={handleReport}
                      onToggleMute={handleToggleMute}
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
                      <button type="button" onClick={() => setNewChatOpen(true)} className="btn btn-secondary btn-sm mt-4">
                        <Icon name="newChat" size={15} />
                        {t("chat.newChat.title")}
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      <NewChatDialog open={newChatOpen} onClose={closeNewChat} onPick={handleStartWith} />
      <Toast message={notice} />
    </div>
  );
}
