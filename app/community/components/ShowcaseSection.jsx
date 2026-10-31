"use client";

// The Showcase (every public work, newest or most liked, by style) and Saved
// (the works the viewer bookmarked). A tile opens the work on its builder's
// profile, where the full viewer already lives. Hearts are likes; the yellow
// bookmark saves a work so it can be attached to a brief later.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { styleChipLabel } from "../../../lib/i18n/labels.mjs";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import SaveButton from "../../../lib/ui/SaveButton";
import { formatCount } from "../../../lib/works/format.mjs";
import { toggleWorkLike } from "../../../lib/works/engagement";
import { fetchSavedWorks, fetchShowcase, reportContent, SHOWCASE_PAGE, toggleWorkSave } from "../../../lib/community/api";
import { STYLES } from "../../builders/data/offers";
import Toast from "../../components/Toast";
import ReportDialog from "./ReportDialog";

function WorkTile({ work, signedIn, onLike, onSave, onReport }) {
  const t = useT();
  const href = `/builders/profile?u=${encodeURIComponent(work.builder.username || "")}&w=${work.id}`;
  return (
    <article className="group card overflow-hidden">
      <Link href={href} className="relative block aspect-[4/3] bg-raised">
        {work.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={work.cover} alt={work.title || t("community.showcase.untitled")} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        )}
        {work.photos > 1 && (
          <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {work.photos}
          </span>
        )}
      </Link>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Link href={`/builders/profile?u=${encodeURIComponent(work.builder.username || "")}`} className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar src={work.builder.avatarUrl} name={work.builder.displayName} size={24} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink">{work.title || t("community.showcase.untitled")}</span>
            <span className="block truncate text-[11px] text-ink-3">{work.builder.displayName}</span>
          </span>
        </Link>
        {signedIn ? (
          <>
            <button
              type="button"
              onClick={() => onLike(work)}
              aria-pressed={work.liked}
              aria-label={t("community.showcase.like")}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-xs transition-colors hover:bg-line/[0.06] ${
                work.liked ? "text-[rgb(var(--heart))]" : "text-ink-3"
              }`}
            >
              <Icon name="heart" size={16} filled={work.liked} />
              {work.likes > 0 && <span className="tabular-nums">{formatCount(work.likes, t.lang)}</span>}
            </button>
            <SaveButton
              saved={work.saved}
              onToggle={() => onSave(work)}
              size={16}
              aria-label={work.saved ? t("community.showcase.unsave") : t("community.showcase.save")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-line/[0.06]"
            />
            <button
              type="button"
              onClick={() => onReport(work)}
              aria-label={t("community.report.work")}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-line/[0.06] hover:text-ink group-hover:inline-flex group-focus-within:inline-flex"
            >
              <Icon name="flag" size={14} />
            </button>
          </>
        ) : (
          work.likes > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              <Icon name="heart" size={14} />
              {formatCount(work.likes, t.lang)}
            </span>
          )
        )}
      </div>
    </article>
  );
}

export default function ShowcaseSection({ mode = "all" }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const saved = mode === "saved";
  const [sort, setSort] = useState("new");
  const [style, setStyle] = useState(null);
  const [works, setWorks] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setWorks(null);
    const run = saved ? fetchSavedWorks() : fetchShowcase({ sort, style });
    run.then(({ works: rows }) => {
      if (cancelled) return;
      setWorks(rows);
      setMore(!saved && rows.length >= SHOWCASE_PAGE);
    });
    return () => {
      cancelled = true;
    };
  }, [saved, sort, style, status]);

  async function loadMore() {
    setLoadingMore(true);
    const { works: rows } = await fetchShowcase({ sort, style, offset: works.length });
    setLoadingMore(false);
    setWorks((prev) => {
      const seen = new Set(prev.map((w) => w.id));
      return [...prev, ...rows.filter((w) => !seen.has(w.id))];
    });
    setMore(rows.length >= SHOWCASE_PAGE);
  }

  const patch = (id, fields) => setWorks((prev) => prev.map((w) => (w.id === id ? { ...w, ...fields } : w)));

  async function onLike(work) {
    patch(work.id, { liked: !work.liked, likes: work.likes + (work.liked ? -1 : 1) });
    const { liked, likes, error } = await toggleWorkLike(work.id);
    if (error) {
      patch(work.id, { liked: work.liked, likes: work.likes });
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    patch(work.id, { liked, likes: likes ?? work.likes });
  }

  async function onSave(work) {
    const { saved: now, error } = await toggleWorkSave(work.id);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return { ok: false };
    }
    if (saved && !now) setWorks((prev) => prev.filter((w) => w.id !== work.id));
    else patch(work.id, { saved: now });
    if (now) showNotice(t("community.showcase.savedHint"));
    return { ok: true };
  }

  return (
    <section>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">{t(saved ? "community.sections.saved" : "community.sections.showcase")}</h1>
        <p className="mt-1 text-sm text-ink-2">{t(saved ? "community.saved.subtitle" : "community.showcase.subtitle")}</p>
      </header>

      {!saved && (
        <div className="mb-4 space-y-3">
          <div className="flex gap-1" role="tablist" aria-label={t("community.showcase.sortAria")}>
            {["new", "popular"].map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={sort === key}
                onClick={() => setSort(key)}
                className={`relative h-9 px-3 text-sm font-medium transition-colors ${
                  sort === key ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent" : "text-ink-2 hover:text-ink"
                }`}
              >
                {t(`community.showcase.sort.${key}`)}
              </button>
            ))}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
            <button type="button" onClick={() => setStyle(null)} aria-pressed={!style} className={`tag-toggle ${!style ? "border-accent/60 bg-raised text-ink" : ""}`}>
              {t("community.showcase.allStyles")}
            </button>
            {STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStyle(style === s.key ? null : s.key)}
                aria-pressed={style === s.key}
                className={`tag-toggle ${style === s.key ? "border-accent/60 bg-raised text-ink" : ""}`}
              >
                {styleChipLabel(s.key, t.lang)}
              </button>
            ))}
          </div>
        </div>
      )}

      {works === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton aspect-[4/3]" />
              <div className="space-y-2 p-3">
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="skeleton h-2.5 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : works.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line/15 px-6 py-14 text-center">
          <p className="text-sm font-medium">{t(saved ? "community.saved.emptyTitle" : "community.showcase.emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-3">
            {t(saved ? "community.saved.emptyBody" : "community.showcase.emptyBody")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {works.map((w) => (
              <WorkTile key={w.id} work={w} signedIn={signedIn} onLike={onLike} onSave={onSave} onReport={setReportTarget} />
            ))}
          </div>
          {more && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className="btn btn-secondary">
                {loadingMore ? t("community.loading") : t("community.showMore")}
              </button>
            </div>
          )}
        </>
      )}

      {!saved && signedIn && works?.length > 0 && (
        <p className="mt-6 text-center text-xs text-ink-3">{t("community.showcase.saveTip")}</p>
      )}

      <ReportDialog
        open={Boolean(reportTarget)}
        title={t("community.report.work")}
        onClose={() => setReportTarget(null)}
        onSubmit={async (reason) => {
          const { error } = await reportContent("work", reportTarget.id, reason);
          if (error) {
            showNotice(serverMessage(error, "community.errors.failed"));
            return { error };
          }
          showNotice(t("community.report.thanks"));
          return { error: null };
        }}
      />
      <Toast message={notice} />
    </section>
  );
}
