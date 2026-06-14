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
  markReadByLink: async () => {},
  clearAll: async () => {},
});

// The current page as a base-path-relative "/path?query" string, so it can be
// compared against a notification's stored `link` (e.g. "/orders/?id=…").
function currentRelativeUrl() {
  if (typeof window === "undefined") return "";
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  let path = window.location.pathname || "";
  if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
  return path + (window.location.search || "");
}

// Loose match between a notification link and a URL: ignore a trailing slash on
// the path segment so "/orders/?id=x" and "/orders?id=x" compare equal.
function linksMatch(a, b) {
  if (!a || !b) return false;
  const norm = (s) => s.replace(/\/(\?)/, "$1").replace(/\/$/, "");
  return norm(a) === norm(b);
}

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

  // Any incoming notification for me prepends live. If it points at the page
  // the user is ALREADY viewing, mark it read immediately so the bell badge
  // doesn't light (and stick) for something they're actively looking at.
  useEffect(() => {
    if (status !== "authenticated" || !meId) return undefined;
    const unsub = subscribeToNotifications((row) => {
      const onItsPage = linksMatch(row.link, currentRelativeUrl());
      setNotifications((prev) => {
        if (prev.some((n) => n.id === row.id)) return prev;
        const incoming = onItsPage
          ? { ...row, read_at: row.read_at || new Date().toISOString() }
          : row;
        return [incoming, ...prev];
      });
      if (onItsPage && !row.read_at) markNotificationRead(row.id);
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

  // Mark read every unread notification whose link matches `link`. Used by pages
  // (e.g. the order detail view) to clear notifications for the page the user is
  // now on — covers arriving via in-app navigation, not just the bell click.
  const markReadByLink = useCallback(async (link) => {
    if (!link) return;
    let ids = [];
    setNotifications((prev) => {
      ids = prev.filter((n) => !n.read_at && linksMatch(n.link, link)).map((n) => n.id);
      if (ids.length === 0) return prev;
      const now = new Date().toISOString();
      return prev.map((n) =>
        ids.includes(n.id) ? { ...n, read_at: n.read_at || now } : n
      );
    });
    await Promise.all(ids.map((id) => markNotificationRead(id)));
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
        markReadByLink,
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
