"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../../lib/auth/AuthContext";
import { withBase } from "../../home/utils";

function Avatar({ user, size = 36 }) {
  const initial = (user?.displayName || user?.username || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="rounded-2xl overflow-hidden bg-[#4ade80]/15 border border-[#4ade80]/40 flex items-center justify-center text-[#4ade80] font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {user?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

export default function AuthNavControls() {
  const { status, displayUser, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Anchor the portaled menu to the button. Right-aligned, 12px below it
  // (matches the old mt-3). Recomputed on open, scroll and resize.
  const reposition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: rect.bottom + 12,
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
    return (
      <div className="hidden sm:flex items-center gap-3">
        <div className="w-20 h-9 rounded-full bg-white/5 animate-pulse" />
        <div className="w-28 h-9 rounded-full bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (status === "authenticated" && displayUser) {
    return (
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 sm:gap-3 pl-1 pr-1 sm:pr-3 py-1 rounded-full border border-white/15 hover:border-[#4ade80]/40 bg-white/5 hover:bg-white/10 transition-all"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Avatar user={displayUser} />
          <span className="hidden sm:flex flex-col items-start leading-tight pr-1">
            <span className="text-sm font-semibold max-w-[140px] truncate">
              {displayUser.displayName}
            </span>
            {displayUser.username && (
              <span className="text-[10px] text-gray-400 max-w-[140px] truncate">
                @{displayUser.username}
              </span>
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`hidden sm:block w-3.5 h-3.5 text-gray-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {typeof document !== "undefined" && createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-hidden={!open}
            style={coords ? { top: coords.top, right: coords.right } : { top: -9999, right: 0 }}
            className={`profile-menu fixed w-64 glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-[120] ${
              open ? "open" : ""
            }`}
          >
            <div className="px-4 py-4 border-b border-white/10 flex items-center gap-3">
              <Avatar user={displayUser} size={40} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{displayUser.displayName}</div>
                <div className="text-xs text-gray-400 truncate">
                  {displayUser.email || (displayUser.username && `@${displayUser.username}`)}
                </div>
              </div>
            </div>
            <nav className="py-2 text-sm">
              <Link
                role="menuitem"
                href="/account"
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                My profile
              </Link>
              <Link
                role="menuitem"
                href="/chats"
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                Chats
              </Link>
              <button
                type="button"
                role="menuitem"
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/10 text-red-300 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Log out
              </button>
            </nav>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // unauthenticated / unconfigured
  return (
    <>
      <Link
        href="/login"
        className="nav-btn-ghost nav-btn-text font-medium rounded-full border border-white/20 hover:border-white/40 transition-all ghost-btn whitespace-nowrap hidden sm:inline-block"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="nav-btn-primary nav-btn-text font-semibold rounded-full bg-[#4ade80] text-black transition-all green-glow whitespace-nowrap hidden sm:inline-block"
      >
        Join as Builder
      </Link>
    </>
  );
}

export function AuthMobileControls({ onAfter }) {
  const { status, displayUser, signOut } = useAuth();
  const pathname = usePathname();
  const onAccount = pathname === "/account";
  const onChats = pathname === "/chats";

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <div className="w-full h-12 rounded-2xl bg-white/5 animate-pulse" />
        <div className="w-full h-12 rounded-2xl bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (status === "authenticated" && displayUser) {
    return (
      <>
        <div className="flex items-center gap-3 px-2 py-3">
          <Avatar user={displayUser} size={44} />
          <div className="min-w-0">
            <div className="text-base font-semibold truncate">{displayUser.displayName}</div>
            <div className="text-xs text-gray-400 truncate">
              {displayUser.email || (displayUser.username && `@${displayUser.username}`)}
            </div>
          </div>
        </div>
        <Link
          href="/account"
          onClick={() => onAfter?.()}
          aria-current={onAccount ? "page" : undefined}
          className={`w-full py-3.5 text-center text-base font-medium rounded-2xl border transition-all ${
            onAccount
              ? "border-[#4ade80]/50 text-[#4ade80] bg-[#4ade80]/10"
              : "border-white/20 hover:border-white/40 ghost-btn"
          }`}
        >
          My profile
        </Link>
        <Link
          href="/chats"
          onClick={() => onAfter?.()}
          aria-current={onChats ? "page" : undefined}
          className={`w-full py-3.5 text-center text-base font-medium rounded-2xl border transition-all ${
            onChats
              ? "border-[#4ade80]/50 text-[#4ade80] bg-[#4ade80]/10"
              : "border-white/20 hover:border-white/40 ghost-btn"
          }`}
        >
          Chats
        </Link>
        <button
          type="button"
          onClick={() => {
            onAfter?.();
            signOut();
          }}
          className="w-full py-3.5 text-base font-semibold rounded-2xl bg-red-500/15 text-red-200 border border-red-400/30 hover:bg-red-500/25 transition-all"
        >
          Log out
        </button>
      </>
    );
  }

  return (
    <>
      <Link
        href="/login"
        onClick={() => onAfter?.()}
        className="w-full py-3.5 text-center text-base font-medium rounded-2xl border border-white/20 hover:border-white/40 transition-all ghost-btn"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        onClick={() => onAfter?.()}
        className="w-full py-3.5 text-center text-base font-semibold rounded-2xl bg-[#4ade80] text-black transition-all green-glow"
      >
        Join as Builder
      </Link>
    </>
  );
}
