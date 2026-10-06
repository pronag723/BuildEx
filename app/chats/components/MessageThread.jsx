"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SmartText from "../../../lib/ui/SmartText";
import { isPublicBuilder } from "../../../lib/chat/api";
import { publicAsset } from "../../home/utils";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate, formatTime } from "../../../lib/i18n/format.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";

// Pinned at the very top of every thread. The old version of this notice
// promised that BuildEx would review the conversation to settle a dispute — a
// promise the payments layer used to back and no longer can. What it says now is
// what is actually true: the arrangement is theirs, and abuse gets reported.
function SafetyNotice() {
  const t = useT();
  return (
    <p className="mx-auto mb-5 max-w-md rounded-lg border border-line/[0.08] px-3.5 py-2.5 text-center text-xs leading-relaxed text-ink-3">
      {t("chat.safetyNotice")}
    </p>
  );
}

// ─── Legacy order-event messages ────────────────────────────────────
// Orders were removed from the product, but real threads still contain the
// system rows the old lifecycle RPCs wrote (msg_type='order_event'). The rows
// stay in the database; here they degrade to a neutral muted line so an old
// conversation still reads end to end and nothing crashes on their meta shape.
function OrderEventMessage({ message }) {
  const t = useT();
  return (
    <div className="flex justify-center my-3 px-2">
      <span className="inline-flex items-center gap-2 text-[11px] text-ink-3">
        <span>{t("chat.orderUpdate")}</span>
        <span>· {clockTime(message.created_at, t.lang)}</span>
      </span>
    </div>
  );
}

function clockTime(iso, lang) {
  if (!iso) return "";
  return formatTime(iso, lang);
}

function dayLabel(iso, t) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return t("chat.today");
  if (sameDay(d, yest)) return t("chat.yesterday");
  return formatDate(iso, t.lang, { month: "long", day: "numeric", year: "numeric" });
}

