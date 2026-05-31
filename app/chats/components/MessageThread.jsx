"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { publicAsset } from "../../home/utils";

function IconSend({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

function IconBack({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconShield({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// Pinned at the very top of every thread: tells both parties the conversation
// can be reviewed by BuildEx if a dispute is opened.
function ConflictNotice() {
  return (
    <div className="flex items-start gap-2.5 mb-4 px-3.5 py-2.5 rounded-2xl bg-[#4ade80]/[0.07] border border-[#4ade80]/20 text-gray-400">
      <IconShield className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#4ade80]" />
      <p className="text-[11px] leading-relaxed">
        Keep deals inside BuildEx. In the event of a dispute, this conversation
        can be reviewed by our team to help resolve conflicts — so keep important
        agreements in writing here.
      </p>
    </div>
  );
}

function clockTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function PeerAvatar({ name, url, size = 40 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="rounded-2xl overflow-hidden bg-[#4ade80]/15 border border-[#4ade80]/40 flex items-center justify-center text-[#4ade80] font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
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

export default function MessageThread({
  peer,
  messages,
  meId,
  loading,
  sending,
  isDraft,
  onSend,
  onBack,
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  // Stick to the bottom as messages arrive / the thread switches.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, peer?.id]);

  // Reset the composer when switching threads.
  useEffect(() => {
    setDraft("");
  }, [peer?.id, isDraft]);

  function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    onSend(body);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function autoGrow(e) {
    setDraft(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }

  const peerName = peer?.display_name || peer?.username || "Builder";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="lg:hidden -ml-1 mr-1 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
          aria-label="Back to conversations"
        >
          <IconBack className="w-5 h-5" />
        </button>
        <PeerAvatar name={peerName} url={peer?.avatar_url} />
        <div className="min-w-0">
          <p className="font-bold text-sm truncate leading-tight">{peerName}</p>
          {peer?.username && (
            <Link
              href={`/builders/profile?u=${encodeURIComponent(peer.username)}`}
              className="text-xs text-gray-500 hover:text-[#4ade80] transition-colors"
            >
              @{peer.username}
            </Link>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-1 min-h-0 hide-scrollbar">
        {!loading && <ConflictNotice />}
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-6 py-10">
            <PeerAvatar name={peerName} url={peer?.avatar_url} size={64} />
            <p className="font-semibold text-sm mt-4 mb-1">{peerName}</p>
            <p className="text-xs text-gray-500 max-w-[260px] leading-relaxed">
              This is the start of your conversation. Say hello and describe the build you have in mind.
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === meId;
            const prev = messages[i - 1];
            const showDay =
              !prev ||
              new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      mine
                        ? "bg-[#4ade80] text-black rounded-br-md"
                        : "glass rounded-bl-md"
                    }`}
                  >
                    {m.body}
                    <span
                      className={`block text-[10px] mt-1 text-right ${
                        mine ? "text-black/50" : "text-gray-500"
                      }`}
                    >
                      {clockTime(m.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 p-3 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={draft}
            onChange={autoGrow}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={`Message ${peerName}…`}
            className="flex-1 resize-none bg-white/5 border border-white/10 focus:border-[#4ade80]/50 rounded-2xl px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-gray-500 max-h-[140px]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || sending}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-2xl bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#4ade80]"
            aria-label="Send message"
          >
            {sending ? (
              <span className="w-4 h-4 rounded-full border-2 border-black/40 border-t-transparent animate-spin" />
            ) : (
              <IconSend className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
