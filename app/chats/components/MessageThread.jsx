"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SmartText from "../../../lib/ui/SmartText";
import { chatImageUrl, isPublicBuilder, SUPPORT_TOPICS } from "../../../lib/chat/api";
import { publicAsset } from "../../home/utils";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate, formatTime } from "../../../lib/i18n/format.mjs";
import { translateServerText } from "../../../lib/i18n/serverText.mjs";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { isOnline } from "../../../lib/presence/api";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { PresenceAvatar, SupportAvatar } from "./ChatAvatars";

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

// ─── Lines that are not chat bubbles ────────────────────────────────
// Legacy order events: orders were removed from the product, but real threads
// still contain the rows the old lifecycle RPCs wrote. They degrade to a neutral
// muted line so an old conversation still reads end to end.
//
// System lines (0112, msg_type='system') are written by database functions —
// "Request closed" in a support thread, for now. Their body is English server
// text, translated like every other server string.
function SystemLine({ message, label }) {
  const t = useT();
  return (
    <div className="my-3 flex justify-center px-2">
      <span className="inline-flex items-center gap-2 text-center text-[11px] text-ink-3">
        <span>{label ?? translateServerText(message.body, t.lang)}</span>
        <span>· {formatTime(message.created_at, t.lang)}</span>
      </span>
    </div>
  );
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

function DayChip({ iso }) {
  const t = useT();
  return (
    <div className="my-4 flex items-center justify-center">
      <span className="text-[11px] font-medium text-ink-3">{dayLabel(iso, t)}</span>
    </div>
  );
}

// The thread menu: mute, report. A small popover anchored to the "⋯" button.
function ThreadMenu({ items }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost btn-icon"
        aria-label={t("chat.menu")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div role="menu" className="menu-panel popover-rise absolute right-0 top-11 z-30 w-60 p-1.5">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-line/[0.06] disabled:opacity-50 ${
                item.danger ? "text-danger" : "text-ink"
              }`}
            >
              <Icon name={item.icon} size={16} className={item.danger ? "" : "text-ink-2"} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The opening of an empty support thread: what support is for, the four
// topics, and the two things people most often write in about that support
// cannot actually fix.
function SupportIntro({ topic, onPickTopic }) {
  const t = useT();
  return (
    <div className="mx-auto max-w-md space-y-4 py-2">
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[14px] rounded-bl-[4px] bg-raised px-3.5 py-2 text-sm leading-relaxed text-ink">
          {t("chat.support.greeting")}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("chat.support.topicsAria")}>
        {SUPPORT_TOPICS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onPickTopic(topic === key ? null : key)}
            aria-pressed={topic === key}
            className={`tag-toggle ${topic === key ? "border-accent/60 text-ink" : ""}`}
          >
            {topic === key && <Icon name="check" size={14} className="mr-1.5 text-accent-ink" />}
            {t(`chat.support.topics.${key}`)}
          </button>
        ))}
      </div>
      <ul className="space-y-2 border-t border-line/[0.06] pt-4 text-xs leading-relaxed text-ink-3">
        <li>{t("chat.support.tipReport")}</li>
        <li>{t("chat.support.tipMoney")}</li>
      </ul>
    </div>
  );
}

export default function MessageThread({
  mode = "direct",
  peer,
  peerLastSeenAt = null,
  peerIsBuilder = null,
  messages,
  meId,
  loading,
  sending,
  isDraft,
  conversationMeta,
  reported,
  muted = false,
  supportStatus = null,
  supportTopic = null,
  onPickSupportTopic,
  onSend,
  onSendImage,
  onReport,
  onToggleMute,
  onBack,
  initialDraft = "",
}) {
  const t = useT();
  const isSupport = mode === "support";
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
  }, [messages, loading, peer?.id, mode]);

  // Reset the composer — and any half-written report — when switching threads.
  // A thread opened from "Discuss a similar build" starts with that draft.
  useEffect(() => {
    setDraft(initialDraft || "");
    setReportOpen(false);
    setReportReason("");
  }, [peer?.id, isDraft, initialDraft, mode]);

  // A report needs a thread that exists in the database, so it is offered once
  // the first message has been sent, never on an unsent draft. Support threads
  // are already a line to the moderators.
  const canReport = !isSupport && !isDraft && typeof onReport === "function";
  const canMute = !isDraft && typeof onToggleMute === "function";

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
  const peerName = isSupport
    ? t("chat.support.fullName")
    : peer?.display_name || peer?.username || t("common.member");
  const canWrite = isSupport || isDraft || conversationMeta?.can_write !== false;

  // Only builders have a page at /builders/profile, so only their @handle is a
  // link. For everyone else the handle still shows — it just isn't clickable,
  // rather than leading to a "builder not found" dead end. The inbox already
  // knows (other_is_builder, 0112); a draft or an older database asks.
  const [lookedUpBuilder, setLookedUpBuilder] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLookedUpBuilder(false);
    if (isSupport || !peer?.id || typeof peerIsBuilder === "boolean") return undefined;
    isPublicBuilder(peer.id).then((yes) => {
      if (!cancelled) setLookedUpBuilder(yes);
    });
    return () => {
      cancelled = true;
    };
  }, [peer?.id, peerIsBuilder, isSupport]);
  const peerHasProfile = typeof peerIsBuilder === "boolean" ? peerIsBuilder : lookedUpBuilder;
  const profileHref = peer?.username ? `/builders/profile?u=${encodeURIComponent(peer.username)}` : null;
  const online = isOnline(peerLastSeenAt);

  // While a support request is closed, its last "Request closed" line says how
  // to reopen it: just write again.
  const lastClosedIndex = isSupport && supportStatus === "closed"
    ? messages.reduce((acc, m, i) => (m.msg_type === "system" && m.meta?.event === "support_closed" ? i : acc), -1)
    : -1;

  const menuItems = [
    canMute && {
      key: "mute",
      icon: muted ? "bell" : "bellOff",
      label: muted ? t("chat.unmute") : t("chat.mute"),
      onClick: onToggleMute,
    },
    canReport && {
      key: "report",
      icon: "flag",
      label: reported ? t("chat.reported") : t("chat.report"),
      danger: !reported,
      disabled: reported,
      onClick: () => !reported && setReportOpen(true),
    },
  ];

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
        {isSupport ? (
          <SupportAvatar size={34} />
        ) : (
          <PresenceAvatar
            src={peer?.avatar_url ? publicAsset(peer.avatar_url) : null}
            name={peerName}
            size={34}
            lastSeenAt={peerLastSeenAt}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{peerName}</p>
          {isSupport ? (
            <p className="truncate text-xs text-ink-3">{t("chat.support.subtitle")}</p>
          ) : (
            <p className="truncate text-xs text-ink-3">
              {peer?.username &&
                (peerHasProfile ? (
                  <Link href={profileHref} className="transition-colors hover:text-ink">
                    @{peer.username}
                  </Link>
                ) : (
                  <span>@{peer.username}</span>
                ))}
              {online ? (
                <span className="text-accent-ink"> · {t("chat.online")}</span>
              ) : peerLastSeenAt ? (
                <span> · {t("chat.lastSeen", { when: relativeAgo(peerLastSeenAt, t.lang) })}</span>
              ) : null}
            </p>
          )}
        </div>

        {!isSupport && peerHasProfile && profileHref && (
          <Link href={profileHref} className="btn btn-ghost btn-sm hidden flex-shrink-0 font-medium sm:inline-flex">
            {t("chat.profile")}
          </Link>
        )}
        <ThreadMenu items={menuItems} />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="bx-scroll flex-1 overflow-y-auto px-3 py-5 space-y-1 min-h-0 sm:px-5">
        {!loading && !isSupport && <SafetyNotice />}
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          isSupport ? (
            <SupportIntro topic={supportTopic} onPickTopic={(key) => onPickSupportTopic?.(key)} />
          ) : (
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
          )
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDay =
              !prev ||
              new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();

            // Order events and system lines render as a neutral centred line,
            // not as left/right chat bubbles. Day chip still leads if needed.
            if (m.msg_type === "order_event" || m.msg_type === "system") {
              const closing = m.msg_type === "system" && m.meta?.event === "support_closed";
              return (
                <div key={m.id}>
                  {showDay && <DayChip iso={m.created_at} />}
                  <SystemLine
                    message={m}
                    label={
                      m.msg_type === "order_event"
                        ? t("chat.orderUpdate")
                        : closing
                          ? t("chat.support.closedLine")
                          : undefined
                    }
                  />
                  {i === lastClosedIndex && (
                    <p className="-mt-1 mb-3 text-center text-[11px] text-ink-3">{t("chat.support.reopenHint")}</p>
                  )}
                </div>
              );
            }

            const mine = m.sender_id === meId;
            // Direct threads have exactly two participants, so the bubble side
            // already says who is speaking — no per-message sender label.
            const imageUrl = m.msg_type === "image" ? chatImageUrl(m.meta) : null;
            // In support, the moderators' messages carry a small "Moderator"
            // label at the start of each run: the team answering, not a person.
            const staffRunStart =
              isSupport && !mine && (!prev || showDay || prev.sender_id === meId || prev.msg_type === "system");
            return (
              <div key={m.id}>
                {showDay && <DayChip iso={m.created_at} />}
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {staffRunStart && (
                    <span className="mb-0.5 mt-1 px-1 text-[11px] font-medium text-ink-2">
                      {t("chat.support.moderator")}
                    </span>
                  )}
                  {imageUrl ? (
                    <div
                      className={`max-w-[78%] sm:max-w-[60%] p-1 rounded-[14px] overflow-hidden ${
                        mine ? "bg-accent rounded-br-[4px]" : "bg-raised rounded-bl-[4px]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(imageUrl)}
                        className="block w-full"
                        aria-label={t("chat.openPhoto")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
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
                        {formatTime(m.created_at, t.lang)}
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
                        {formatTime(m.created_at, t.lang)}
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
        {isSupport && supportTopic && messages.length === 0 && (
          <p className="mb-2 px-1 text-xs text-ink-3">
            {t("chat.support.topicLine", { topic: t(`chat.support.topics.${supportTopic}`) })}
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
            placeholder={
              isSupport ? t("chat.support.placeholder") : t("chat.composerPlaceholder", { name: peerName })
            }
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