export default function MessageThread({
  peer,
  messages,
  meId,
  loading,
  sending,
  isDraft,
  conversationMeta,
  reported,
  onSend,
  onSendImage,
  onReport,
  onBack,
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // Lock page scroll while the image lightbox or the report dialog is open so the
  // thread behind the dimmed overlay can't scroll.
  useScrollLock(!!lightboxUrl || reportOpen);

  // Stick to the bottom as messages arrive / the thread switches.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, peer?.id]);

  // Reset the composer — and any half-written report — when switching threads.
  useEffect(() => {
    setDraft("");
    setReportOpen(false);
    setReportReason("");
  }, [peer?.id, isDraft]);

  // A report needs a thread that exists in the database, so it is offered once
  // the first message has been sent, never on an unsent draft.
  const canReport = !isDraft && typeof onReport === "function";

  async function submitReport() {
    const reason = reportReason.trim();
    if (!reason || reporting) return;
    setReporting(true);
    try {
      const { error } = (await onReport(reason)) || {};
      if (!error) {
        setReportOpen(false);
        setReportReason("");
      }
    } finally {
      setReporting(false);
    }
  }

  // Clear the box optimistically so the thread feels instant, but put the text
  // back if the send was refused — a new conversation can now be turned down by
  // the rate limit in migration 0100, and the toast explaining that is no
  // consolation for a message you have to retype.
  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    const { error } = (await onSend(body)) || {};
    if (error) setDraft((current) => (current ? current : body));
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

  // The other side of a thread is a person, not necessarily a builder — they
  // may well be someone hiring. Fall back to their @handle, then to a neutral
  // word, never to "Builder".
  const peerName = peer?.display_name || peer?.username || t("common.member");
  const canWrite = isDraft || conversationMeta?.can_write !== false;

  // Only builders have a page at /builders/profile, so only their @handle is a
  // link. For everyone else the handle still shows — it just isn't clickable,
  // rather than leading to a "builder not found" dead end.
  const [peerHasProfile, setPeerHasProfile] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPeerHasProfile(false);
    if (!peer?.id) return undefined;
    isPublicBuilder(peer.id).then((yes) => {
      if (!cancelled) setPeerHasProfile(yes);
    });
    return () => {
      cancelled = true;
    };
  }, [peer?.id]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line/[0.08] px-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-ghost btn-icon -ml-1 lg:hidden"
          aria-label={t("chat.backToConversations")}
        >
          <Icon name="arrowLeft" size={19} />
        </button>
        <Avatar src={peer?.avatar_url ? publicAsset(peer.avatar_url) : null} name={peerName} size={34} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{peerName}</p>
          {peer?.username && (
            peerHasProfile ? (
              <Link
                href={`/builders/profile?u=${encodeURIComponent(peer.username)}`}
                className="text-xs text-ink-3 transition-colors hover:text-ink"
              >
                @{peer.username}
              </Link>
            ) : (
              <p className="text-xs text-ink-3">@{peer.username}</p>
            )
          )}
        </div>

        {canReport && (
          <button
            type="button"
            onClick={() => !reported && setReportOpen(true)}
            disabled={reported}
            className="btn btn-ghost btn-sm ml-auto flex-shrink-0 font-medium disabled:opacity-60"
            title={reported ? t("chat.reportedTitle") : t("chat.reportTitle")}
          >
            <Icon name="flag" size={15} />
            <span className="hidden sm:inline">{reported ? t("chat.reported") : t("chat.report")}</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="bx-scroll flex-1 overflow-y-auto px-3 py-5 space-y-1 min-h-0 sm:px-5">
        {!loading && <SafetyNotice />}
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-6 py-10">
            <Avatar src={peer?.avatar_url ? publicAsset(peer.avatar_url) : null} name={peerName} size={56} />
            <p className="font-semibold text-sm mt-3">{peerName}</p>
            {peer?.username && (
              <p className="text-xs text-ink-3">@{peer.username}</p>
            )}
            <p className="mt-3 text-xs text-ink-2 max-w-[260px] leading-relaxed">
              {t("chat.startOfConversation")}
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
                      <span className="text-[11px] font-medium text-ink-3">
                        {dayLabel(m.created_at, t)}
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
            const isImage = m.msg_type === "image" && m.meta?.url;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-[11px] font-medium text-ink-3">
                      {dayLabel(m.created_at, t)}
                    </span>
                  </div>
                )}
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {isImage ? (
                    <div
                      className={`max-w-[78%] sm:max-w-[60%] p-1 rounded-[14px] overflow-hidden ${
                        mine ? "bg-accent rounded-br-[4px]" : "bg-raised rounded-bl-[4px]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(publicAsset(m.meta.url))}
                        className="block w-full"
                        aria-label={t("chat.openPhoto")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={publicAsset(m.meta.url)}
                          alt={m.body || t("chat.photo")}
                          className="rounded-[10px] max-h-72 w-auto object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                      {m.body && (
                        <p
                          className={`px-2 pt-1.5 text-sm whitespace-pre-wrap break-words ${
                            mine ? "text-accent-fg" : "text-ink"
                          }`}
                        >
                          <SmartText>{m.body}</SmartText>
                        </p>
                      )}
                      <span
                        className={`block px-2 pb-1 text-[10px] mt-0.5 text-right ${
                          mine ? "text-accent-fg/60" : "text-ink-3"
                        }`}
                      >
                        {clockTime(m.created_at, t.lang)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[80%] sm:max-w-[70%] px-3.5 py-2 rounded-[14px] text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        mine
                          ? "bg-accent text-accent-fg rounded-br-[4px]"
                          : "bg-raised text-ink rounded-bl-[4px]"
                      }`}
                    >
                      <SmartText>{m.body}</SmartText>
                      <span
                        className={`block text-[10px] mt-0.5 text-right tabular-nums ${
                          mine ? "text-accent-fg/60" : "text-ink-3"
                        }`}
                      >
                        {clockTime(m.created_at, t.lang)}
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
      <div className="flex-shrink-0 border-t border-line/[0.08] p-2.5 sm:p-3">
        {!canWrite && (
          <p className="mb-2 text-center text-xs text-ink-2">
            {t("chat.readOnly")}
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
            className="btn btn-ghost h-11 w-11 flex-shrink-0 p-0"
            aria-label={t("chat.sendPhoto")}
            title={t("chat.sendPhoto")}
          >
            <Icon name="photo" size={20} />
          </button>
          <textarea
            ref={taRef}
            value={draft}
            onChange={autoGrow}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={!canWrite}
            rows={1}
            placeholder={t("chat.composerPlaceholder", { name: peerName })}
            className="input h-auto min-h-[2.75rem] max-h-[140px] flex-1 resize-none py-[0.6875rem] leading-snug"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || sending || !canWrite}
            className="btn btn-primary h-11 w-11 flex-shrink-0 p-0"
            aria-label={t("chat.sendMessage")}
          >
            {sending ? (
              <span className="h-4 w-4 rounded-full border-2 border-accent-fg/30 border-t-accent-fg animate-spin" />
            ) : (
              <Icon name="send" size={18} />
            )}
          </button>
        </div>
      </div>

      {reportOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("chat.reportDialogAria")}
          onClick={() => !reporting && setReportOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line/10 bg-surface p-5 shadow-pop sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">{t("chat.reportTitle")}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
              {t("chat.reportBody")}
            </p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value.slice(0, 2000))}
              rows={4}
              autoFocus
              placeholder={t("chat.reportPlaceholder")}
              className="input mt-4 h-auto resize-none py-2.5"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                disabled={reporting}
                className="btn btn-ghost"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={!reportReason.trim() || reporting}
                className="btn btn-danger"
              >
                {reporting ? t("chat.sending") : t("chat.sendReport")}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt={t("chat.photo")}
            className="max-w-full max-h-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}
