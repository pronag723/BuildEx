"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { publicAsset } from "../../home/utils";
import { formatPrice, SIZE_META } from "../../../lib/pricing";
import WorldPreview from "../../orders/components/WorldPreview";

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

// ─── Order-event message rendering (Stage 5) ─────────────────────────────────
// System messages emitted by the order lifecycle RPCs (msg_type='order_event').
// The PAID event ships the full order summary + brief in meta so it renders as
// a distinct card; later transitions render as compact centred status lines.
// Every variant deep-links to the order's detail page.
const ORDER_EVENT_LABELS = {
  paid: "Order paid",
  started: "Builder started work",
  delivered: "Marked as delivered",
  completed: "Order completed",
  cancelled: "Order cancelled",
  disputed: "Dispute opened",
  dispute_released: "Dispute resolved · released",
  dispute_refunded: "Dispute resolved · refunded",
};

function OrderEventMessage({ message, onPreview }) {
  const meta = message.meta || {};
  const event = meta.event;
  const orderId = meta.order_id;
  const href = orderId ? `/orders/?id=${encodeURIComponent(orderId)}` : "/orders";

  if (event === "delivered") {
    // Delivery card: shows the file, and — when the builder's browser produced
    // a voxel artifact (meta.has_preview) — a "View 3D preview" button that
    // opens the viewer right here in the chat, without leaving the thread.
    return (
      <div className="flex justify-center my-4 px-2">
        <div className="block max-w-[460px] w-full rounded-2xl border border-purple-400/30 bg-purple-400/[0.08] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span aria-hidden className="text-base">📦</span>
            <span className="font-bold text-sm text-purple-200">
              Builder delivered the world
            </span>
          </div>
          {meta.file_name && (
            <p className="text-[11px] text-gray-400 truncate mb-3">
              {meta.file_name}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {meta.has_preview && orderId && (
              <button
                type="button"
                onClick={() => onPreview?.(orderId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all"
              >
                🧊 View 3D preview
              </button>
            )}
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-white/15 text-gray-200 hover:bg-white/5 transition-all"
            >
              Open order
            </Link>
          </div>
          <p className="text-[10px] text-gray-500 mt-3 text-right">
            {clockTime(message.created_at)}
          </p>
        </div>
      </div>
    );
  }

  if (event === "paid") {
    // The card the buyer described: "Order paid" + brief copied into the chat.
    const sizeLabel =
      meta.size_label || (meta.size ? SIZE_META[meta.size]?.label || meta.size : null);
    return (
      <div className="flex justify-center my-4 px-2">
        <Link
          href={href}
          className="block max-w-[460px] w-full rounded-2xl border border-[#4ade80]/30 bg-[#4ade80]/[0.08] hover:border-[#4ade80]/60 hover:bg-[#4ade80]/[0.12] transition-all p-4"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span aria-hidden className="text-base">🔒</span>
              <span className="font-bold text-sm text-[#4ade80]">
                Order paid · in escrow
              </span>
            </div>
            {meta.price_kopecks != null && (
              <span className="font-extrabold text-[#4ade80] text-sm flex-shrink-0">
                {formatPrice(meta.price_kopecks)}
              </span>
            )}
          </div>

          {(sizeLabel || meta.style) && (
            <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">
              {sizeLabel}
              {sizeLabel && meta.style ? " · " : ""}
              <span className="capitalize">{meta.style}</span>
            </p>
          )}

          <p className="text-[10px] text-gray-500 mt-3 text-right">
            {clockTime(message.created_at)} · tap to open the order
          </p>
        </Link>
      </div>
    );
  }

  // Other lifecycle events render as compact centred lines.
  const label = ORDER_EVENT_LABELS[event] || message.body || "Order updated";
  return (
    <div className="flex justify-center my-3 px-2">
      <Link
        href={href}
        className="inline-flex items-center gap-2 text-[11px] font-medium text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 transition-all"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] flex-shrink-0" />
        <span>{label}</span>
        <span className="text-gray-500">· {clockTime(message.created_at)}</span>
      </Link>
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
  onSend,
  onSendImage,
  onBack,
}) {
  const [draft, setDraft] = useState("");
  const [previewOrderId, setPreviewOrderId] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

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
            const prev = messages[i - 1];
            const showDay =
              !prev ||
              new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();

            // System messages from the order lifecycle render as cards/lines,
            // not as left/right chat bubbles. Day chip still leads if needed.
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
                  <OrderEventMessage message={m} onPreview={setPreviewOrderId} />
                </div>
              );
            }

            const mine = m.sender_id === meId;
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
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
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
                          {m.body}
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
                      {m.body}
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
            disabled={sending}
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

      {previewOrderId && (
        <WorldPreview
          orderId={previewOrderId}
          onClose={() => setPreviewOrderId(null)}
        />
      )}

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
