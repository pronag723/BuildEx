"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
});

export function UnreadProvider({ children }) {
  const { status, user } = useAuth();
  const meId = user?.id || null;
  const [unreadTotal, setUnreadTotal] = useState(0);

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !meId) {
      setUnreadTotal(0);
      return;
    }
    const { conversations } = await listConversations();
    const total = (conversations || []).reduce(
      (sum, c) => sum + (Number(c.unread_count) || 0),
      0
    );
    setUnreadTotal(total);
  }, [status, meId]);

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

  return (
    <UnreadContext.Provider
      value={{ unreadTotal, hasUnread: unreadTotal > 0, refresh }}
    >
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
