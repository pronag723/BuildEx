"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import { useAuth } from "../../../lib/auth/AuthContext";
import { withBase } from "../../home/utils";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import {
  fetchMessages,
  getOrCreateConversation,
  listConversations,
  markConversationRead,
  resolveProfileByUsername,
  sendMessage,
  subscribeToConversation,
  subscribeToInbox,
} from "../../../lib/chat/api";
import ConversationList from "./ConversationList";
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

export default function ChatsPage() {
  const { status, user, displayUser } = useAuth();
  useRequireAuth(); // bounces to /login (preserving ?to/?c) when unauthenticated

  const meId = user?.id || null;

  // ── Theme (mirrors the other catalog pages) ────────────────────────────────
  const [theme, setTheme] = useState(null);
  const isLight = theme === "light";
  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.classList.toggle("light", isLight);
    root.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);

  const [activeConvId, setActiveConvId] = useState(null);
  const [activePeer, setActivePeer] = useState(null);
  const [isDraft, setIsDraft] = useState(false);

  // Mirror activeConvId into a ref so the long-lived inbox subscription (which
  // only re-binds on auth change) can read the current thread without stale
  // closures.
  const activeConvIdRef = useRef(null);
  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

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
    (convId, peer) => {
      setIsDraft(false);
      setActivePeer(peer);
      setActiveConvId(convId);
      setMobileView("thread");
      replaceUrl(convId);
    },
    [replaceUrl]
  );

  const openDraft = useCallback((peer) => {
    setIsDraft(true);
    setActivePeer(peer);
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
          showNotice("We couldn't find that builder.");
          return;
        }
        if (peer.id === meId) {
          showNotice("That's your own profile — pick another builder to message.");
          return;
        }
        const existing = rows.find((x) => x.other_id === peer.id);
        if (existing) openConversation(existing.conversation_id, peerFromConversation(existing));
        else openDraft(peer);
      } else if (c) {
        const conv = rows.find((x) => x.conversation_id === c);
        if (conv) openConversation(conv.conversation_id, peerFromConversation(conv));
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
    });

    const unsub = subscribeToConversation(activeConvId, (row) => {
      setMessages((prev) =>
        prev.some((m) => m.id === row.id) ? prev : [...prev, row]
      );
      if (row.sender_id !== meId) markConversationRead(activeConvId);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [activeConvId, meId]);

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
  const handleSend = useCallback(
    async (body) => {
      if (!activePeer || !meId || sending) return;
      setSending(true);
      try {
        let convId = activeConvId;
        if (!convId) {
          const { conversationId, error } = await getOrCreateConversation(activePeer.id);
          if (error || !conversationId) {
            showNotice("Couldn't start this conversation. Please try again.");
            return;
          }
          convId = conversationId;
          setActiveConvId(convId);
          setIsDraft(false);
          replaceUrl(convId);
        }

        const { message, error } = await sendMessage(convId, meId, body);
        if (error || !message) {
          showNotice("Your message didn't send. Please try again.");
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

  const handleSelect = useCallback(
    (conv) => openConversation(conv.conversation_id, peerFromConversation(conv)),
    [openConversation]
  );

  const showThreadPane = Boolean(activePeer);

  // ── Auth gating: keep the chrome, show a spinner until we know who's here ───
  const authReady = status === "authenticated" && meId;

  return (
    <div className={`catalog-root min-h-screen ${isLight ? "light" : ""}`}>
      <div className="gradient-background" aria-hidden="true" />
      <div className="gradient-edge-glow" aria-hidden="true" />

      <CatalogNavbar
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showNotice}
      />
      <CatalogMobileMenu
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showNotice}
      />

      <main className="relative z-10 pt-24 lg:pt-28 px-3 sm:px-5 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="glass rounded-3xl overflow-hidden flex h-[calc(100dvh-7.5rem)] min-h-[480px]">
            {!authReady ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
              </div>
            ) : (
              <>
                {/* ── Conversation list pane ───────────────────────────────── */}
                <aside
                  className={`${
                    showThreadPane && mobileView === "thread" ? "hidden" : "flex"
                  } lg:flex w-full lg:w-80 xl:w-96 flex-shrink-0 flex-col border-r border-white/10 min-h-0`}
                >
                  <div className="px-5 py-4 border-b border-white/10 flex-shrink-0">
                    <h1 className="text-lg font-extrabold">Messages</h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Your conversations with builders & clients
                    </p>
                  </div>
                  <ConversationList
                    conversations={conversations}
                    loading={convLoading}
                    activeId={activeConvId}
                    onSelect={handleSelect}
                  />
                </aside>

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
                      onSend={handleSend}
                      onBack={() => {
                        setMobileView("list");
                      }}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                      <div className="w-16 h-16 rounded-2xl bg-[#4ade80]/10 border border-[#4ade80]/30 flex items-center justify-center text-3xl mb-5">
                        💬
                      </div>
                      <h2 className="font-bold text-lg mb-2">Select a conversation</h2>
                      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                        Pick a thread on the left, or open a builder&apos;s profile and tap{" "}
                        <span className="text-[#4ade80] font-medium">Contact Builder</span> to
                        start a new one.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Toast */}
      <div
        role="status"
        aria-live="polite"
        className={`catalog-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] glass rounded-2xl px-5 py-3 text-sm font-medium shadow-xl transition-all duration-300 max-w-sm text-center ${
          notice
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {notice}
      </div>
    </div>
  );
}
