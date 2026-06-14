"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { listConversations, subscribeToInbox } from "./api";

// Tracks the signed-in user's total unread message count across every thread, so
// the navbar avatar and the "Chats" menu entry can surface a badge from anywhere
// in the app (not just while the /chats page is mounted).
const UnreadContext = createContext({
  unreadTotal: 0,
  hasUnread: false,
  refresh: async () => {},
  setActiveConversation: () => {},
});

export function UnreadProvider({ children }) {
  const { status, user } = useAuth();
  const meId = user?.id || null;
  const [conversations, setConversations] = useState([]);
  // The thread the user currently has OPEN (set by ChatsPage). Messages landing
  // in this thread are being read live, so they must NOT count toward the badge
  // — otherwise a message arriving while you're already viewing it lights the
  // avatar dot, and the inbox/mark-read race can leave it stuck on.
  const [activeConvId, setActiveConvId] = useState(null);

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !meId) {
      setConversations([]);
      return;
    }
    const { conversations: rows } = await listConversations();
    setConversations(rows || []);
  }, [status, meId]);

  const setActiveConversation = useCallback((convId) => {
    setActiveConvId(convId || null);
  }, []);

  // Total unread, excluding the open thread (read live, never badged).
  const unreadTotal = useMemo(
    () =>
      (conversations || []).reduce(
        (sum, c) =>
          c.conversation_id === activeConvId
            ? sum
            : sum + (Number(c.unread_count) || 0),
        0
      ),
    [conversations, activeConvId]
  );

  // Initial load + whenever auth state flips.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any incoming message in one of my threads bumps the count live.
  useEffect(() => {
    if (status !== "authenticated" || !meId) return undefined;
    const unsub = subscribeToInbox(() => refresh());
    return unsub;
  }, [status, meId, refresh]);

  // Re-check when the tab regains focus — covers reads that happened in another
  // tab/device, where no realtime INSERT fires for this client.
  useEffect(() => {
    function onFocus() {
      refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const value = useMemo(
    () => ({
      unreadTotal,
      hasUnread: unreadTotal > 0,
      refresh,
      setActiveConversation,
    }),
    [unreadTotal, refresh, setActiveConversation]
  );

  return (
    <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
