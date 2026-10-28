"use client";

// Small pieces every section of the moderator console uses. They lived at the
// top of AdminPage.jsx until the Traffic and Chats sections moved into files
// of their own.

import { useEffect, useState } from "react";
import { Icon } from "../../../lib/icons";
import { publicAsset } from "../../home/utils";
import SharedAvatar from "../../../lib/ui/Avatar";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { getLang } from "../../../lib/i18n/translate.mjs";
import { formatDate as formatLocaleDate, formatDateTime as formatLocaleDateTime } from "../../../lib/i18n/format.mjs";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { isOnline } from "../../../lib/presence/api";

// Dates follow the interface language. Every component that prints one also
// calls useT(), so a language switch re-renders it with the new locale.
export function formatDate(iso) {
  if (!iso) return "—";
  return formatLocaleDate(iso, getLang(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return formatLocaleDateTime(iso, getLang(), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function profileHref(username) {
  return `/builders/profile?u=${encodeURIComponent(username || "")}`;
}

// The RPC's own message (mapped to the current language where known), or the
// dictionary fallback.
export function errText(error, fallbackKey) {
  return serverMessage(error, fallbackKey);
}

export function Spinner({ small = false }) {
  return (
    <div className={`flex items-center justify-center ${small ? "py-6" : "py-24"}`}>
      <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
    </div>
  );
}

// Debounced search box. The debounce lives in useDebounced so every section
// gets the same 250ms feel without repeating the timer.
export function SearchBox({ value, onChange, placeholder, label }) {
  const t = useT();
  return (
    <label className="input flex h-11 items-center gap-2 focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.15)]">
      <Icon name="search" size={16} className="text-ink-3" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none text-sm placeholder:text-ink-3"
        aria-label={label}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-ink-3 hover:text-ink"
        >
          {t("admin.clear")}
        </button>
      )}
    </label>
  );
}

export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function Avatar({ url, name, size = 40 }) {
  return <SharedAvatar src={url ? publicAsset(url) : null} name={name} size={size} />;
}

export function EmptyState({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-line/15 p-8 text-center text-sm text-ink-3">
      {children}
    </div>
  );
}

export function ErrorLine({ children }) {
  if (!children) return null;
  return <p className="text-sm text-danger">{children}</p>;
}

// When someone was last on the site: profiles.last_seen_at, which the presence
// heartbeat (lib/presence) stamps every minute while a signed-in tab is open.
// Inside the presence window it reads "online", like the dot on profiles. Null
// means the account has not been on since presence shipped.
export function LastSeen({ iso, className = "" }) {
  const t = useT();
  if (isOnline(iso)) {
    return (
      <span className={`inline-flex items-center gap-1 text-accent-ink ${className}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        {t("admin.users.online")}
      </span>
    );
  }
  if (!iso) return <span className={className}>{t("admin.users.neverSeen")}</span>;
  return (
    <span className={className} title={formatDateTime(iso)}>
      {t("admin.users.seen", { when: relativeAgo(iso, t.lang) })}
    </span>
  );
}

// The pill row the report and review queues switch lists with.
export function PillTabs({ items, value, onChange, label }) {
  return items.map((item) => (
    <button
      key={item.key}
      type="button"
      onClick={() => onChange(item.key)}
      aria-pressed={value === item.key}
      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        value === item.key
          ? "border-accent bg-accent/15 text-accent-ink"
          : "border-line/10 text-ink-2 hover:border-accent/40 hover:bg-line/5"
      }`}
    >
      {label(item.key)}
    </button>
  ));
}

export function RefreshButton({ onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-full border border-line/10 text-ink-2 hover:text-accent-ink hover:border-accent/40 transition-all"
    >
      <Icon name="refresh" size={14} />
    </button>
  );
}
