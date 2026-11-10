"use client";

// "Looking for a builder": public briefs. Anyone can read the board; a
// signed-in client publishes a brief here instead of sending it to one
// builder, and a builder responds with a message and up to three works —
// which opens their chat with the client, the brief already in it as an order.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useIsBuilder } from "../../../lib/auth/useIsBuilder";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { useScrollLock } from "../../../lib/useScrollLock";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { publicAsset } from "../../home/utils";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { fetchWorks } from "../../../lib/works/api";
import { chatImageUrl } from "../../../lib/chat/api";
import { BRIEF_BUILD_TYPES, budgetText, sizeText } from "../../../lib/orders/brief.mjs";
import { BUILDER_ONBOARDING_START } from "../../../lib/onboarding/state";
import {
  closePublicBrief,
  fetchPublicBriefs,
  publishBrief,
  reportContent,
  REQUESTS_PAGE,
  respondToBrief,
  setBriefHidden,
} from "../../../lib/community/api";
import { BriefSummary } from "../../chats/components/BriefCard";
import BriefBuilder from "../../chats/components/BriefBuilder";
import Toast from "../../components/Toast";
import ReportDialog from "./ReportDialog";
import ChannelHeader from "./ChannelHeader";
import EmptyState from "./EmptyState";
import FeedRow, { FeedList, FeedSkeleton } from "./FeedRow";

// Labels: `community.requests.status.<status>`.
function StatusText({ status }) {
  const t = useT();
  return (
    <span className={`text-xs font-medium ${status === "open" ? "text-accent-ink" : "text-ink-3"}`}>
      {t(`community.requests.status.${status}`)}
    </span>
  );
}

function RequestRow({ brief, onOpen }) {
  const t = useT();
  const size = sizeText(brief);
  const budget = budgetText(brief, t.lang, t);
  const name = brief.author_display_name || brief.author_username || t("common.member");
  const photo = (Array.isArray(brief.refs) ? brief.refs : []).find((r) => r.kind === "photo" && r.path);
  const metrics =
    brief.is_mine && brief.responses !== null
      ? [{ icon: "chat", value: brief.responses, label: t("community.requests.responses", { count: brief.responses }) }]
      : [];
  return (
    <FeedRow
      author={{ name, avatar: brief.author_avatar_url ? publicAsset(brief.author_avatar_url) : null }}
      time={relativeAgo(brief.created_at, t.lang)}
      title={brief.title}
      text={brief.description}
      status={<StatusText status={brief.status} />}
      muted={brief.status !== "open" || brief.hidden}
      image={photo ? chatImageUrl({ path: photo.path }) : null}
      chips={
        <>
          <span className="tag">{t(`buildTypes.${brief.build_type}`)}</span>
          {size && <span className="tag">{size}</span>}
          <span className="tag font-semibold text-ink">{budget || t("orders.brief.noBudget")}</span>
          {brief.hidden && <span className="tag text-danger">{t("community.requests.hiddenTag")}</span>}
        </>
      }
      metrics={metrics}
      onClick={() => onOpen(brief)}
    />
  );
}

