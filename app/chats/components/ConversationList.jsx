"use client";

import { publicAsset } from "../../home/utils";
import Avatar from "../../../lib/ui/Avatar";
import { useT } from "../../../lib/i18n/LanguageProvider";
// Compact "2m / 4h / Mon / Apr 3" stamp for the inbox rows.
import { relativeStamp } from "../../../lib/i18n/format.mjs";
import { translateServerText } from "../../../lib/i18n/serverText.mjs";

function UnreadBadge({ count, className = "" }) {
  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function ConversationList({
  conversations,
  loading,
  activeId,
  onSelect,
  compact = false,
}) {
  const t = useT();

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

  if (conversations.length === 0) {
    if (compact) return <div className="flex-1" />;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm font-medium">{t("chat.noConversations")}</p>
        <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-ink-3">
          {t.rich("chat.noConversationsHint", {
            cta: <span className="font-medium text-ink-2">{t("profile.contactBuilder")}</span>,
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="bx-scroll flex-1 overflow-y-auto p-1.5">
      {conversations.map((c) => {
        const active = c.conversation_id === activeId;
        // A conversation partner may be hiring rather than building, so never
        // fall back to "Builder" — their @handle, then a neutral word.
        const name = c.other_display_name || c.other_username || t("common.member");
        const unread = Number(c.unread_count) || 0;
        const avatarSrc = c.other_avatar_url ? publicAsset(c.other_avatar_url) : null;
        const rowState = active ? "bg-line/[0.07]" : "hover:bg-line/[0.04]";

        if (compact) {
          return (
            <button
              key={c.conversation_id}
              type="button"
              onClick={() => onSelect(c)}
              title={name}
              aria-label={name}
              aria-current={active ? "true" : undefined}
              className={`flex w-full items-center justify-center rounded-lg p-2 transition-colors ${rowState}`}
            >
              <span className="relative">
                <Avatar src={avatarSrc} name={name} size={44} />
                {unread > 0 && (
                  <UnreadBadge count={unread} className="absolute -right-1 -top-1 ring-2 ring-surface" />
                )}
              </span>
            </button>
          );
        }

        return (
          <button
            key={c.conversation_id}
            type="button"
            onClick={() => onSelect(c)}
            aria-current={active ? "true" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${rowState}`}
          >
            <Avatar src={avatarSrc} name={name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`truncate text-sm ${unread > 0 ? "font-semibold" : "font-medium"}`}>{name}</span>
                <span className="ml-auto flex-shrink-0 text-[11px] tabular-nums text-ink-3">
                  {relativeStamp(c.last_message_at, t.lang)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <p className={`flex-1 truncate text-[13px] ${unread > 0 ? "text-ink" : "text-ink-3"}`}>
                  {translateServerText(c.last_message_preview, t.lang) || t("chat.noMessages")}
                </p>
                {unread > 0 && <UnreadBadge count={unread} className="flex-shrink-0" />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
