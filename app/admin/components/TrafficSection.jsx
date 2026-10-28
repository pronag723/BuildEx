"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console: where visitors and sign-ups come from
//
// Draws admin_traffic_summary (migration 0111) for a chosen window: headline
// figures against the previous window, visits and sign-ups over time, then the
// same two counts split by channel, by source, by tagged link and by landing
// page. lib/traffic/TrafficRecorder.jsx is what fills the tables.
//
// Visits and sign-ups differ by an order of magnitude, so they get a chart
// each on a shared time axis rather than two scales on one chart. Every count
// is printed as a number; bars only show proportion.
//
// The link maker at the bottom builds ?ref= links for ads. Telegram (where the
// current ads run) sends no referrer, so an untagged ad click arrives as
// "direct" and cannot be told apart from someone typing the address.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getTrafficSummary } from "../../../lib/admin/api";
import { cleanLabel } from "../../../lib/traffic/classify.mjs";
import { Icon } from "../../../lib/icons";
import { withBase } from "../../home/utils";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { localeFor, relativeStamp } from "../../../lib/i18n/format.mjs";
import {
  formatDate,
  profileHref,
  errText,
  Spinner,
  Avatar,
  EmptyState,
  ErrorLine,
  PillTabs,
  RefreshButton,
} from "./shared";

// Labels: `admin.traffic.periods.<key>`.
const PERIODS = [
  { key: "7", days: 7 },
  { key: "30", days: 30 },
  { key: "90", days: 90 },
  { key: "all", days: 0 },
];

// Fixed order, so two windows read the same way. "unknown" is sign-ups only:
// accounts made before tracking began or in a browser that blocked storage.
const CHANNELS = ["campaign", "search", "social", "referral", "direct", "unknown"];

const SITE_ORIGIN = "https://buildex.builders";

const LINK_PAGES = [
  { key: "home", path: "/" },
  { key: "builders", path: "/builders/" },
  { key: "about", path: "/about/" },
];

function fmtNum(n, lang) {
  return new Intl.NumberFormat(localeFor(lang)).format(n || 0);
}

function fmtPct(ratio, lang) {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return new Intl.NumberFormat(localeFor(lang), {
    style: "percent",
    maximumFractionDigits: ratio < 0.1 ? 1 : 0,
  }).format(ratio);
}

function rate(signups, visits) {
  return visits > 0 ? signups / visits : null;
}

