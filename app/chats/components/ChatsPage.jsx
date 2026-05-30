"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useUnread } from "../../../lib/chat/UnreadContext";
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

// Conversation-list width bounds (desktop only). Telegram-style drag divider.
const LIST_MIN = 260;
const LIST_MAX = 520;
const LIST_DEFAULT = 340;
const LIST_WIDTH_KEY = "buildex-chats-list-width";

export default function ChatsPage() {
  const { status, user, displayUser } = useAuth();
  const { refresh: refreshUnread } = useUnread();
  useRequireAuth(); // bounces to /login (preserving ?to/?c) when unauthenticated

  const meId = user?.id || null;

  // ── Animated gradient background refs (mirrors the catalog pages) ───────────
  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);

  // ── Resizable conversation-list pane (desktop) ──────────────────────────────
  const containerRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [listWidth, setListWidth] = useState(LIST_DEFAULT);
  const listWidthRef = useRef(LIST_DEFAULT);
  const draggingRef = useRef(false);
  useEffect(() => {
    listWidthRef.current = listWidth;
  }, [listWidth]);

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

  // ── Animated gradient background (identical to the catalog pages) ───────────
  useEffect(() => {
    const gradientBg = gradientRef.current;
    const edgeGlow = edgeGlowRef.current;
    if (!gradientBg || !edgeGlow) return undefined;

    const cfg = {
      edgeOffset: 12,
      speed: 1,
      smoothing: 0.08,
      idleDrift: 0.00003,
      swayAmp: 0.015,
      swaySpeed: 0.0004,
    };

    let cp1 = 0, cp2 = 0.5, tp1 = 0, tp2 = 0.5;
    let lastScroll = window.pageYOffset;
    let raf = 0;

    function periToXY(progress, offset) {
      const p = ((progress % 1) + 1) % 1;
      const seg = p * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0: return { x: offset + sp * (100 - offset * 2), y: offset };
        case 1: return { x: 100 - offset, y: offset + sp * (100 - offset * 2) };
        case 2: return { x: 100 - offset - sp * (100 - offset * 2), y: 100 - offset };
        default: return { x: offset, y: 100 - offset - sp * (100 - offset * 2) };
      }
    }

    function tick(ts) {
      const sy = window.pageYOffset;
      const delta = sy - lastScroll;
      if (Math.abs(delta) > 0) {
        tp1 += delta * 0.0008 * cfg.speed;
        tp2 -= delta * 0.0006 * cfg.speed;
      }
      tp1 += cfg.idleDrift;
      tp2 -= cfg.idleDrift * 0.7;
      lastScroll = sy;
      tp1 = ((tp1 % 1) + 1) % 1;
      tp2 = ((tp2 % 1) + 1) % 1;

      let d1 = tp1 - cp1; if (d1 > 0.5) d1 -= 1; if (d1 < -0.5) d1 += 1;
      let d2 = tp2 - cp2; if (d2 > 0.5) d2 -= 1; if (d2 < -0.5) d2 += 1;
      cp1 += d1 * cfg.smoothing;
      cp2 += d2 * cfg.smoothing;

      const sw1 = Math.sin(ts * cfg.swaySpeed) * cfg.swayAmp;
      const sw2 = Math.cos(ts * cfg.swaySpeed * 1.3) * cfg.swayAmp * 0.8;
      const p1 = periToXY(cp1 + sw1, cfg.edgeOffset);
      const p2 = periToXY(cp2 + sw2, cfg.edgeOffset + 3);

      gradientBg.style.setProperty("--gradient-x", `${p1.x}%`);
      gradientBg.style.setProperty("--gradient-y", `${p1.y}%`);
      gradientBg.style.setProperty("--gradient-x2", `${p2.x}%`);
      gradientBg.style.setProperty("--gradient-y2", `${p2.y}%`);

      const breathe = 1 + Math.sin(ts * 0.0003) * 0.12;
      edgeGlow.style.opacity = `${0.45 + breathe * 0.2}`;
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

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
          <div
            ref={containerRef}
            className="glass rounded-3xl overflow-hidden flex h-[calc(100dvh-7.5rem)] min-h-[480px]"
          >
            {!authReady ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
              </div>
            ) : (
              <>
                {/* ── Conversation list pane ───────────────────────────────── */}
                <aside
                  style={isDesktop ? { width: `${listWidth}px` } : undefined}
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

                {/* ── Drag divider (Telegram-style, desktop only) ──────────── */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize conversation list"
                  onMouseDown={startResize}
                  onTouchStart={startResize}
                  className="hidden lg:flex flex-shrink-0 w-1.5 -ml-px cursor-col-resize items-center justify-center group hover:bg-[#4ade80]/10 active:bg-[#4ade80]/20 transition-colors"
                >
                  <span className="w-0.5 h-10 rounded-full bg-white/15 group-hover:bg-[#4ade80]/70 transition-colors" />
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
