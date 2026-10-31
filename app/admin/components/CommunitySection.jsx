"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console: Community (migration 0116)
//
// Reports on public content — requests on "Looking for a builder" and works in
// the Showcase. A request can be hidden from the board right here; a work is
// taken down from the Builders tab, where the rest of that builder's works are.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listCommunityReports, resolveCommunityReport, setBriefHidden } from "../../../lib/community/api";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDateTime, errText, Spinner, EmptyState, ErrorLine, PillTabs, RefreshButton } from "./shared";

const TABS = [{ key: "open" }, { key: "reviewed" }, { key: "dismissed" }, { key: "all" }];

export default function CommunitySection() {
  const t = useT();
  const [tab, setTab] = useState("open");
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listCommunityReports(tab).then(({ reports: rows, error: e }) => {
      if (e) setError(errText(e, "admin.errors.loadCommunity"));
      setReports(rows || []);
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
                <span className="tag">{t(`admin.community.type.${r.target_type}`)}</span>
                <span className="text-sm font-semibold">{r.target_title || t("community.showcase.untitled")}</span>
                {r.target_owner && <span className="text-xs text-ink-3">@{r.target_owner}</span>}
                {r.target_hidden && <span className="text-xs font-medium text-danger">{t("admin.community.hiddenNow")}</span>}
                <span className="ml-auto text-[11px] text-ink-3">{formatDateTime(r.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-[13px] text-ink-2">{r.reason}</p>
              <p className="text-[11px] text-ink-3">{t("admin.community.by", { name: r.reporter_username || "—" })}</p>
              <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
