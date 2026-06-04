"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import {
  clearNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "./api";

// Holds the signed-in user's recent notifications + unread count so the navbar
// bell can render a badge and dropdown from anywhere in the app. Mirrors
// lib/chat/UnreadContext.jsx (initial fetch + Realtime live updates + refresh
// on tab focus).
const NotificationsContext = createContext({
  notifications: [],
  unreadCount: 0,
  hasUnread: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  clearAll: async () => {},
});

export function NotificationsProvider({ children }) {
  const { status, user } = useAuth();
  const meId = user?.id || null;
  const [notifications, setNotifications] = useState([]);

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !meId) {
      setNotifications([]);
      return;
    }
    const { notifications: rows } = await listNotifications();
    setNotifications(rows || []);
  }, [status, meId]);

  // Initial load + whenever auth state flips.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any incoming notification for me prepends live.
  useEffect(() => {
    if (status !== "authenticated" || !meId) return undefined;
    const unsub = subscribeToNotifications((row) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === row.id)) return prev;
        return [row, ...prev];
      });
    });
    return unsub;
  }, [status, meId]);

  // Re-check when the tab regains focus — covers reads/inserts that happened in
  // another tab or device where no Realtime event reached this client.
  useEffect(() => {
    function onFocus() {
      refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Optimistic mark-read so the badge drops immediately; the DB write follows.
  const markRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id && !n.read_at
          ? { ...n, read_at: new Date().toISOString() }
          : n
      )
    );
    await markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
    );
    await markAllNotificationsRead();
  }, []);

  // Optimistically empty the list, then delete the rows. On failure we refresh
  // so the UI re-syncs with whatever actually remains in the DB.
  const clearAll = useCallback(async () => {
    setNotifications([]);
    const { error } = await clearNotifications();
    if (error) refresh();
  }, [refresh]);

  const unreadCount = notifications.reduce(
    (sum, n) => sum + (n.read_at ? 0 : 1),
    0
  );

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        hasUnread: unreadCount > 0,
        refresh,
        markRead,
        markAllRead,
        clearAll,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
