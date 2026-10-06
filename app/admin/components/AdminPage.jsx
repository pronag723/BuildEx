"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console
// A dedicated operator surface for admins (profiles.is_admin). The orders,
// studios and payouts tabs went with the features they served; what BuildEx
// needs moderating now is a public directory of user-submitted profiles and
// images, so the console has three sections:
//
//   BUILDERS — every builder profile, searchable. Open the public page, hide or
//              unhide the profile, or delete one bad portfolio image.
//   REPORTS  — the conversation_reports queue (migration 0100). Read the
//              reported thread, then mark it reviewed or dismissed.
//   USERS    — a flat account list, enough to find someone by @handle.
//
// Everything routes through lib/admin/api.js → the admin RPCs in migration
// 0101, each of which calls _require_admin() before it does anything. The
// `isAdmin` check below decides what to RENDER; it is not what decides what a
// request is allowed to do.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import {
  listAdminBuilders,
  setBuilderHidden,
  listBuilderPortfolio,
  removePortfolioImage,
  listConversationReports,
  resolveConversationReport,
  getAdminConversationMessages,
  listAdminUsers,
} from "../../../lib/admin/api";
import { Icon } from "../../../lib/icons";
import { publicAsset } from "../../home/utils";
import SharedAvatar from "../../../lib/ui/Avatar";
import { useScrollLock } from "../../../lib/useScrollLock";
import SmartText from "../../../lib/ui/SmartText";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { getLang } from "../../../lib/i18n/translate.mjs";
import { formatDate as formatLocaleDate, formatDateTime as formatLocaleDateTime } from "../../../lib/i18n/format.mjs";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";

// Labels: `admin.sections.<key>` and `admin.reports.tabs.<key>`.
const SECTIONS = [
  { key: "builders", icon: "hammer" },
  { key: "reports", icon: "flag" },
  { key: "users", icon: "users" },
];

const REPORT_TABS = [
  { key: "open" },
  { key: "reviewed" },
  { key: "dismissed" },
  { key: "all" },
];