// "2026-10-28" as a local calendar day (new Date(string) would read it as UTC
// midnight and show the day before anywhere west of Greenwich).
function parseDay(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dayLabel(day, lang, withYear = false) {
  return parseDay(day).toLocaleDateString(localeFor(lang), {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function bucketLabel(day, step, lang) {
  if (step <= 1) return dayLabel(day, lang, true);
  const end = parseDay(day);
  end.setDate(end.getDate() + step - 1);
  const endIso = `${end.getFullYear()}-${end.getMonth() + 1}-${end.getDate()}`;
  return `${dayLabel(day, lang)} – ${dayLabel(endIso, lang, true)}`;
}

export default function TrafficSection() {
  const t = useT();
  const [period, setPeriod] = useState("30");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const days = PERIODS.find((p) => p.key === period)?.days ?? 30;

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrafficSummary(days).then(({ summary: data, error: e }) => {
      if (cancelled) return;
      if (e) setError(errText(e, "admin.errors.loadTraffic"));
      setSummary(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  useEffect(() => load(), [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PillTabs
          items={PERIODS}
          value={period}
          onChange={setPeriod}
          label={(key) => t(`admin.traffic.periods.${key}`)}
        />
        <RefreshButton onClick={load} title={t("admin.reports.reload")} />
      </div>

      <ErrorLine>{error}</ErrorLine>

      {loading && !summary ? (
        <Spinner />
      ) : summary ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <TrackingNote summary={summary} />
          <Kpis summary={summary} period={period} />
          <TrendCard summary={summary} period={period} />
          <div className="grid gap-5 lg:grid-cols-2">
            <ChannelsCard rows={summary.channels || []} />
            <SourcesCard rows={summary.sources || []} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <CampaignsCard rows={summary.campaigns || []} />
            <LinkMaker />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <LandingCard rows={summary.landing || []} />
            <ShareCard
              title={t("admin.traffic.devices.title")}
              rows={(summary.devices || []).map((r) => ({
                key: r.key,
                label: t(`admin.traffic.devices.${r.key}`),
                visits: r.visits,
              }))}
            />
            <ShareCard
              title={t("admin.traffic.langs.title")}
              rows={(summary.langs || []).map((r) => ({
                key: r.key,
                label: r.key === "unknown" ? t("admin.traffic.devices.unknown") : r.key.toUpperCase(),
                visits: r.visits,
              }))}
            />
          </div>
          <RecentSignups rows={summary.recent_signups || []} />
        </div>
      ) : (
        !error && <EmptyState>{t("admin.traffic.empty")}</EmptyState>
      )}
    </div>
  );
}

function Card({ title, hint, children, className = "" }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {title && (
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{hint}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function TrackingNote({ summary }) {
  const t = useT();
  const since = summary.tracking_since;
  if (!since) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-line/10 bg-line/[0.03] px-3 py-2.5 text-[12px] text-ink-2">
        <Icon name="alert" size={14} className="mt-px flex-shrink-0 text-ink-3" />
        {t("admin.traffic.notTracking")}
      </p>
    );
  }
  // Only worth saying when the window starts before tracking did.
  if (parseDay(summary.from) >= new Date(new Date(since).toDateString())) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-line/10 bg-line/[0.03] px-3 py-2.5 text-[12px] text-ink-2">
      <Icon name="clock" size={14} className="mt-px flex-shrink-0 text-ink-3" />
      {t("admin.traffic.trackingSince", { date: formatDate(since) })}
    </p>
  );
}

// ─── Headline figures ───────────────────────────────────────────────────────

function Delta({ value, prev, kind = "count" }) {
  const t = useT();
  if (prev == null || value == null) return null;
  let text;
  let up;
  if (kind === "rate") {
    const diff = value - prev;
    if (Math.abs(diff) < 0.0005) return <span className="text-ink-3">±0</span>;
    up = diff > 0;
    text = `${up ? "+" : "−"}${(Math.abs(diff) * 100).toFixed(1)} ${t("admin.traffic.pp")}`;
  } else {
    if (prev === 0) {
      if (!value) return <span className="text-ink-3">±0</span>;
      return <span className="text-accent-ink">{t("admin.traffic.new")}</span>;
    }
    const pct = (value - prev) / prev;
    if (Math.abs(pct) < 0.005) return <span className="text-ink-3">±0%</span>;
    up = pct > 0;
    text = `${up ? "+" : "−"}${Math.round(Math.abs(pct) * 100)}%`;
  }
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? "text-accent-ink" : "text-danger"}`}>
      <Icon name={up ? "chevronUp" : "chevronDown"} size={12} strokeWidth={2.25} />
      {text}
    </span>
  );
}

function Kpis({ summary, period }) {
  const t = useT();
  const cur = summary.totals || {};
  const prev = summary.previous || null;
  const conv = rate(cur.signups, cur.visitors);
  const prevConv = prev ? rate(prev.signups, prev.visitors) : null;

  const tiles = [
    { key: "visits", value: fmtNum(cur.visits, t.lang), delta: <Delta value={cur.visits} prev={prev?.visits} /> },
    { key: "visitors", value: fmtNum(cur.visitors, t.lang), delta: <Delta value={cur.visitors} prev={prev?.visitors} /> },
    { key: "signups", value: fmtNum(cur.signups, t.lang), delta: <Delta value={cur.signups} prev={prev?.signups} /> },
    {
      key: "conversion",
      value: fmtPct(conv, t.lang),
      delta: conv != null && prevConv != null ? <Delta value={conv} prev={prevConv} kind="rate" /> : null,
    },
    { key: "builders", value: fmtNum(cur.builders, t.lang), delta: <Delta value={cur.builders} prev={prev?.builders} /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.key} className="card px-4 py-3" title={t(`admin.traffic.kpi.${tile.key}Hint`)}>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
            {t(`admin.traffic.kpi.${tile.key}`)}
          </p>
          <p className="mt-1 font-mark text-2xl font-semibold tabular-nums text-ink">{tile.value}</p>
          <p className="mt-0.5 h-4 text-[11px] tabular-nums">
            {period !== "all" && tile.delta}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Over time ──────────────────────────────────────────────────────────────

function TrendCard({ summary, period }) {
  const t = useT();
  const series = summary.series || [];
  const step = summary.step || 1;
  const [hover, setHover] = useState(null);
  const point = hover != null ? series[hover] : null;
  const totals = summary.totals || {};

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-ink">{t("admin.traffic.trend.title")}</h2>
        {/* The readout: the hovered bucket, or the whole window. */}
        <p className="text-[12px] tabular-nums text-ink-2" aria-live="polite">
          <span className="text-ink-3">
            {point ? bucketLabel(point.day, step, t.lang) : t(`admin.traffic.periods.${period}`)}
          </span>
          {" · "}
          <span className="font-semibold text-ink">{fmtNum(point ? point.visits : totals.visits, t.lang)}</span>{" "}
          {t("admin.traffic.trend.visitsUnit", { count: point ? point.visits : totals.visits })}
          {" · "}
          <span className="font-semibold text-ink">{fmtNum(point ? point.signups : totals.signups, t.lang)}</span>{" "}
          {t("admin.traffic.trend.signupsUnit", { count: point ? point.signups : totals.signups })}
        </p>
      </div>

      {series.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">{t("admin.traffic.nothing")}</p>
      ) : (
        <div onMouseLeave={() => setHover(null)}>
          <BarStrip
            label={t("admin.traffic.trend.visits")}
            series={series}
            field="visits"
            height={104}
            hover={hover}
            onHover={setHover}
          />
          <div className="h-4" />
          <BarStrip
            label={t("admin.traffic.trend.signups")}
            series={series}
            field="signups"
            height={56}
            hover={hover}
            onHover={setHover}
          />
          <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-ink-3">
            <span>{dayLabel(series[0].day, t.lang)}</span>
            {series.length > 2 && <span>{dayLabel(series[Math.floor(series.length / 2)].day, t.lang)}</span>}
            <span>{dayLabel(series[series.length - 1].day, t.lang)}</span>
          </div>
          {step > 1 && <p className="mt-1 text-[10px] text-ink-3">{t("admin.traffic.trend.weekly")}</p>}

          {/* The same numbers as a table, for screen readers. */}
          <table className="sr-only">
            <caption>{t("admin.traffic.trend.title")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.traffic.table.date")}</th>
                <th scope="col">{t("admin.traffic.trend.visits")}</th>
                <th scope="col">{t("admin.traffic.trend.signups")}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.day}>
                  <th scope="row">{bucketLabel(p.day, step, t.lang)}</th>
                  <td>{p.visits}</td>
                  <td>{p.signups}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function BarStrip({ label, series, field, height, hover, onHover }) {
  const t = useT();
  const max = Math.max(1, ...series.map((p) => p[field] || 0));
  return (
    <div aria-hidden="true">
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="tabular-nums text-ink-3">{t("admin.traffic.trend.max", { n: fmtNum(max, t.lang) })}</span>
      </div>
      <div className="flex items-end gap-[2px] border-b border-line/15" style={{ height }}>
        {series.map((p, i) => {
          const value = p[field] || 0;
          const h = value > 0 ? Math.max(3, Math.round((value / max) * height)) : 0;
          const dim = hover != null && hover !== i;
          return (
            <div
              key={p.day}
              className="flex h-full min-w-0 flex-1 cursor-default items-end"
              onMouseEnter={() => onHover(i)}
              onClick={() => onHover(i)}
            >
              <div
                className={`w-full rounded-t-[4px] bg-accent transition-opacity duration-100 ${
                  dim ? "opacity-35" : hover === i ? "opacity-100" : "opacity-80"
                }`}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Breakdowns ─────────────────────────────────────────────────────────────

function ShareBar({ ratio }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line/[0.08]">
      <div
        className="h-full rounded-full bg-accent/80"
        style={{ width: `${Math.max(ratio > 0 ? 2 : 0, Math.round(ratio * 100))}%` }}
      />
    </div>
  );
}

// Name | Visits | Sign-ups | Conversion — the layout every breakdown shares.
function BreakdownTable({ rows, nameHeader, renderName }) {
  const t = useT();
  const maxVisits = Math.max(1, ...rows.map((r) => r.visits || 0));
  return (
    <div className="-mx-1">
      <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.75rem_3.5rem] gap-2 px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
        <span>{nameHeader}</span>
        <span className="text-right">{t("admin.traffic.table.visits")}</span>
        <span className="text-right">{t("admin.traffic.table.signups")}</span>
        <span className="text-right">{t("admin.traffic.table.conv")}</span>
      </div>
      <ul className="divide-y divide-line/[0.06]">
        {rows.map((r, i) => (
          <li
            key={r.key ?? i}
            className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.75rem_3.5rem] items-center gap-2 px-1 py-2 text-[13px]"
          >
            <div className="min-w-0">
              {renderName(r)}
              <ShareBar ratio={(r.visits || 0) / maxVisits} />
            </div>
            <span className="text-right tabular-nums text-ink">{fmtNum(r.visits, t.lang)}</span>
            <span className="text-right tabular-nums text-ink">{fmtNum(r.signups, t.lang)}</span>
            <span className="text-right tabular-nums text-ink-2">{fmtPct(rate(r.signups, r.visits), t.lang)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelsCard({ rows }) {
  const t = useT();
  const byKey = new Map(rows.map((r) => [r.channel, r]));
  const list = CHANNELS.map((key) => ({
    key,
    visits: byKey.get(key)?.visits || 0,
    signups: byKey.get(key)?.signups || 0,
  })).filter((r) => r.key !== "unknown" || r.signups > 0);

  return (
    <Card title={t("admin.traffic.channelsTitle")} hint={t("admin.traffic.channelsHint")}>
      <BreakdownTable
        rows={list}
        nameHeader={t("admin.traffic.table.channel")}
        renderName={(r) => (
          <p className="truncate text-ink" title={t(`admin.traffic.channelHints.${r.key}`)}>
            {t(`admin.traffic.channels.${r.key}`)}
          </p>
        )}
      />
    </Card>
  );
}

function SourcesCard({ rows }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <Card title={t("admin.traffic.sourcesTitle")} hint={t("admin.traffic.sourcesHint")}>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">{t("admin.traffic.nothing")}</p>
      ) : (
        <>
          <BreakdownTable
            rows={shown.map((r) => ({ ...r, key: `${r.channel}:${r.source}` }))}
            nameHeader={t("admin.traffic.table.source")}
            renderName={(r) => (
              <p className="truncate">
                <span className="text-ink">{r.source}</span>
                <span className="ml-1.5 text-[11px] text-ink-3">{t(`admin.traffic.channels.${r.channel}`)}</span>
              </p>
            )}
          />
          {rows.length > 10 && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="mt-2 text-xs font-semibold text-ink-2 hover:text-accent-ink transition-colors"
            >
              {all ? t("admin.traffic.showLess") : t("admin.traffic.showAll", { count: rows.length })}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function CampaignsCard({ rows }) {
  const t = useT();
  return (
    <Card title={t("admin.traffic.campaignsTitle")} hint={t("admin.traffic.campaignsHint")}>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">{t("admin.traffic.noCampaigns")}</p>
      ) : (
        <BreakdownTable
          rows={rows.map((r, i) => ({ ...r, key: `${r.source}:${r.medium}:${r.campaign}:${i}` }))}
          nameHeader={t("admin.traffic.table.link")}
          renderName={(r) => (
            <p className="truncate">
              <span className="font-medium text-ink">{r.source || "—"}</span>
              {(r.campaign || r.medium) && (
                <span className="ml-1.5 text-[11px] text-ink-3">
                  {[r.campaign, r.medium].filter(Boolean).join(" · ")}
                </span>
              )}
            </p>
          )}
        />
      )}
    </Card>
  );
}

function LandingCard({ rows }) {
  const t = useT();
  return (
    <Card title={t("admin.traffic.landingTitle")}>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">{t("admin.traffic.nothing")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const handle = /^\/builders\/profile\/@(.+)$/.exec(r.path)?.[1];
            return (
              <li key={r.path} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-2">
                  {handle ? (
                    <Link
                      href={profileHref(handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-ink hover:text-accent-ink transition-colors"
                    >
                      @{handle}
                    </Link>
                  ) : (
                    <span className="truncate font-mono text-[12px] text-ink">{r.path}</span>
                  )}
                  <span className="flex-shrink-0 tabular-nums text-ink-2">
                    {fmtNum(r.visits, t.lang)}
                    {r.signups > 0 && (
                      <span className="text-ink-3"> · {t("admin.traffic.signupsShort", { count: r.signups })}</span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ShareCard({ title, rows }) {
  const t = useT();
  const total = rows.reduce((sum, r) => sum + (r.visits || 0), 0);
  return (
    <Card title={title}>
      {total === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">{t("admin.traffic.nothing")}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-ink">{r.label}</span>
                <span className="tabular-nums text-ink-2">
                  {fmtPct(r.visits / total, t.lang)}
                  <span className="text-ink-3"> · {fmtNum(r.visits, t.lang)}</span>
                </span>
              </div>
              <ShareBar ratio={r.visits / total} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentSignups({ rows }) {
  const t = useT();
  return (
    <Card title={t("admin.traffic.recentTitle")}>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">{t("admin.traffic.noSignups")}</p>
      ) : (
        <ul className="-mx-1 divide-y divide-line/[0.06]">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-1 py-2.5">
              <Avatar url={u.avatar_url} name={u.display_name || u.username} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {u.display_name || u.username || t("admin.users.unnamed")}
                  {u.is_builder && (
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-ink">
                      {t("admin.users.builder")}
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-ink-3">
                  {u.username ? `@${u.username}` : t("admin.users.noHandle")}
                  {u.landing_path && ` · ${u.landing_path}`}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-[12px] text-ink-2">
                  {t(`admin.traffic.channels.${u.channel}`)}
                  {u.source && <span className="text-ink"> · {u.source}</span>}
                </p>
                <p className="text-[11px] text-ink-3">{relativeStamp(u.created_at, t.lang)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Tagged links ───────────────────────────────────────────────────────────

function LinkMaker() {
  const t = useT();
  const [label, setLabel] = useState("");
  const [page, setPage] = useState("home");
  const [copied, setCopied] = useState(false);

  // The same cleaning the recorder applies, so what you type is what the
  // Tagged links table will show.
  const ref = useMemo(() => cleanLabel(label), [label]);
  const path = LINK_PAGES.find((p) => p.key === page)?.path || "/";
  const url = ref ? `${SITE_ORIGIN}${withBase(path)}?ref=${encodeURIComponent(ref)}` : "";

  useEffect(() => setCopied(false), [url]);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [url]);

  return (
    <Card title={t("admin.traffic.linkTitle")} hint={t("admin.traffic.linkHint")}>
      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-ink-3">{t("admin.traffic.linkLabel")}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="mc_building_oct"
            maxLength={80}
            className="input h-10 w-full text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-ink-3">{t("admin.traffic.linkPage")}</span>
          <select value={page} onChange={(e) => setPage(e.target.value)} className="input h-10 w-full text-sm">
            {LINK_PAGES.map((p) => (
              <option key={p.key} value={p.key}>
                {t(`admin.traffic.linkPages.${p.key}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-raised px-3 py-2">
          <code className={`min-w-0 flex-1 truncate text-[12px] ${url ? "text-ink" : "text-ink-3"}`}>
            {url || t("admin.traffic.linkEmpty")}
          </code>
          <button
            type="button"
            onClick={copy}
            disabled={!url}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent-ink transition-all hover:bg-accent hover:text-accent-fg disabled:opacity-40 disabled:hover:bg-accent/10 disabled:hover:text-accent-ink"
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
            {copied ? t("admin.traffic.copied") : t("admin.traffic.copy")}
          </button>
        </div>
      </div>
    </Card>
  );
}
