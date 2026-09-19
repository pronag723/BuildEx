"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SmartText from "../../../lib/ui/SmartText";
import { publicAsset } from "../../home/utils";
import { useScrollLock } from "../../../lib/useScrollLock";

function IconSend({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

function IconPhoto({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
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

// ─── Legacy order-event messages ────────────────────────────────────
// Orders were removed from the product, but real threads still contain the
// system rows the old lifecycle RPCs wrote (msg_type='order_event'). The rows
// stay in the database; here they degrade to a neutral muted line so an old
// conversation still reads end to end and nothing crashes on their meta shape.
function OrderEventMessage({ message }) {
  return (
    <div className="flex justify-center my-3 px-2">
      <span className="inline-flex items-center gap-2 text-[11px] font-medium text-gray-500 bg-white/5 border border-white/10 rounded-full px-3 py-1">
        <span>Order update</span>
        <span className="text-gray-600">· {clockTime(message.created_at)}</span>
      </span>
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
        <img src={publicAsset(url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
  conversationMeta,
  onSend,
  onSendImage,
  onBack,
}) {
  const [draft, setDraft] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // Lock page scroll while the image lightbox is open so the thread behind the
  // dimmed overlay can't scroll.
  useScrollLock(!!lightboxUrl);

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

  function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || sending) return;
    onSendImage?.(file);
  }

  // Paste an image straight from the clipboard (screenshot, copied file) — same
  // upload path as the photo button, just sourced from the paste event instead
  // of the file picker. Non-image pastes fall through to normal text behavior.
  function onPaste(e) {
    if (sending) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    files.forEach((file) => onSendImage?.(file));
  }

  const peerName = peer?.display_name || peer?.username || "Builder";
  const canWrite = isDraft || conversationMeta?.can_write !== false;

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
            const prev = messages[i - 1];
            const showDay =
              !prev ||
              new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();

            // Legacy order-lifecycle rows render as a neutral centred line, not
            // as left/right chat bubbles. Day chip still leads if needed.
            if (m.msg_type === "order_event") {
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <OrderEventMessage message={m} />
                </div>
              );
            }

            const mine = m.sender_id === meId;
            // Direct threads have exactly two participants, so the bubble side
            // already says who is speaking — no per-message sender label.
            const senderLabel = null;
            const isImage = m.msg_type === "image" && m.meta?.url;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {senderLabel && (
                    <span className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {senderLabel}
                    </span>
                  )}
                  {isImage ? (
                    <div
                      className={`max-w-[78%] sm:max-w-[60%] p-1 rounded-2xl overflow-hidden ${
                        mine ? "bg-[#4ade80] rounded-br-md" : "glass rounded-bl-md"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(publicAsset(m.meta.url))}
                        className="block w-full"
                        aria-label="Open photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={publicAsset(m.meta.url)}
                          alt={m.body || "Photo"}
                          className="rounded-xl max-h-72 w-auto object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                      {m.body && (
                        <p
                          className={`px-2 pt-1.5 text-sm whitespace-pre-wrap break-words ${
                            mine ? "text-black" : "text-gray-200"
                          }`}
                        >
                          <SmartText>{m.body}</SmartText>
                        </p>
                      )}
                      <span
                        className={`block px-2 pb-1 text-[10px] mt-0.5 text-right ${
                          mine ? "text-black/50" : "text-gray-500"
                        }`}
                      >
                        {clockTime(m.created_at)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[78%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        mine
                          ? "bg-[#4ade80] text-black rounded-br-md"
                          : "glass rounded-bl-md"
                      }`}
                    >
                      <SmartText>{m.body}</SmartText>
                      <span
                        className={`block text-[10px] mt-1 text-right ${
                          mine ? "text-black/50" : "text-gray-500"
                        }`}
                      >
                        {clockTime(m.created_at)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 p-3 flex-shrink-0">
        {!canWrite && (
          <p className="mb-2 text-center text-xs text-amber-300">
            This assignment is archived. You can read messages through your release time, but cannot send new ones.
          </p>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending || !canWrite}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-2xl border border-white/10 text-gray-300 hover:bg-white/10 hover:text-[#4ade80] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send a photo"
            title="Send a photo"
          >
            <IconPhoto className="w-5 h-5" />
          </button>
          <textarea
            ref={taRef}
            value={draft}
            onChange={autoGrow}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={!canWrite}
            rows={1}
            placeholder={`Message ${peerName}…`}
            className="flex-1 resize-none bg-white/5 border border-white/10 focus:border-[#4ade80]/50 rounded-2xl px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-gray-500 max-h-[140px]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || sending || !canWrite}
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

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Photo"
            className="max-w-full max-h-full rounded-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
