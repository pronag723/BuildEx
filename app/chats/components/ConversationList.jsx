"use client";

import { useEffect, useMemo, useState } from "react";
import { publicAsset } from "../../home/utils";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
// Compact "2m / 4h / Mon / Apr 3" stamp for the inbox rows.
import { relativeStamp } from "../../../lib/i18n/format.mjs";
import { translateServerText } from "../../../lib/i18n/serverText.mjs";
import { searchPeople } from "../../../lib/chat/api";
import { PresenceAvatar, SupportAvatar, UpdatesAvatar } from "./ChatAvatars";

// Green for a thread that wants you; grey for one you muted, and for the
// updates channel, which never asks for a reply.
function UnreadBadge({ count, quiet = false, className = "" }) {
  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
        quiet ? "bg-line/[0.12] text-ink-2" : "bg-accent text-accent-fg"
      } ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function rowClass(active) {
  return `flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors ${
    active ? "bg-raised" : "hover:bg-line/[0.06]"
  }`;
}

function matches(c, q) {
  if (!q) return true;
  const hay = `${c.other_display_name || ""} ${c.other_username || ""}`.toLowerCase();
  return hay.includes(q);
}

// Debounced people search for the list's search box. Only people without a
// thread yet are returned: everyone else is already in the filtered list.
function usePeopleSearch(query, knownIds) {
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim().replace(/^@/, "");
    if (q.length < 2) {
      setPeople([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const { people: rows } = await searchPeople(q);
      if (cancelled) return;
      setPeople((rows || []).filter((p) => !knownIds.has(p.id)));
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, knownIds]);
  return { people, searching };
}

export function PersonRow({ person, onSelect, action }) {
  const t = useT();
  const name = person.display_name || person.username || t("common.member");
  return (
    <button type="button" onClick={() => onSelect(person)} className={rowClass(false)}>
      <PresenceAvatar
        src={person.avatar_url ? publicAsset(person.avatar_url) : null}
        name={name}
        size={40}
        lastSeenAt={person.last_seen_at}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{name}</span>
          {person.is_builder && <span className="tag h-[18px] px-1.5 text-[10px]">{t("chat.builderTag")}</span>}
        </span>
        {person.username && <span className="block truncate text-xs text-ink-3">@{person.username}</span>}
      </span>
      {action && <span className="flex-shrink-0 text-xs font-medium text-ink-2">{action}</span>}
    </button>
  );
}

export default function ConversationList({
  conversations,
  loading,
  activeKey,
  onSelect,
  systemAvailable = false,
  updates = null,
  support = null,
  onOpenUpdates,
  onOpenSupport,
  onStartWith,
  compact = false,
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase().replace(/^@/, "");

  const knownIds = useMemo(
    () => new Set((conversations || []).map((c) => c.other_id).filter(Boolean)),
    [conversations]
  );
  const { people, searching } = usePeopleSearch(compact ? "" : query, knownIds);
  const visible = useMemo(() => (conversations || []).filter((c) => matches(c, q)), [conversations, q]);

  if (loading) {
    return (
      <div className="flex-1 space-y-1 p-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="h-11 w-11 flex-shrink-0 rounded-[10px] skeleton" />
            {!compact && (
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-1/2 rounded skeleton" />
                <div className="h-2.5 w-3/4 rounded skeleton" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── The two pinned system threads ──────────────────────────────────────────
  const supportUnread = Number(support?.unread_count) || 0;
  const pinned = systemAvailable ? (
    compact ? (
      <>
        <button
          type="button"
          onClick={onOpenUpdates}
          title={t("chat.updates.name")}
          aria-label={t("chat.updates.name")}
          className={`relative flex w-full items-center justify-center rounded-[10px] p-2 transition-colors ${
            activeKey === "updates" ? "bg-raised" : "hover:bg-line/[0.06]"
          }`}
        >
          <UpdatesAvatar />
          {updates?.unread > 0 && (
            <UnreadBadge count={updates.unread} quiet className="absolute right-1 top-1 ring-2 ring-surface" />
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSupport}
          title={t("chat.support.name")}
          aria-label={t("chat.support.name")}
          className={`relative flex w-full items-center justify-center rounded-[10px] p-2 transition-colors ${
            activeKey === "support" ? "bg-raised" : "hover:bg-line/[0.06]"
          }`}
        >
          <SupportAvatar />
          {supportUnread > 0 && (
            <UnreadBadge count={supportUnread} className="absolute right-1 top-1 ring-2 ring-surface" />
          )}
        </button>
      </>
    ) : (
      <>
        <button
          type="button"
          onClick={onOpenUpdates}
          aria-current={activeKey === "updates" ? "true" : undefined}
          className={rowClass(activeKey === "updates")}
        >
          <UpdatesAvatar />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{t("chat.updates.name")}</span>
              <Icon name="verified" size={14} className="flex-shrink-0 text-ink-2" />
              {updates?.latestAt && (
                <span className="ml-auto flex-shrink-0 text-[11px] tabular-nums text-ink-3">
                  {relativeStamp(updates.latestAt, t.lang)}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className="flex-1 truncate text-[13px] text-ink-2">
                {updates?.latestTitle || t("chat.updates.tagline")}
              </span>
              {updates?.unread > 0 && <UnreadBadge count={updates.unread} quiet className="flex-shrink-0" />}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenSupport}
          aria-current={activeKey === "support" ? "true" : undefined}
          className={rowClass(activeKey === "support")}
        >
          <SupportAvatar />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{t("chat.support.name")}</span>
              {support?.last_message_at && (
                <span className="ml-auto flex-shrink-0 text-[11px] tabular-nums text-ink-3">
                  {relativeStamp(support.last_message_at, t.lang)}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className={`flex-1 truncate text-[13px] ${supportUnread > 0 ? "text-ink" : "text-ink-3"}`}>
                {support?.support_status === "closed"
                  ? t("chat.support.closedShort")
                  : translateServerText(support?.last_message_preview, t.lang) || t("chat.support.tagline")}
              </span>
              {supportUnread > 0 && <UnreadBadge count={supportUnread} className="flex-shrink-0" />}
            </span>
          </span>
        </button>
        <div className="mx-2 my-1.5 h-px bg-line/[0.06]" />
      </>
    )
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!compact && (
        <div className="flex-shrink-0 px-3 pb-2 pt-1">
          <label className="input flex h-9 items-center gap-2 px-3 focus-within:border-accent/60">
            <Icon name="search" size={15} className="flex-shrink-0 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("chat.searchPlaceholder")}
              aria-label={t("chat.searchPlaceholder")}
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex-shrink-0 text-ink-3 hover:text-ink"
                aria-label={t("chat.clearSearch")}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </label>
        </div>
      )}

      <div className="bx-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {!q && pinned}

        {visible.map((c) => {
          const active = c.conversation_id === activeKey;
          // A conversation partner may be hiring rather than building, so never
          // fall back to "Builder" — their @handle, then a neutral word.
          const name = c.other_display_name || c.other_username || t("common.member");
          const unread = Number(c.unread_count) || 0;
          const avatarSrc = c.other_avatar_url ? publicAsset(c.other_avatar_url) : null;

          if (compact) {
            return (
              <button
                key={c.conversation_id}
                type="button"
                onClick={() => onSelect(c)}
                title={name}
                aria-label={name}
                aria-current={active ? "true" : undefined}
                className={`relative flex w-full items-center justify-center rounded-[10px] p-2 transition-colors ${
                  active ? "bg-raised" : "hover:bg-line/[0.06]"
                }`}
              >
                <PresenceAvatar src={avatarSrc} name={name} size={44} lastSeenAt={c.other_last_seen_at} />
                {unread > 0 && (
                  <UnreadBadge
                    count={unread}
                    quiet={c.is_muted}
                    className="absolute right-1 top-1 ring-2 ring-surface"
                  />
                )}
              </button>
            );
          }

          return (
            <button
              key={c.conversation_id}
              type="button"
              onClick={() => onSelect(c)}
              aria-current={active ? "true" : undefined}
              className={rowClass(active)}
            >
              <PresenceAvatar src={avatarSrc} name={name} size={44} lastSeenAt={c.other_last_seen_at} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`truncate text-sm ${unread > 0 ? "font-semibold" : "font-medium"}`}>{name}</span>
                  {c.other_is_builder && (
                    <span className="tag h-[18px] flex-shrink-0 px-1.5 text-[10px]">{t("chat.builderTag")}</span>
                  )}
                  {c.is_muted && <Icon name="bellOff" size={12} className="flex-shrink-0 text-ink-3" />}
                  <span className="ml-auto flex-shrink-0 text-[11px] tabular-nums text-ink-3">
                    {relativeStamp(c.last_message_at, t.lang)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className={`flex-1 truncate text-[13px] ${unread > 0 ? "text-ink" : "text-ink-3"}`}>
                    {translateServerText(c.last_message_preview, t.lang) || t("chat.noMessages")}
                  </p>
                  {unread > 0 && <UnreadBadge count={unread} quiet={c.is_muted} className="flex-shrink-0" />}
                </div>
              </div>
            </button>
          );
        })}

        {!compact && q && (
          <>
            {people.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  {t("chat.people")}
                </p>
                {people.map((p) => (
                  <PersonRow key={p.id} person={p} onSelect={onStartWith} action={t("chat.newChat.write")} />
                ))}
              </>
            )}
            {visible.length === 0 && people.length === 0 && !searching && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium">{t("chat.newChat.noneTitle")}</p>
                <p className="mx-auto mt-1 max-w-[240px] text-xs leading-relaxed text-ink-3">
                  {q.length < 2 ? t("chat.newChat.tooShort") : t("chat.newChat.noneBody")}
                </p>
              </div>
            )}
          </>
        )}

        {!q && visible.length === 0 && !compact && (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium">{t("chat.noConversations")}</p>
            <p className="mx-auto mt-1 max-w-[240px] text-xs leading-relaxed text-ink-3">
              {t.rich("chat.noConversationsHint", {
                cta: <span className="font-medium text-ink-2">{t("profile.contactBuilder")}</span>,
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
