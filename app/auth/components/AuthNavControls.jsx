"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useUnread } from "../../../lib/chat/UnreadContext";
import NotificationsBell from "../../notifications/components/NotificationsBell";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { useT } from "../../../lib/i18n/LanguageProvider";

const MENU_ROW =
  "flex items-center gap-3 px-3 h-9 mx-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-line/[0.06] transition-colors";

export default function AuthNavControls() {
  const { status, displayUser, profile, signOut } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const { hasUnread, unreadTotal } = useUnread();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Anchor the portaled menu to the button: right-aligned, 8px below it.
  // Recomputed on open, scroll and resize.
  const reposition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
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

  if (status === "loading") {
    return <div className="hidden sm:block w-16 h-8 rounded-lg skeleton" />;
  }

  if (status === "authenticated" && displayUser) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <NotificationsBell />
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg p-1 sm:pr-2 hover:bg-line/[0.06] transition-colors"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={displayUser.displayName}
          >
            <span className="relative">
              <Avatar src={displayUser.avatarUrl} name={displayUser.displayName} size={28} />
              {hasUnread && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-canvas"
                  title={t("nav.unreadTitle")}
                  aria-label={t("nav.unreadTitle")}
                />
              )}
            </span>
            <span className="hidden sm:block max-w-[120px] truncate text-sm font-medium">
              {displayUser.displayName}
            </span>
            <Icon
              name="chevronDown"
              size={14}
              className={`hidden sm:block text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {typeof document !== "undefined" &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                aria-hidden={!open}
                style={coords ? { top: coords.top, right: coords.right } : { top: -9999, right: 0 }}
                className={`profile-menu menu-panel fixed w-64 overflow-hidden z-[120] ${open ? "open" : ""}`}
              >
                <div className="px-4 py-3 border-b border-line/[0.08] flex items-center gap-3">
                  <Avatar src={displayUser.avatarUrl} name={displayUser.displayName} size={36} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{displayUser.displayName}</div>
                    <div className="text-xs text-ink-3 truncate">
                      {displayUser.email || (displayUser.username && `@${displayUser.username}`)}
                    </div>
                  </div>
                </div>
                <nav className="py-1.5 text-sm">
                  <Link
                    role="menuitem"
                    href="/account"
                    tabIndex={open ? 0 : -1}
                    onClick={() => setOpen(false)}
                    className={MENU_ROW}
                  >
                    <Icon name="user" size={16} />
                    <span>{t("nav.myProfile")}</span>
                  </Link>
                  <Link
                    role="menuitem"
                    href="/chats"
                    tabIndex={open ? 0 : -1}
                    onClick={() => setOpen(false)}
                    className={MENU_ROW}
                  >
                    <Icon name="chat" size={16} />
                    <span>{t("nav.myChats")}</span>
                    {hasUnread && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                        {unreadTotal > 9 ? "9+" : unreadTotal}
                      </span>
                    )}
                  </Link>
                  {isAdmin && (
                    <Link
                      role="menuitem"
                      href="/admin"
                      tabIndex={open ? 0 : -1}
                      onClick={() => setOpen(false)}
                      className={MENU_ROW}
                    >
                      <Icon name="shield" size={16} />
                      <span>{t("nav.moderatorConsole")}</span>
                    </Link>
                  )}
                  <div className="my-1.5 border-t border-line/[0.08]" />
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={open ? 0 : -1}
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                    className={`${MENU_ROW} w-[calc(100%-0.75rem)] text-left`}
                  >
                    <Icon name="logout" size={16} />
                    {t("nav.logOut")}
                  </button>
                </nav>
              </div>,
              document.body
            )}
        </div>
      </div>
    );
  }

  // unauthenticated / unconfigured
  return (
    <Link href="/login" className="btn btn-primary btn-sm">
      {t("nav.logIn")}
    </Link>
  );
}

export function AuthMobileControls({ onAfter }) {
  const { status, displayUser, profile, signOut } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const pathname = usePathname();
  const onAccount = pathname === "/account";
  const t = useT();

  if (status === "loading") {
    return <div className="w-full h-11 rounded-lg skeleton" />;
  }

  if (status === "authenticated" && displayUser) {
    return (
      <>
        <div className="flex items-center gap-3 py-2">
          <Avatar src={displayUser.avatarUrl} name={displayUser.displayName} size={40} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{displayUser.displayName}</div>
            <div className="text-xs text-ink-3 truncate">
              {displayUser.email || (displayUser.username && `@${displayUser.username}`)}
            </div>
          </div>
        </div>
        <Link
          href="/account"
          onClick={() => onAfter?.()}
          aria-current={onAccount ? "page" : undefined}
          className="btn btn-secondary btn-lg w-full justify-start"
        >
          <Icon name="user" size={17} />
          {t("nav.myProfile")}
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            onClick={() => onAfter?.()}
            className="btn btn-secondary btn-lg w-full justify-start"
          >
            <Icon name="shield" size={17} />
            {t("nav.moderatorConsole")}
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            onAfter?.();
            signOut();
          }}
          className="btn btn-ghost btn-lg w-full justify-start"
        >
          <Icon name="logout" size={17} />
          {t("nav.logOut")}
        </button>
      </>
    );
  }

  // Signed out: the header already shows "Log in" at every width.
  return null;
}