// Dates follow the interface language. Every component that prints one also
// calls useT(), so a language switch re-renders it with the new locale.
function formatDate(iso) {
  if (!iso) return "—";
  return formatLocaleDate(iso, getLang(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return formatLocaleDateTime(iso, getLang(), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function profileHref(username) {
  return `/builders/profile?u=${encodeURIComponent(username || "")}`;
}

// The RPC's own message (mapped to the current language where known), or the
// dictionary fallback.
function errText(error, fallbackKey) {
  return serverMessage(error, fallbackKey);
}

// ─── Page shell ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  useRequireAuth();
  const { profile, status } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useScrollLock(mobileMenuOpen);

  const ready = status === "authenticated";

  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main className="flex-1 px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {!ready ? <Spinner /> : !isAdmin ? <NotAuthorized /> : <Console />}
        </div>
      </main>
    </div>
  );
}

function Spinner({ small = false }) {
  return (
    <div className={`flex items-center justify-center ${small ? "py-6" : "py-24"}`}>
      <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
    </div>
  );
}

function NotAuthorized() {
  const t = useT();
  return (
    <div className="card p-8 text-center">
      <h1 className="text-lg font-semibold">{t("admin.notAuthorized.title")}</h1>
      <p className="mt-2 text-sm text-ink-2">
        {t("admin.notAuthorized.body")}
      </p>
      <Link href="/" className="btn btn-secondary btn-sm mt-5">
        {t("account.actions.browse")}
      </Link>
    </div>
  );
}

function Console() {
  const t = useT();
  const [section, setSection] = useState("builders");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em]">{t("admin.title")}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {t("admin.subtitle")}
        </p>
      </header>

      <nav className="flex gap-1 border-b border-line/[0.08]" role="tablist">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            onClick={() => setSection(s.key)}
            className={`relative -mb-px inline-flex h-10 items-center gap-1.5 px-3 text-sm font-medium transition-colors ${
              section === s.key
                ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            <Icon name={s.icon} size={15} />
            {t(`admin.sections.${s.key}`)}
          </button>
        ))}
      </nav>

      {section === "builders" && <BuildersSection />}
      {section === "reports" && <ReportsSection />}
      {section === "users" && <UsersSection />}
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

// Debounced search box. The debounce lives here so every section gets the same
// 250ms feel without repeating the timer.
function SearchBox({ value, onChange, placeholder, label }) {
  const t = useT();
  return (
    <label className="input flex h-11 items-center gap-2 focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.15)]">
      <Icon name="search" size={16} className="text-ink-3" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none text-sm placeholder:text-ink-3"
        aria-label={label}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-ink-3 hover:text-ink"
        >
          {t("admin.clear")}
        </button>
      )}
    </label>
  );
}

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function Avatar({ url, name, size = 40 }) {
  return <SharedAvatar src={url ? publicAsset(url) : null} name={name} size={size} />;
}

function EmptyState({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-line/15 p-8 text-center text-sm text-ink-3">
      {children}
    </div>
  );
}

function ErrorLine({ children }) {
  if (!children) return null;
  return <p className="text-sm text-danger">{children}</p>;
}

// ─── 1. BUILDERS ────────────────────────────────────────────────────────────

function BuildersSection() {
  const t = useT();
  const [query, setQuery] = useState("");
  const search = useDebounced(query);
  const [builders, setBuilders] = useState(null); // null = loading
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listAdminBuilders(search).then(({ builders: rows, error: e }) => {
      if (e) setError(errText(e, "admin.errors.loadBuilders"));
      setBuilders(rows || []);
    });
  }, [search]);

  useEffect(() => {
    setBuilders(null);
    load();
  }, [load]);

  // Patch one row in place after a hide/unhide instead of refetching the whole
  // list — the list is sorted with hidden first, and having a row jump out from
  // under the cursor on every toggle makes the console unusable.
  const patchBuilder = useCallback((builderId, patch) => {
    setBuilders((rows) =>
      (rows || []).map((b) => (b.builder_id === builderId ? { ...b, ...patch } : b))
    );
  }, []);

  const hiddenCount = useMemo(
    () => (builders || []).filter((b) => b.is_hidden).length,
    [builders]
  );

  return (
    <div className="space-y-4">
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder={t("admin.searchPlaceholder")}
        label={t("admin.builders.searchAria")}
      />

      <ErrorLine>{error}</ErrorLine>

      {builders !== null && builders.length > 0 && (
        <p className="text-[11px] text-ink-3 uppercase tracking-widest">
          {t("admin.builders.count", { count: builders.length })}
          {hiddenCount > 0 && ` · ${t("admin.builders.hiddenCount", { count: hiddenCount })}`}
        </p>
      )}

      {builders === null ? (
        <Spinner />
      ) : builders.length === 0 ? (
        <EmptyState>
          {search ? t("admin.builders.noMatch") : t("admin.builders.none")}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {builders.map((b) => (
            <BuilderRow key={b.builder_id} builder={b} onPatch={patchBuilder} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuilderRow({ builder: b, onPatch }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [count, setCount] = useState(b.portfolio_count ?? 0);
  const t = useT();

  const name = b.display_name || b.username || t("onboarding.complete.fallbackName");

  const unhide = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await setBuilderHidden(b.builder_id, false);
    setBusy(false);
    if (e) {
      setError(errText(e, "admin.errors.unhide"));
      return;
    }
    onPatch(b.builder_id, {
      is_hidden: false,
      hidden_at: null,
      hidden_reason: null,
      hidden_by_username: null,
    });
  }, [b.builder_id, busy, onPatch]);

  const hide = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await setBuilderHidden(b.builder_id, true, reason.trim());
    setBusy(false);
    if (e) {
      setError(errText(e, "admin.errors.hide"));
      return;
    }
    setConfirming(false);
    setReason("");
    onPatch(b.builder_id, {
      is_hidden: true,
      hidden_at: new Date().toISOString(),
      hidden_reason: reason.trim() || null,
    });
  }, [b.builder_id, busy, reason, onPatch]);

  return (
    <article
      className={`overflow-hidden rounded-[22px] border bg-[#1d201f]/90 transition-all duration-200 ${
        b.is_hidden
          ? "border-amber-400/40"
          : expanded
            ? "border-accent/45"
            : "border-line/[0.11] hover:border-line/20"
      }`}
    >
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start gap-3">
          <Avatar url={b.avatar_url} name={name} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-[15px] text-ink truncate">{name}</p>
              {b.is_hidden && (
                <span className="inline-flex items-center gap-1 shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-warn">
                  <Icon name="eyeOff" size={11} /> {t("admin.builders.hidden")}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-3 truncate">@{b.username}</p>
            <p className="mt-1 text-[11px] text-ink-3">
              {t("admin.builders.joined", { date: formatDate(b.joined_at) })} ·{" "}
              {t("admin.builders.images", { count: b.portfolio_count ?? 0 })}
            </p>
          </div>

          <div className="flex w-full items-center gap-1.5 sm:w-auto sm:flex-shrink-0">
            <Link
              href={profileHref(b.username)}
              target="_blank"
              rel="noopener noreferrer"
              title={t("admin.builders.openProfile")}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-line/15 text-ink-2 hover:border-accent/45 hover:text-accent-ink transition-all"
            >
              <Icon name="external" size={15} />
            </Link>
            {b.is_hidden ? (
              <button
                type="button"
                onClick={unhide}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold border border-accent/40 bg-accent/10 text-accent-ink hover:bg-accent hover:text-accent-fg transition-all disabled:opacity-50"
              >
                <Icon name="eye" size={14} /> {t("admin.builders.unhide")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming((v) => !v)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold border border-amber-400/35 text-warn hover:bg-amber-400/15 transition-all disabled:opacity-50"
              >
                <Icon name="eyeOff" size={14} /> {t("admin.builders.hide")}
              </button>
            )}
          </div>
        </div>

        {b.is_hidden && (
          <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-3">
            <span className="block text-[10px] uppercase tracking-widest text-warn/80 mb-1">
              {t("admin.builders.hiddenAt", { date: formatDateTime(b.hidden_at) })}
              {b.hidden_by_username ? t("admin.builders.hiddenBy", { handle: b.hidden_by_username }) : ""}
            </span>
            <p className="text-sm text-ink-2 whitespace-pre-wrap break-words">
              {b.hidden_reason || t("admin.builders.noReason")}
            </p>
          </div>
        )}

        {confirming && !b.is_hidden && (
          <div className="mt-3 rounded-2xl border border-line/10 bg-raised p-3 space-y-2.5">
            <p className="text-xs text-ink-2">
              {t("admin.builders.hideExplain")}
            </p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t("admin.builders.reasonPlaceholder")}
              className="bx-scroll w-full rounded-xl bg-raised border border-line/10 px-3 py-2 text-sm text-ink placeholder:text-ink-3 outline-none focus:border-accent/50 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={hide}
                disabled={busy}
                className="px-4 py-2 rounded-full text-xs font-bold border border-amber-400/40 bg-amber-400/15 text-warn hover:bg-amber-400 hover:text-black transition-all disabled:opacity-50"
              >
                {busy ? t("admin.builders.hiding") : t("admin.builders.hideProfile")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold border border-line/15 text-ink-2 hover:bg-line/5 transition-all"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        <ErrorLine>{error}</ErrorLine>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-accent-ink transition-colors"
        >
          <Icon name="image" size={14} />
          {expanded ? t("admin.builders.hidePortfolio") : t("admin.builders.portfolioCount", { n: count })}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-line/[0.07] bg-line/[0.03] px-4 py-4 sm:px-5">
          <PortfolioManager
            builderId={b.builder_id}
            onCountChange={(n) => {
              setCount(n);
              onPatch(b.builder_id, { portfolio_count: n });
            }}
          />
        </div>
      )}
    </article>
  );
}

// The one destructive action in this console. Each delete is confirmed
// individually — there is no "remove all", on purpose.
function PortfolioManager({ builderId, onCountChange }) {
  const t = useT();
  const [images, setImages] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // image id awaiting confirmation
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listBuilderPortfolio(builderId).then(({ images: rows, error: e }) => {
      if (cancelled) return;
      if (e) setError(errText(e, "admin.errors.loadPortfolio"));
      setImages(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [builderId]);

  const remove = useCallback(
    async (imageId) => {
      setBusyId(imageId);
      setError(null);
      const { error: e } = await removePortfolioImage(imageId);
      setBusyId(null);
      if (e) {
        setError(errText(e, "admin.errors.removeImage"));
        return;
      }
      setPending(null);
      setImages((rows) => {
        const next = (rows || []).filter((img) => img.id !== imageId);
        onCountChange(next.length);
        return next;
      });
    },
    [onCountChange]
  );

  if (images === null) return <Spinner small />;

  return (
    <div className="space-y-3">
      <ErrorLine>{error}</ErrorLine>
      {images.length === 0 ? (
        <p className="text-sm text-ink-3">{t("admin.portfolio.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img) => (
            <li
              key={img.id}
              className="relative rounded-xl overflow-hidden border border-line/10 bg-raised"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicAsset(img.url)}
                alt={img.alt || t("profile.portfolioImage")}
                className="w-full h-28 object-cover"
                loading="lazy"
              />
              {pending === img.id ? (
                <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2 px-2 text-center">
                  <p className="text-[11px] text-ink-2">{t("admin.portfolio.confirm")}</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => remove(img.id)}
                      disabled={busyId === img.id}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/20 border border-red-400/40 text-danger hover:bg-red-500 hover:text-ink transition-all disabled:opacity-50"
                    >
                      {busyId === img.id ? "…" : t("admin.portfolio.delete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending(null)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-line/20 text-ink-2 hover:bg-line/10 transition-all"
                    >
                      {t("admin.portfolio.keep")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPending(img.id)}
                  title={t("admin.portfolio.removeTitle")}
                  className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 border border-line/15 text-ink-2 hover:text-danger hover:border-red-400/50 flex items-center justify-center transition-all"
                >
                  <Icon name="trash" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── 2. REPORTS ─────────────────────────────────────────────────────────────

function ReportsSection() {
  const t = useT();
  const [tab, setTab] = useState("open");
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listConversationReports(tab).then(({ reports: rows, error: e }) => {
      if (e) setError(errText(e, "admin.errors.loadReports"));
      setReports(rows || []);
    });
  }, [tab]);

  useEffect(() => {
    setReports(null);
    load();
  }, [load]);

  // A resolved report leaves whichever list it no longer belongs to. On the
  // "all" tab it stays and just changes status.
  const onResolved = useCallback(
    (reportId, status) => {
      if (tab === "all") {
        setReports((rows) =>
          (rows || []).map((r) =>
            r.report_id === reportId
              ? { ...r, status, reviewed_at: new Date().toISOString() }
              : r
          )
        );
        return;
      }
      setReports((rows) => (rows || []).filter((r) => r.report_id !== reportId));
    },
    [tab]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {REPORT_TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => setTab(tabItem.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              tab === tabItem.key
                ? "border-accent bg-accent/15 text-accent-ink"
                : "border-line/10 text-ink-2 hover:border-accent/40 hover:bg-line/5"
            }`}
          >
            {t(`admin.reports.tabs.${tabItem.key}`)}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          title={t("admin.reports.reload")}
          className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-full border border-line/10 text-ink-2 hover:text-accent-ink hover:border-accent/40 transition-all"
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <ErrorLine>{error}</ErrorLine>

      {reports === null ? (
        <Spinner />
      ) : reports.length === 0 ? (
        <EmptyState>
          {tab === "open" ? (
            <span className="inline-flex items-center gap-2">
              <Icon name="check" size={16} className="text-accent-ink" /> {t("admin.reports.nothingOpen")}
            </span>
          ) : (
            t("admin.reports.none")
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <ReportCard key={r.report_id} report={r} onResolved={onResolved} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report: r, onResolved }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null);
  const [msgError, setMsgError] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const t = useT();
  const isOpen = r.status === "open";
  const reporterName = r.reporter_display_name || r.reporter_username || t("admin.reports.someone");
  const otherName = r.other_display_name || r.other_username || t("admin.reports.otherMemberFallback");

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && messages === null) {
      getAdminConversationMessages(r.conversation_id).then(
        ({ messages: rows, error: e }) => {
          if (e) setMsgError(errText(e, "admin.errors.loadConversation"));
          setMessages(rows || []);
        }
      );
    }
  }, [open, messages, r.conversation_id]);

  const resolve = useCallback(
    async (status) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const { error: e } = await resolveConversationReport(
        r.report_id,
        status,
        note.trim()
      );
      setBusy(false);
      if (e) {
        setError(errText(e, "admin.errors.updateReport"));
        return;
      }
      onResolved(r.report_id, status);
    },
    [busy, note, r.report_id, onResolved]
  );

  const statusTone =
    r.status === "open"
      ? "border-amber-400/30 bg-amber-400/10 text-warn"
      : r.status === "reviewed"
        ? "border-accent/30 bg-accent/10 text-accent-ink"
        : "border-line/10 bg-line/[0.04] text-ink-2";

  return (
    <article className="overflow-hidden rounded-[22px] border border-line/[0.11] bg-[#1d201f]/90">
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone}`}
          >
            {t(`admin.reports.status.${r.status}`)}
          </span>
          <p className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
            <Icon name="calendar" size={13} /> {formatDateTime(r.created_at)}
          </p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ReportParty
            label={t("admin.reports.reportedBy")}
            name={reporterName}
            username={r.reporter_username}
            avatar={r.reporter_avatar_url}
          />
          <ReportParty
            label={t("admin.reports.otherMember")}
            name={otherName}
            username={r.other_username}
            avatar={r.other_avatar_url}
            isBuilder={r.other_is_builder}
            isHidden={r.other_is_hidden}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-line/10 bg-raised p-3">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 mb-1">
            {t("admin.reports.reason")}
          </span>
          <p className="text-sm text-ink-2 whitespace-pre-wrap break-words leading-relaxed">
            <SmartText>{r.reason}</SmartText>
          </p>
        </div>

        {r.resolution_note && (
          <div className="mt-3 rounded-2xl border border-line/10 bg-black/20 p-3">
            <span className="block text-[10px] uppercase tracking-widest text-ink-3 mb-1">
              {t("admin.reports.note")}
              {r.reviewer_username ? ` · @${r.reviewer_username}` : ""}
            </span>
            <p className="text-sm text-ink-2 whitespace-pre-wrap break-words">
              {r.resolution_note}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-accent-ink transition-colors"
        >
          <Icon name="chat" size={14} />
          {open ? t("admin.reports.hideConversation") : t("admin.reports.readConversation", { n: r.message_count ?? 0 })}
        </button>

        {open && (
          <div className="mt-3 rounded-2xl border border-line/10 bg-black/25 p-3">
            <ErrorLine>{msgError}</ErrorLine>
            {messages === null ? (
              <Spinner small />
            ) : messages.length === 0 ? (
              <p className="text-sm text-ink-3">{t("admin.reports.noMessages")}</p>
            ) : (
              <ul className="bx-scroll max-h-80 overflow-y-auto space-y-2.5 pr-1">
                {messages.map((m) => (
                  <AdminMessage key={m.id} message={m} />
                ))}
              </ul>
            )}
          </div>
        )}

        {isOpen && (
          <div className="mt-4 border-t border-line/[0.07] pt-3 space-y-2.5">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t("admin.reports.notePlaceholder")}
              className="bx-scroll w-full rounded-xl bg-raised border border-line/10 px-3 py-2 text-sm text-ink placeholder:text-ink-3 outline-none focus:border-accent/50 resize-none"
            />
            <ErrorLine>{error}</ErrorLine>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => resolve("reviewed")}
                disabled={busy}
                className="px-4 py-2 rounded-full text-xs font-bold border border-accent/40 bg-accent/10 text-accent-ink hover:bg-accent hover:text-accent-fg transition-all disabled:opacity-50"
              >
                {t("admin.reports.markReviewed")}
              </button>
              <button
                type="button"
                onClick={() => resolve("dismissed")}
                disabled={busy}
                className="px-4 py-2 rounded-full text-xs font-semibold border border-line/15 text-ink-2 hover:bg-line/5 transition-all disabled:opacity-50"
              >
                {t("admin.reports.dismiss")}
              </button>
              <p className="text-[11px] text-ink-3">
                {t("admin.reports.explain")}
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ReportParty({ label, name, username, avatar, isBuilder, isHidden }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-line/10 bg-black/20 p-3">
      <span className="block text-[10px] uppercase tracking-widest text-ink-3 mb-2">
        {label}
      </span>
      <div className="flex items-center gap-2.5">
        <Avatar url={avatar} name={name} size={32} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{name}</p>
          {username && (
            <p className="text-[11px] text-ink-3 truncate">
              {isBuilder ? (
                <Link
                  href={profileHref(username)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent-ink transition-colors"
                >
                  @{username}
                </Link>
              ) : (
                `@${username}`
              )}
              {isHidden && <span className="text-warn">{t("admin.reports.hiddenSuffix")}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminMessage({ message: m }) {
  const t = useT();
  const name = m.sender_display_name || m.sender_username || t("admin.reports.user");
  const isImage = m.msg_type === "image" && m.meta?.url;

  return (
    <li className="flex items-start gap-2.5">
      <Avatar url={m.sender_avatar_url} name={name} size={28} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-3">
          <span className="text-ink-2 font-medium">{name}</span> ·{" "}
          {formatDateTime(m.created_at)}
        </p>
        {isImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicAsset(m.meta.url)}
              alt={m.body || t("chat.photo")}
              className="mt-1 rounded-xl max-h-48 w-auto object-cover border border-line/10"
              loading="lazy"
            />
            {m.body && (
              <p className="mt-1 text-[13px] text-ink whitespace-pre-wrap break-words">
                <SmartText>{m.body}</SmartText>
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-ink whitespace-pre-wrap break-words">
            <SmartText>{m.body}</SmartText>
          </p>
        )}
      </div>
    </li>
  );
}

// ─── 3. USERS ───────────────────────────────────────────────────────────────

// Read-only by design. Finding an account is the job; anything that acts on one
// belongs in the Builders tab, where the takedown lever already lives.
function UsersSection() {
  const t = useT();
  const [query, setQuery] = useState("");
  const search = useDebounced(query);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const id = ++requestRef.current;
    setUsers(null);
    setError(null);
    listAdminUsers(search).then(({ users: rows, error: e }) => {
      if (requestRef.current !== id) return; // a newer search already landed
      if (e) setError(errText(e, "admin.errors.loadUsers"));
      setUsers(rows || []);
    });
  }, [search]);

  return (
    <div className="space-y-4">
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder={t("admin.searchPlaceholder")}
        label={t("admin.users.searchAria")}
      />

      <ErrorLine>{error}</ErrorLine>

      {users === null ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState>
          {search ? t("admin.users.noMatch") : t("admin.users.none")}
        </EmptyState>
      ) : (
        <div className="card divide-y divide-line/[0.07] overflow-hidden">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Avatar url={u.avatar_url} name={u.display_name || u.username} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">
                  {u.display_name || u.username || t("admin.users.unnamed")}
                </p>
                <p className="text-[11px] text-ink-3 truncate">
                  {u.username ? `@${u.username}` : t("admin.users.noHandle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                {u.is_admin && (
                  <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-300">
                    {t("admin.users.admin")}
                  </span>
                )}
                {u.is_builder ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      u.is_hidden
                        ? "border-amber-400/30 bg-amber-400/10 text-warn"
                        : "border-accent/30 bg-accent/10 text-accent-ink"
                    }`}
                  >
                    {u.is_hidden ? t("admin.users.builderHidden") : t("admin.users.builder")}
                  </span>
                ) : (
                  <span className="rounded-full border border-line/10 bg-line/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-2">
                    {t("admin.users.member")}
                  </span>
                )}
                <span className="hidden sm:block text-[11px] text-ink-3 w-24 text-right">
                  {formatDate(u.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
