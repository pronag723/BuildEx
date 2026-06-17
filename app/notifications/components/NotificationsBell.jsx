"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useNotifications } from "../../../lib/notifications/NotificationsContext";
import { withBase } from "../../home/utils";

// Compact "now / 2m / 4h / Mon / Apr 3" stamp — same shape as the chat inbox.
function relativeStamp(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  const diff = Date.now() - then.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return then.toLocaleDateString("en-US", { weekday: "short" });
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function IconBell({ className = "w-5 h-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// Navbar bell + dropdown. Renders only for authenticated users; placed beside
// the avatar in AuthNavControls. Anchors a portaled dropdown to the button,
// reusing the exact positioning/dismiss logic of the profile menu so the two
// behave identically.
export default function NotificationsBell() {
  const { status } = useAuth();
  const { notifications, unreadCount, hasUnread, markRead, clearAll } =
    useNotifications();
  // The dropdown only lists unread notifications: once a notification is read
  // (via a click here, or by navigating to its linked page) it drops out of the
  // list. The badge/aria still use the context's full counts.
  const visible = notifications.filter((n) => !n.read_at);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const reposition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Effective menu width: w-80 (320) capped by max-w-[calc(100vw-1rem)].
    // Below ~336px viewport the cap dominates and the menu fills the viewport
    // minus an 8px margin on each side; above it the menu stays a fixed 320px.
    const vw = window.innerWidth;
    const menuWidth = Math.min(320, vw - 16);
    // Right-align under the button by default, but clamp so the menu's LEFT
    // edge can never push past 8px from the viewport edge. Without this, at
    // ~472px wide the 320px menu would overflow the left side of the screen
    // because the bell sits a long way in from the right edge.
    const desiredRight = vw - rect.right;
    const maxRight = vw - menuWidth - 8;
    setCoords({
      top: rect.bottom + 12,
      right: Math.min(maxRight, Math.max(8, desiredRight)),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    reposition();
    function onClick(e) {
      if (
        !buttonRef.current?.contains(e.target) &&
        !menuRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  // Only meaningful for signed-in users.
  if (status !== "authenticated") return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full border border-white/15 hover:border-[#4ade80]/40 bg-white/5 hover:bg-white/10 transition-all text-gray-200"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          hasUnread
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
      >
        <IconBell />
        {hasUnread && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-[#171717]"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-hidden={!open}
            style={
              coords
                ? { top: coords.top, right: coords.right }
                : { top: -9999, right: 0 }
            }
            className={`profile-menu fixed w-80 max-w-[calc(100vw-1rem)] glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-[120] ${
              open ? "open" : ""
            }`}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Notifications</span>
              {visible.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearAll()}
                  tabIndex={open ? 0 : -1}
                  className="text-xs text-[#4ade80] hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto hide-scrollbar">
              {visible.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  You're all caught up.
                </div>
              ) : (
                <ul className="py-1 text-sm">
                  {visible.map((n) => {
                    const unread = !n.read_at;
                    const body = (
                      <>
                        <span className="flex-shrink-0 mt-1.5">
                          <span
                            className={`block w-2 h-2 rounded-full ${
                              unread ? "bg-[#4ade80]" : "bg-transparent"
                            }`}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-medium truncate">
                              {n.title}
                            </span>
                            <span className="text-[10px] text-gray-500 flex-shrink-0">
                              {relativeStamp(n.created_at)}
                            </span>
                          </span>
                          {n.body && (
                            <span className="block text-xs text-gray-400 mt-0.5 line-clamp-2">
                              {n.body}
                            </span>
                          )}
                        </span>
                      </>
                    );

                    const rowClass = `flex items-start gap-2.5 px-4 py-3 transition-colors ${
                      unread ? "bg-[#4ade80]/5" : ""
                    } hover:bg-white/5`;

                    return (
                      <li key={n.id}>
                        {n.link ? (
                          // A real anchor (not next/link): a full navigation to
                          // withBase(link) reliably deep-links to the target —
                          // including when the user is ALREADY on /orders, where a
                          // soft same-route navigation wouldn't re-open the order.
                          <a
                            href={withBase(n.link)}
                            role="menuitem"
                            tabIndex={open ? 0 : -1}
                            onClick={() => {
                              if (unread) markRead(n.id);
                              setOpen(false);
                            }}
                            className={rowClass}
                          >
                            {body}
                          </a>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            tabIndex={open ? 0 : -1}
                            onClick={() => unread && markRead(n.id)}
                            className={`w-full text-left ${rowClass}`}
                          >
                            {body}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
