"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { useScrollLock } from "../../../lib/useScrollLock";
import { getConversationQuota, searchPeople } from "../../../lib/chat/api";
import { PersonRow } from "./ConversationList";

// "New chat": find a person by @handle or name and open (or start) the thread.
// Who the search can find is decided by search_people (0112) — builders by part
// of a handle, everyone else only by their exact @handle.
//
// The daily allowance for new threads (0100) is only mentioned when it is
// nearly used up; before that it is noise.
const QUOTA_WARN_REMAINING = 5;

export default function NewChatDialog({ open, onClose, onPick }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const [quota, setQuota] = useState(null);
  const inputRef = useRef(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setPeople([]);
    getConversationQuota().then(setQuota);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    const q = query.trim().replace(/^@/, "");
    if (!open || q.length < 2) {
      setPeople([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const { people: rows } = await searchPeople(q);
      if (cancelled) return;
      setPeople(rows || []);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const q = query.trim().replace(/^@/, "");
  const dayLeft = quota ? Math.max(0, quota.day_limit - quota.day_used) : null;
  const hourLeft = quota ? Math.max(0, quota.hour_limit - quota.hour_used) : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 sm:items-start sm:p-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("chat.newChat.title")}
      onClick={onClose}
    >
      <div
        className="menu-panel flex max-h-[85dvh] w-full flex-col rounded-b-none rounded-t-[16px] sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h2 className="flex-1 text-base font-semibold">{t("chat.newChat.title")}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon" aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="px-4">
          <label className="input flex items-center gap-2 focus-within:border-accent/60">
            <Icon name="search" size={16} className="flex-shrink-0 text-ink-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("chat.newChat.placeholder")}
              aria-label={t("chat.newChat.placeholder")}
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
          </label>
          <p className="mt-2 text-xs text-ink-3">{t("chat.newChat.hint")}</p>
        </div>

        <div className="bx-scroll mt-2 min-h-[120px] flex-1 overflow-y-auto px-2 pb-2">
          {q.length >= 2 && !searching && people.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium">{t("chat.newChat.noneTitle")}</p>
              <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-ink-3">
                {t("chat.newChat.noneBody")}
              </p>
            </div>
          )}
          {searching && people.length === 0 && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
            </div>
          )}
          {people.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              onSelect={onPick}
              action={p.conversation_id ? t("chat.newChat.open") : t("chat.newChat.write")}
            />
          ))}
        </div>

        {dayLeft !== null && Math.min(dayLeft, hourLeft) <= QUOTA_WARN_REMAINING && (
          <p className="safe-bottom border-t border-line/[0.06] px-4 py-3 text-xs leading-relaxed text-ink-3">
            {hourLeft < dayLeft
              ? t("chat.newChat.quotaHour", { left: hourLeft, limit: quota.hour_limit })
              : t("chat.newChat.quotaDay", { left: dayLeft, limit: quota.day_limit })}
          </p>
        )}
      </div>
    </div>
  );
}
