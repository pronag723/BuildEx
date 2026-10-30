"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console: the "BuildEx Updates" channel (migration 0112)
//
// Write a post (or an event with dates), see it exactly as members will — the
// preview is the channel's own card — and publish. With "Notify" on, every
// member who has not muted the channel gets a bell; the confirm step says how
// many before anything is sent. Published posts can be taken down and back.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  getAnnouncementAudience,
  publishAnnouncement,
  setAnnouncementHidden,
} from "../../../lib/admin/api";
import { fetchAnnouncements } from "../../../lib/chat/api";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { AnnouncementCard } from "../../chats/components/UpdatesChannel";
import { formatDateTime, errText, Spinner, EmptyState, ErrorLine } from "./shared";

const TITLE_MAX = 120;
const BODY_MAX = 4000;

const EMPTY = {
  kind: "post",
  title: "",
  body: "",
  linkUrl: "",
  linkLabel: "",
  startsAt: "",
  endsAt: "",
  notify: true,
};

// <input type="datetime-local"> speaks local wall time without a zone.
function localToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function validLink(url) {
  if (!url) return true;
  return /^https:\/\/\S+$/.test(url) || /^\/\S*$/.test(url);
}

export default function UpdatesSection() {
  const t = useT();
  const [form, setForm] = useState(EMPTY);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [audience, setAudience] = useState(null);
  const [publishing, setPublishing] = useState(false);
  useScrollLock(confirming);

  const load = useCallback(() => {
    fetchAnnouncements({ includeHidden: true, limit: 100 }).then(({ posts: rows, error: e }) => {
      if (e) setError(errText(e, "admin.errors.loadUpdates"));
      setPosts((rows || []).slice().reverse());
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => {
    const value = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const startsIso = localToIso(form.startsAt);
  const endsIso = localToIso(form.endsAt);
  const problems = [];
  if (!form.title.trim()) problems.push(t("admin.updates.needTitle"));
  if (!form.body.trim()) problems.push(t("admin.updates.needBody"));
  if (!validLink(form.linkUrl.trim())) problems.push(t("admin.updates.badLink"));
  if (form.kind === "event" && !startsIso) problems.push(t("admin.updates.needStart"));
  if (form.kind === "event" && startsIso && endsIso && endsIso < startsIso) problems.push(t("admin.updates.badRange"));

  const preview = {
    kind: form.kind,
    title: form.title.trim(),
    body: form.body.trim(),
    link_url: validLink(form.linkUrl.trim()) ? form.linkUrl.trim() : "",
    link_label: form.linkLabel.trim(),
    event_starts_at: form.kind === "event" ? startsIso : null,
    event_ends_at: form.kind === "event" ? endsIso : null,
  };

  async function askConfirm() {
    if (problems.length) return;
    setError(null);
    setAudience(null);
    setConfirming(true);
    if (form.notify) {
      const { count, error: e } = await getAnnouncementAudience();
      if (e) setError(errText(e, "admin.errors.audience"));
      setAudience(count);
    }
  }

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    const { error: e } = await publishAnnouncement({
      ...form,
      title: form.title.trim(),
      body: form.body.trim(),
      linkUrl: form.linkUrl.trim(),
      linkLabel: form.linkLabel.trim(),
      startsAt: startsIso,
      endsAt: endsIso,
    });
    setPublishing(false);
    if (e) {
      setError(errText(e, "admin.errors.publish"));
      setConfirming(false);
      return;
    }
    setConfirming(false);
    setForm(EMPTY);
    load();
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <h2 className="text-base font-semibold">{t("admin.updates.newTitle")}</h2>

          <div className="flex gap-2" role="radiogroup" aria-label={t("admin.updates.kindAria")}>
            {["post", "event"].map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                onClick={() => setForm((f) => ({ ...f, kind }))}
                className={`tag-toggle ${form.kind === kind ? "border-accent/60 text-ink" : ""}`}
              >
                {t(`admin.updates.kind.${kind}`)}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 flex text-sm font-medium">
              {t("admin.updates.titleLabel")}
              <span className="ml-auto text-xs font-normal text-ink-3">
                {form.title.length} / {TITLE_MAX}
              </span>
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, TITLE_MAX) }))}
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex text-sm font-medium">
              {t("admin.updates.bodyLabel")}
              <span className="ml-auto text-xs font-normal text-ink-3">
                {form.body.length} / {BODY_MAX}
              </span>
            </span>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value.slice(0, BODY_MAX) }))}
              rows={6}
              className="input h-auto resize-y py-2.5 leading-relaxed"
            />
          </label>

          {form.kind === "event" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">{t("admin.updates.startsLabel")}</span>
                <input type="datetime-local" value={form.startsAt} onChange={set("startsAt")} className="input" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">{t("admin.updates.endsLabel")}</span>
                <input type="datetime-local" value={form.endsAt} onChange={set("endsAt")} className="input" />
              </label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{t("admin.updates.linkLabel")}</span>
              <input
                value={form.linkUrl}
                onChange={set("linkUrl")}
                placeholder="/about"
                className="input"
                inputMode="url"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{t("admin.updates.buttonLabel")}</span>
              <input
                value={form.linkLabel}
                onChange={(e) => setForm((f) => ({ ...f, linkLabel: e.target.value.slice(0, 40) }))}
                placeholder={t("chat.updates.open")}
                className="input"
              />
            </label>
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={form.notify} onChange={set("notify")} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
            <span>
              {t("admin.updates.notify")}
              <span className="block text-xs text-ink-3">{t("admin.updates.notifyHint")}</span>
            </span>
          </label>

          {problems.length > 0 && (form.title || form.body) && (
            <ul className="space-y-1 text-xs text-ink-3">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <ErrorLine>{error}</ErrorLine>

          <button type="button" onClick={askConfirm} disabled={problems.length > 0} className="btn btn-primary">
            {t("admin.updates.publish")}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-2">{t("admin.updates.previewTitle")}</p>
          <div className="rounded-xl border border-dashed border-line/15 bg-canvas p-4">
            <AnnouncementCard post={preview} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("admin.updates.publishedTitle")}</h2>
        {posts === null ? (
          <Spinner small />
        ) : posts.length === 0 ? (
          <EmptyState>{t("admin.updates.none")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line/[0.07] rounded-xl border border-line/[0.09]">
            {posts.map((post) => (
              <PostRow key={post.id} post={post} onChanged={load} />
            ))}
          </ul>
        )}
      </section>

      {confirming && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("admin.updates.confirmAria")}
          onClick={() => !publishing && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line/10 bg-surface p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">
              {form.notify
                ? audience === null
                  ? t("admin.updates.counting")
                  : t("admin.updates.confirmNotify", { count: audience })
                : t("admin.updates.confirmQuiet")}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t("admin.updates.confirmBody")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={publishing} className="btn btn-ghost">
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={publishing || (form.notify && audience === null)}
                className="btn btn-primary"
              >
                {publishing ? t("admin.updates.publishing") : t("admin.updates.send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PostRow({ post, onChanged }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hidden = Boolean(post.hidden_at);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await setAnnouncementHidden(post.id, !hidden);
    setBusy(false);
    if (e) {
      setError(errText(e, "admin.errors.hideUpdate"));
      return;
    }
    onChanged();
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${hidden ? "text-ink-3 line-through" : ""}`}>{post.title}</p>
        <p className="mt-0.5 text-xs text-ink-3">
          {formatDateTime(post.created_at)}
          {post.kind === "event" && ` · ${t("admin.updates.kind.event")}`}
          {hidden && ` · ${t("admin.updates.hidden")}`}
        </p>
        <ErrorLine>{error}</ErrorLine>
      </div>
      <button type="button" onClick={toggle} disabled={busy} className="btn btn-ghost btn-sm flex-shrink-0">
        {hidden ? t("admin.updates.restore") : t("admin.updates.takeDown")}
      </button>
    </li>
  );
}