// The full brief, and what the viewer can do with it.
function RequestPanel({ brief, onClose, onChanged, showNotice }) {
  const t = useT();
  const { status, user, profile } = useAuth();
  const isBuilder = useIsBuilder();
  const signedIn = status === "authenticated";
  const isAdmin = profile?.is_admin === true;
  const [message, setMessage] = useState("");
  const [works, setWorks] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(brief?.my_conversation_id || null);
  const [reportOpen, setReportOpen] = useState(false);
  useScrollLock(Boolean(brief));

  useEffect(() => {
    setMessage("");
    setPicked([]);
    setConversationId(brief?.my_conversation_id || null);
  }, [brief]);

  const canRespond = Boolean(brief) && signedIn && isBuilder === true && !brief.is_mine && brief.status === "open" && !conversationId;
  useEffect(() => {
    let cancelled = false;
    if (!canRespond || !user?.id || works !== null) return undefined;
    fetchWorks(user.id, { from: 0, to: 30 }).then(({ works: rows }) => {
      if (!cancelled) setWorks(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [canRespond, user?.id, works]);

  useEffect(() => {
    if (!brief) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [brief, onClose]);

  if (!brief || typeof document === "undefined") return null;
  const name = brief.author_display_name || brief.author_username || t("common.member");

  async function respond() {
    if (busy || !message.trim()) return;
    setBusy(true);
    const { conversationId: conv, error } = await respondToBrief(brief.id, message.trim(), picked);
    setBusy(false);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    setConversationId(conv);
    showNotice(t("community.requests.responded"));
    onChanged();
  }

  async function run(call, okKey) {
    setBusy(true);
    const { error } = await call();
    setBusy(false);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    if (okKey) showNotice(t(okKey));
    onChanged();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[150] flex justify-end" role="dialog" aria-modal="true" aria-label={brief.title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-surface shadow-pop sm:max-w-lg sm:border-l sm:border-line/10">
        <header className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-line/[0.08] px-4">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon -ml-2" aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
          <StatusText status={brief.status} />
          {signedIn && !brief.is_mine && (
            <button type="button" onClick={() => setReportOpen(true)} className="btn btn-ghost btn-sm ml-auto text-ink-3">
              <Icon name="flag" size={14} />
              {t("community.report.short")}
            </button>
          )}
        </header>

        <div className="bx-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4 flex items-center gap-2.5">
            <Avatar src={brief.author_avatar_url ? publicAsset(brief.author_avatar_url) : null} name={name} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="text-xs text-ink-3">{relativeAgo(brief.created_at, t.lang)}</p>
            </div>
          </div>
          <BriefSummary brief={{ ...brief, description: brief.description }} />
          {brief.extra && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-3">{brief.extra}</p>}

          <div className="mt-6 border-t border-line/[0.06] pt-5">
            {brief.is_mine ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-2">
                  {t("community.requests.responses", { count: brief.responses ?? 0 })}
                  {brief.responses > 0 && ` · ${t("community.requests.responsesHint")}`}
                </p>
                {brief.status === "open" && (
                  <button type="button" disabled={busy} onClick={() => run(() => closePublicBrief(brief.id), "community.requests.closed")} className="btn btn-secondary btn-sm">
                    {t("community.requests.close")}
                  </button>
                )}
              </div>
            ) : conversationId ? (
              <div className="flex items-center gap-3">
                <Icon name="check" size={16} className="text-accent-ink" />
                <p className="flex-1 text-sm">{t("community.requests.alreadyResponded")}</p>
                <Link href={`/chats?c=${conversationId}`} className="btn btn-primary btn-sm">
                  {t("community.requests.openChat")}
                </Link>
              </div>
            ) : brief.status !== "open" ? (
              <p className="text-sm text-ink-3">{t("community.requests.notOpen")}</p>
            ) : !signedIn ? (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-sm text-ink-2">{t("community.requests.signInToRespond")}</p>
                <Link href={`/login?redirect=${encodeURIComponent("/community?s=requests")}`} className="btn btn-primary btn-sm">
                  {t("community.requests.signIn")}
                </Link>
              </div>
            ) : isBuilder === false ? (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-sm text-ink-2">{t("community.requests.buildersOnly")}</p>
                <Link href={BUILDER_ONBOARDING_START} className="btn btn-secondary btn-sm">
                  {t("nav.becomeBuilder")}
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold">{t("community.requests.respondTitle")}</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                  rows={4}
                  placeholder={t("community.requests.respondPlaceholder")}
                  className="input mt-2 h-auto resize-none py-2.5"
                />
                <p className="mt-3 text-xs font-medium text-ink-2">{t("community.requests.pickWorks")}</p>
                {works === null ? (
                  <div className="mt-2 h-16 w-16 rounded-lg skeleton" />
                ) : works.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-3">{t("community.requests.noWorks")}</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {works.map((w) => {
                      const on = picked.includes(w.id);
                      const cover = w.photos?.[0]?.url;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          aria-pressed={on}
                          title={w.title || ""}
                          disabled={!on && picked.length >= 3}
                          onClick={() => setPicked((p) => (on ? p.filter((x) => x !== w.id) : [...p, w.id]))}
                          className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 disabled:opacity-40 ${on ? "border-accent" : "border-transparent"}`}
                        >
                          {cover && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt={w.title || ""} className="h-full w-full object-cover" />
                          )}
                          {on && (
                            <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-fg">
                              <Icon name="check" size={11} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-3">
                  <p className="flex-1 text-xs leading-relaxed text-ink-3">{t("community.requests.respondHint")}</p>
                  <button type="button" disabled={busy || !message.trim()} onClick={respond} className="btn btn-primary">
                    {t("community.requests.respond")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="mt-6 border-t border-line/[0.06] pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setBriefHidden(brief.id, !brief.hidden), brief.hidden ? "community.requests.unhidden" : "community.requests.hidden")}
                className="btn btn-ghost btn-sm text-danger"
              >
                {brief.hidden ? t("community.requests.unhide") : t("community.requests.hide")}
              </button>
            </div>
          )}
        </div>
      </div>
      <ReportDialog
        open={reportOpen}
        title={t("community.report.brief")}
        onClose={() => setReportOpen(false)}
        onSubmit={async (reason) => {
          const { error } = await reportContent("brief", brief.id, reason);
          if (error) {
            showNotice(serverMessage(error, "community.errors.failed"));
            return { error };
          }
          showNotice(t("community.report.thanks"));
          return { error: null };
        }}
      />
    </div>,
    document.body
  );
}

function matches(brief, q) {
  if (!q) return true;
  return [brief.title, brief.description, brief.author_display_name, brief.author_username].join(" ").toLowerCase().includes(q);
}

export default function RequestsSection({ onBack }) {
  const t = useT();
  const { status, user } = useAuth();
  const signedIn = status === "authenticated";
  const [type, setType] = useState(null);
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState("");
  const [briefs, setBriefs] = useState(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(null);
  const [composer, setComposer] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const load = useCallback(async () => {
    const { briefs: rows } = await fetchPublicBriefs({ type, mine });
    setBriefs(rows);
    setMore(rows.length >= REQUESTS_PAGE);
  }, [type, mine]);

  useEffect(() => {
    setBriefs(null);
    load();
  }, [load, status]);

  async function loadMore() {
    const { briefs: rows } = await fetchPublicBriefs({ type, mine, offset: briefs.length });
    setBriefs((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    setMore(rows.length >= REQUESTS_PAGE);
  }

  const closeComposer = useCallback(() => setComposer(false), []);
  const closePanel = useCallback(() => setOpen(null), []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (briefs || []).filter((b) => matches(b, q)), [briefs, q]);

  const action = signedIn
    ? { label: t("community.requests.publish"), icon: "plus", onClick: () => setComposer(true) }
    : { label: t("community.requests.publish"), icon: "plus", href: `/login?redirect=${encodeURIComponent("/community?s=requests")}` };

  return (
    <>
      <ChannelHeader channel="requests" onBack={onBack} search={{ value: query, onChange: setQuery }} action={action} />

      <div className="px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          {signedIn && (
            <button type="button" onClick={() => setMine((v) => !v)} aria-pressed={mine} className="tag-toggle">
              {t("community.requests.mine")}
            </button>
          )}
          <button type="button" onClick={() => setType(null)} aria-pressed={!type} className="tag-toggle">
            {t("community.requests.allTypes")}
          </button>
          {BRIEF_BUILD_TYPES.map((key) => (
            <button key={key} type="button" onClick={() => setType(type === key ? null : key)} aria-pressed={type === key} className="tag-toggle">
              {t(`buildTypes.${key}`)}
            </button>
          ))}
        </div>

        {briefs === null ? (
          <FeedSkeleton rows={3} />
        ) : briefs.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title={t(mine ? "community.requests.emptyMineTitle" : "community.requests.emptyTitle")}
            body={t("community.requests.emptyBody")}
            action={action}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title={t("community.shell.noMatches")} body={t("community.shell.noMatchesBody")} />
        ) : (
          <>
            <FeedList>
              {visible.map((b) => (
                <RequestRow key={b.id} brief={b} onOpen={setOpen} />
              ))}
            </FeedList>
            {more && !q && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={loadMore} className="btn btn-secondary">
                  {t("community.showMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <RequestPanel brief={open} onClose={closePanel} onChanged={load} showNotice={showNotice} />
      <BriefBuilder
        open={composer}
        mode="public"
        userId={user?.id}
        onClose={closeComposer}
        onSubmit={async (payload) => {
          const { error } = await publishBrief(payload);
          if (error) {
            showNotice(serverMessage(error, "community.errors.failed"));
            return { error };
          }
          showNotice(t("community.requests.published"));
          setMine(false);
          load();
          return { error: null };
        }}
      />
      <Toast message={notice} />
    </>
  );
}
