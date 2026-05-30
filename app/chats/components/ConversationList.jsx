"use client";

import { publicAsset } from "../../home/utils";

// Compact "2m / 4h / Mon / Apr 3" stamp for the inbox rows.
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

function Avatar({ name, url, size = 48 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="rounded-2xl overflow-hidden bg-[#4ade80]/15 border border-[#4ade80]/40 flex items-center justify-center text-[#4ade80] font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={publicAsset(url)} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

export default function ConversationList({
  conversations,
  loading,
  activeId,
  onSelect,
  compact = false,
}) {
  if (loading) {
    return (
      <div className="flex-1 flex flex-col gap-2 p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl">
            <div className="w-12 h-12 rounded-2xl bg-white/5 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-3 w-1/2 rounded bg-white/10 animate-pulse" />
              <div className="h-2.5 w-3/4 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    if (compact) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-2 py-8">
          <div className="w-10 h-10 rounded-2xl bg-[#4ade80]/10 border border-[#4ade80]/30 flex items-center justify-center text-xl">
            💬
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="w-14 h-14 rounded-2xl bg-[#4ade80]/10 border border-[#4ade80]/30 flex items-center justify-center text-2xl mb-4">
          💬
        </div>
        <p className="font-semibold text-sm mb-1">No conversations yet</p>
        <p className="text-xs text-gray-500 leading-relaxed max-w-[220px]">
          Open a builder&apos;s profile and tap{" "}
          <span className="text-[#4ade80] font-medium">Contact Builder</span> to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {conversations.map((c) => {
        const active = c.conversation_id === activeId;
        const name = c.other_display_name || c.other_username || "Builder";
        const unread = Number(c.unread_count) || 0;
        if (compact) {
          return (
            <button
              key={c.conversation_id}
              type="button"
              onClick={() => onSelect(c)}
              title={name}
              aria-label={name}
              className={`w-full flex items-center justify-center px-2 py-2 transition-colors border-l-2 ${
                active
                  ? "bg-[#4ade80]/10 border-[#4ade80]"
                  : "border-transparent hover:bg-white/5"
              }`}
            >
              <span className="relative">
                <Avatar name={name} url={c.other_avatar_url} />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#4ade80] text-black text-[10px] font-bold flex items-center justify-center ring-2 ring-[#171717]">
                    {unread > 9 ? "9+" : unread}
                  </span>
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
            className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-l-2 ${
              active
                ? "bg-[#4ade80]/10 border-[#4ade80]"
                : "border-transparent hover:bg-white/5"
            }`}
          >
            <Avatar name={name} url={c.other_avatar_url} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">{name}</span>
                <span className="text-[10px] text-gray-500 ml-auto flex-shrink-0">
                  {relativeStamp(c.last_message_at)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p
                  className={`text-xs truncate flex-1 ${
                    unread > 0 ? "text-gray-200 font-medium" : "text-gray-500"
                  }`}
                >
                  {c.last_message_preview || "No messages yet"}
                </p>
                {unread > 0 && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#4ade80] text-black text-[10px] font-bold flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
