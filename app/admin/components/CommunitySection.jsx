"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console: Community (migration 0116)
//
// Reports on public content — requests on "Looking for a builder", works,
// discussion topics and replies (0117), Showcase posts (0118, a topic of
// kind 'showcase') and global-chat messages (0120) — plus the list of every Showcase post, hidden ones
// included, so a post can be hidden or pinned without a report. A request can
// be hidden from the board right here; a work is taken down from the Builders
// tab, where the rest of that builder's works are.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listAdminShowcasePosts, listCommunityReports, resolveCommunityReport, setBriefHidden, setForumHidden, setTopicPinned } from "../../../lib/community/api";
import { setChatHidden } from "../../../lib/community/chat";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDateTime, errText, Spinner, EmptyState, ErrorLine, PillTabs, RefreshButton } from "./shared";

const TABS = [{ key: "open" }, { key: "reviewed" }, { key: "dismissed" }, { key: "all" }];

export default function CommunitySection() {
  const t = useT();
  const [tab, setTab] = useState("open");
  const [reports, setReports] = useState(null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listCommunityReports(tab).then(({ reports: rows, error: e }) => {
      if (e) setError(errText(e, "admin.errors.loadCommunity"));
      setReports(rows || []);
    });
    listAdminShowcasePosts().then(({ posts: rows, error: e }) => {
      if (e) setError(errText(e, "admin.errors.loadCommunity"));
      setPosts(rows || []);
    });
  }, [tab]);

  useEffect(() => {
    setReports(null);
    load();
  }, [load]);

  async function act(call) {
    setError(null);
    const { error: e } = await call();
    if (e) {
      setError(errText(e, "admin.errors.communityAction"));
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PillTabs items={TABS} value={tab} onChange={setTab} label={(key) => t(`admin.reports.tabs.${key}`)} />
        <RefreshButton onClick={load} title={t("admin.reports.reload")} />
      </div>
      <p className="text-xs text-ink-3">
        {t("admin.community.hint")}{" "}
        <Link href="/community?s=requests" className="underline hover:text-ink">
          {t("admin.community.openBoard")}
        </Link>
      </p>
      <ErrorLine>{error}</ErrorLine>

      {reports === null ? (
        <Spinner />
      ) : reports.length === 0 ? (
        <EmptyState>{t("admin.community.none")}</EmptyState>
      ) : (
        <ul className="divide-y divide-line/[0.07] rounded-xl border border-line/[0.09]">
          {reports.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="tag">{t(`admin.community.type.${r.target_kind === "showcase" ? (r.target_type === "topic" ? "post" : "comment") : r.target_type}`)}</span>
                <span className="text-sm font-semibold">{r.target_title || t("community.showcase.untitled")}</span>
                {r.target_owner && <span className="text-xs text-ink-3">@{r.target_owner}</span>}
                {r.target_hidden && <span className="text-xs font-medium text-danger">{t("admin.community.hiddenNow")}</span>}
                <span className="ml-auto text-[11px] text-ink-3">{formatDateTime(r.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-[13px] text-ink-2">{r.reason}</p>
              <p className="text-[11px] text-ink-3">{t("admin.community.by", { name: r.reporter_username || "—" })}</p>
              <div className="flex flex-wrap gap-2">
                {(r.target_type === "topic" || r.target_type === "reply") && (
                  <>
                    <button type="button" onClick={() => act(() => setForumHidden(r.target_type, r.target_id, !r.target_hidden))} className="btn btn-secondary btn-sm">
                      {r.target_hidden ? t("community.topic.unhide") : t("community.topic.hide")}
                    </button>
                    {r.topic_id && (
                      <Link href={`/community?s=${r.target_kind === "showcase" ? "showcase" : "discussions"}&t=${r.topic_id}`} className="btn btn-ghost btn-sm">
                        {t(r.target_kind === "showcase" ? "admin.community.openPost" : "admin.community.openTopic")}
                      </Link>
                    )}
                  </>
                )}
                {r.target_type === "chat_message" && (
                  <>
                    <button type="button" onClick={() => act(() => setChatHidden(r.target_id, !r.target_hidden))} className="btn btn-secondary btn-sm">
                      {r.target_hidden ? t("community.topic.unhide") : t("community.topic.hide")}
                    </button>
                    <Link href="/community?s=chat" className="btn btn-ghost btn-sm">
                      {t("admin.community.openChat")}
                    </Link>
                  </>
                )}
                {r.target_type === "brief" && (
                  <button type="button" onClick={() => act(() => setBriefHidden(r.target_id, !r.target_hidden))} className="btn btn-secondary btn-sm">
                    {r.target_hidden ? t("community.requests.unhide") : t("community.requests.hide")}
                  </button>
                )}
                {r.status === "open" && (
                  <>
                    <button type="button" onClick={() => act(() => resolveCommunityReport(r.id, "reviewed"))} className="btn btn-ghost btn-sm">
                      {t("admin.community.markReviewed")}
                    </button>
                    <button type="button" onClick={() => act(() => resolveCommunityReport(r.id, "dismissed"))} className="btn btn-ghost btn-sm">
                      {t("admin.community.dismiss")}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="pt-2 text-sm font-semibold">{t("admin.community.postsTitle")}</h3>
      <p className="text-xs text-ink-3">{t("admin.community.postsHint")}</p>
      {posts === null ? (
        <Spinner />
      ) : posts.length === 0 ? (
        <EmptyState>{t("admin.community.noPosts")}</EmptyState>
      ) : (
        <ul className="divide-y divide-line/[0.07] rounded-xl border border-line/[0.09]">
          {posts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="block h-12 w-16 flex-shrink-0 overflow-hidden rounded-md bg-raised">
                {p.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.caption}</p>
                <p className="text-[11px] text-ink-3">
                  @{p.author} · {formatDateTime(p.createdAt)} · {p.likes} ♥ · {p.replies}
                  {p.pinned && ` · ${t("community.topic.pinned")}`}
                  {p.hidden && <span className="font-medium text-danger"> · {t("admin.community.hiddenNow")}</span>}
                </p>
              </div>
              <Link href={`/community?s=showcase&t=${p.id}`} className="btn btn-ghost btn-sm">
                {t("admin.community.openPost")}
              </Link>
              <button type="button" onClick={() => act(() => setTopicPinned(p.id, !p.pinned))} className="btn btn-ghost btn-sm">
                {p.pinned ? t("community.topic.unpin") : t("community.topic.pin")}
              </button>
              <button type="button" onClick={() => act(() => setForumHidden("topic", p.id, !p.hidden))} className="btn btn-secondary btn-sm">
                {p.hidden ? t("community.topic.unhide") : t("community.topic.hide")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
