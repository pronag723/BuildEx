"use client";

// One Showcase post, opened in the channel column: the gallery (arrow keys
// and thumbnails), the caption, the author with a link to their
// profile if they are a builder, and the comments — which are forum replies,
// so quoting, "helpful", editing, reports and moderation are the topic's.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import SaveButton from "../../../lib/ui/SaveButton";
import SmartText from "../../../lib/ui/SmartText";
import { publicAsset } from "../../home/utils";
import {
  communityImageUrl,
  editReply,
  editShowcasePost,
  fetchTopic,
  POST_CAPTION_MAX,
  replyToTopic,
  reportContent,
  setForumHidden,
  setTopicPinned,
} from "../../../lib/community/api";
import Toast from "../../components/Toast";
import ReportDialog from "./ReportDialog";
import { CHANNELS } from "./channels";
import { useForumToggles } from "./useForumToggles";

function Author({ name, avatar, isBuilder, username, at, edited, size = 28 }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <Avatar src={avatar ? publicAsset(avatar) : null} name={name} size={size} />
      <div className="min-w-0 text-xs">
        <p className="flex items-center gap-1.5">
          {isBuilder && username ? (
            <Link href={`/builders/profile?u=${encodeURIComponent(username)}`} className="truncate font-medium text-ink hover:underline">
              {name}
            </Link>
          ) : (
            <span className="truncate font-medium text-ink">{name}</span>
          )}
          {isBuilder && <span className="tag h-[18px] px-1.5 text-[10px]">{t("chat.builderTag")}</span>}
        </p>
        <p className="text-ink-3">
          {relativeAgo(at, t.lang)}
          {edited && ` · ${t("community.topic.edited")}`}
        </p>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, active = false, filled = false, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-line/[0.06] disabled:opacity-40 ${active ? "text-ink" : "text-ink-3 hover:text-ink"} ${className}`}
    >
      <Icon name={icon} size={14} filled={filled} />
      {label}
    </button>
  );
}

function Gallery({ images, caption }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const count = images.length;
  const go = useCallback((dir) => setIndex((i) => (i + dir + count) % count), [count]);
  useEffect(() => {
    if (count < 2) return undefined;
    const onKey = (e) => {
      if (e.target && /^(input|textarea)$/i.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, go]);
  const current = images[index] || images[0];
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-raised">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={caption} className="mx-auto max-h-[70vh] w-full object-contain" />
        )}
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t("community.post.prevPhoto")} className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
              <Icon name="chevronLeft" size={20} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t("community.post.nextPhoto")} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
              <Icon name="chevronRight" size={20} />
            </button>
            <span className="absolute bottom-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1} / ${count}`}
              aria-current={i === index}
              className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditPost({ post, onCancel, onSave }) {
  const t = useT();
  const [caption, setCaption] = useState(post.body || "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, POST_CAPTION_MAX))} rows={4} className="input h-auto resize-y py-2.5 leading-relaxed" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
        <button
          type="button"
          disabled={busy || !caption.trim()}
          onClick={async () => {
            setBusy(true);
            await onSave(caption.trim());
            setBusy(false);
          }}
          className="btn btn-primary btn-sm"
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

function EditReply({ initialBody, onCancel, onSave }) {
  const t = useT();
  const [body, setBody] = useState(initialBody || "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 5000))} rows={4} className="input h-auto resize-y py-2.5 leading-relaxed" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
        <button type="button" disabled={busy || !body.trim()} onClick={async () => { setBusy(true); await onSave(body.trim()); setBusy(false); }} className="btn btn-primary btn-sm">
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

export default function PostView({ postId, onBack, onLoaded }) {
  const t = useT();
  const { status, user, profile } = useAuth();
  const signedIn = status === "authenticated";
  const meId = user?.id || null;
  const isAdmin = profile?.is_admin === true;
  const [data, setData] = useState(null); // { topic, replies } | { missing: true }
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState(null);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null); // "post" | reply id
  const [report, setReport] = useState(null);
  const [notice, setNotice] = useState(null);
  const taRef = useRef(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  }, []);

  const { toggleTopicHelpful, toggleReplyHelpful, toggleSave } = useForumToggles(setData, showNotice);

  const load = useCallback(async () => {
    const { topic, replies } = await fetchTopic(postId);
    setData(topic && topic.kind === "showcase" ? { topic, replies } : { missing: true });
    if (topic && topic.kind === "showcase") onLoaded?.(topic);
  }, [postId, onLoaded]);

  useEffect(() => {
    setData(null);
    load();
  }, [load, status]);

  async function run(callFn, okKey) {
    const { error } = await callFn();
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return false;
    }
    if (okKey) showNotice(t(okKey));
    await load();
    return true;
  }

  const backLabel = t("community.shell.backTo", { channel: t("community.channels.showcase.slug") });
  const backControl = (
    <button type="button" onClick={onBack} className="mb-3 hidden h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-ink-3 transition-colors hover:bg-line/[0.06] hover:text-ink lg:inline-flex">
      <Icon name="arrowLeft" size={14} />
      <Icon name={CHANNELS.showcase.icon} size={13} />
      {backLabel}
    </button>
  );

  if (data === null) {
    return (
      <div>
        {backControl}
        <div className="skeleton aspect-[4/3] max-h-[60vh] w-full rounded-xl" />
        <div className="mt-4 space-y-2">
          <div className="skeleton h-3 w-1/3 rounded" />
          <div className="skeleton h-3 w-2/3 rounded" />
        </div>
      </div>
    );
  }
  if (data.missing) {
    return (
      <div>
        {backControl}
        <div className="rounded-xl border border-dashed border-line/15 px-6 py-14 text-center">
          <p className="text-sm font-medium">{t("community.post.missing")}</p>
          <button type="button" onClick={onBack} className="btn btn-secondary btn-sm mt-4">{backLabel}</button>
        </div>
      </div>
    );
  }

  const { topic: post, replies } = data;
  const mine = post.author_id === meId;
  const authorName = post.author_display_name || post.author_username || t("common.member");
  const images = (Array.isArray(post.images) ? post.images : []).map(communityImageUrl).filter(Boolean);
  const byId = Object.fromEntries(replies.map((r) => [r.id, r]));

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await replyToTopic(post.id, body, quote?.id || null);
    setSending(false);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    setDraft("");
    setQuote(null);
    await load();
  }

  function renderReply(r) {
    const name = r.author_display_name || r.author_username || t("common.member");
    const quoted = r.quote_reply_id ? byId[r.quote_reply_id] : null;
    const ownReply = r.author_id === meId;
    return (
      <li key={r.id} id={`reply-${r.id}`} className="px-4 py-4">
        <Author name={name} avatar={r.author_avatar_url} isBuilder={r.author_is_builder} username={r.author_username} at={r.created_at} edited={Boolean(r.edited_at)} />
        {quoted && (
          <button
            type="button"
            onClick={() => document.getElementById(`reply-${quoted.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="mt-2 block w-full rounded-lg border-l-2 border-line/20 bg-raised px-3 py-2 text-left text-xs text-ink-3"
          >
            <span className="font-medium text-ink-2">{quoted.author_display_name || quoted.author_username}</span>
            {": "}
            <span className="line-clamp-2">{quoted.body || t("community.topic.hiddenReply")}</span>
          </button>
        )}
        {editing === r.id ? (
          <div className="mt-2">
            <EditReply initialBody={r.body} onCancel={() => setEditing(null)} onSave={async (body) => { if (await run(() => editReply(r.id, body))) setEditing(null); }} />
          </div>
        ) : r.body === null ? (
          <p className="mt-2 text-sm italic text-ink-3">{t("community.topic.hiddenReply")}</p>
        ) : (
          <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed ${r.hidden ? "text-ink-3" : "text-ink"}`}>
            <SmartText>{r.body}</SmartText>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <ActionButton
            icon="star"
            filled={r.helpful_by_me}
            active={r.helpful_by_me}
            disabled={!signedIn || ownReply}
            label={`${t("community.topic.helpful")}${r.helpful_count ? ` · ${r.helpful_count}` : ""}`}
            onClick={() => toggleReplyHelpful(r)}
          />
          {signedIn && <ActionButton icon="chat" label={t("community.topic.quote")} onClick={() => { setQuote(r); taRef.current?.focus(); }} />}
          {ownReply && <ActionButton icon="pencil" label={t("common.edit")} onClick={() => setEditing(r.id)} />}
          {signedIn && !ownReply && <ActionButton icon="flag" label={t("community.report.short")} onClick={() => setReport({ type: "reply", id: r.id })} />}
          {isAdmin && (
            <ActionButton icon={r.hidden ? "eye" : "eyeOff"} label={r.hidden ? t("community.topic.unhide") : t("community.topic.hide")} onClick={() => run(() => setForumHidden("reply", r.id, !r.hidden))} />
          )}
        </div>
      </li>
    );
  }

  return (
    <div>
      {backControl}
      <article>
        <Gallery images={images} caption={post.title} />

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <Author name={authorName} avatar={post.author_avatar_url} isBuilder={post.author_is_builder} username={post.author_username} at={post.created_at} edited={Boolean(post.edited_at)} size={36} />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <ActionButton
              icon="heart"
              filled={post.helpful_by_me}
              active={post.helpful_by_me}
              disabled={!signedIn || mine}
              className={post.helpful_by_me ? "text-[rgb(var(--heart))]" : ""}
              label={`${t("community.showcase.like")}${post.helpful_count ? ` · ${post.helpful_count}` : ""}`}
              onClick={() => toggleTopicHelpful(post)}
            />
            {signedIn && (
              <SaveButton
                saved={post.saved_by_me}
                onToggle={() => toggleSave(post)}
                size={14}
                aria-label={post.saved_by_me ? t("community.topic.saved") : t("community.topic.save")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-ink-3 hover:bg-line/[0.06] hover:text-ink"
              >
                {post.saved_by_me ? t("community.topic.saved") : t("community.topic.save")}
              </SaveButton>
            )}
            {mine && <ActionButton icon="pencil" label={t("common.edit")} onClick={() => setEditing("post")} />}
            {signedIn && !mine && <ActionButton icon="flag" label={t("community.report.short")} onClick={() => setReport({ type: "topic", id: post.id })} />}
            {isAdmin && (
              <>
                <ActionButton icon="pin" active={post.pinned} label={post.pinned ? t("community.topic.unpin") : t("community.topic.pin")} onClick={() => run(() => setTopicPinned(post.id, !post.pinned))} />
                <ActionButton icon={post.hidden ? "eye" : "eyeOff"} label={post.hidden ? t("community.topic.unhide") : t("community.topic.hide")} onClick={() => run(() => setForumHidden("topic", post.id, !post.hidden))} />
              </>
            )}
          </div>
        </div>

        {editing === "post" ? (
          <div className="mt-3">
            <EditPost post={post} onCancel={() => setEditing(null)} onSave={async (caption) => { if (await run(() => editShowcasePost(post.id, caption))) setEditing(null); }} />
          </div>
        ) : (
          <>
            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
              <SmartText>{post.body}</SmartText>
            </p>
            {(post.pinned || post.hidden) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {post.pinned && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Icon name="pin" size={12} />{t("community.topic.pinned")}</span>}
                {post.hidden && <span className="text-xs font-medium text-danger">{t("community.requests.hiddenTag")}</span>}
              </div>
            )}
          </>
        )}
      </article>

      <h2 className="mb-2 mt-6 text-sm font-semibold">{t("community.post.comments", { count: replies.length })}</h2>
      {replies.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line/15 px-4 py-8 text-center text-sm text-ink-3">{t("community.post.noComments")}</p>
      ) : (
        <ul className="card divide-y divide-line/[0.06]">{replies.map((r) => renderReply(r))}</ul>
      )}

      <div className="safe-bottom sticky bottom-0 z-10 -mx-4 mt-4 border-t border-line/[0.08] bg-canvas px-4 pt-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-t-xl lg:border-x lg:px-4">
        {signedIn ? (
          <>
            {quote && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5 text-xs text-ink-3">
                <span className="min-w-0 flex-1 truncate">{t("community.topic.quoting", { name: quote.author_display_name || quote.author_username })}</span>
                <button type="button" onClick={() => setQuote(null)} aria-label={t("common.close")} className="text-ink-3 hover:text-ink">
                  <Icon name="close" size={13} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={taRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 5000))}
                rows={2}
                placeholder={t("community.post.commentPlaceholder")}
                className="input h-auto max-h-48 min-h-[2.75rem] flex-1 resize-y py-2.5 leading-snug"
              />
              <button type="button" onClick={send} disabled={!draft.trim() || sending} className="btn btn-primary h-11 flex-shrink-0">
                {t("community.post.comment")}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-ink-2">{t("community.post.signInToComment")}</p>
            <Link href={`/login?redirect=${encodeURIComponent(`/community?s=showcase&t=${post.id}`)}`} className="btn btn-primary btn-sm">
              {t("community.requests.signIn")}
            </Link>
          </div>
        )}
      </div>

      <ReportDialog
        open={Boolean(report)}
        title={report?.type === "topic" ? t("community.report.post") : t("community.report.reply")}
        onClose={() => setReport(null)}
        onSubmit={async (reason) => {
          const { error } = await reportContent(report.type, report.id, reason);
          if (error) {
            showNotice(serverMessage(error, "community.errors.failed"));
            return { error };
          }
          showNotice(t("community.report.thanks"));
          return { error: null };
        }}
      />
      <Toast message={notice} />
    </div>
  );
}
