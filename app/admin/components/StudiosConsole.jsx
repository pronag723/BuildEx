"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx Studios — admin management console (migration 0026).
// Admins (profiles.is_admin) create studios, mint capped promo codes, watch
// redemptions, and settle the override ledger. Every mutation routes through the
// is_admin-gated RPCs in lib/studios/api.js, which re-check server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../lib/icons";
import { formatPrice } from "../../../lib/pricing";
import {
  listStudios,
  listStudioCodes,
  listStudioOverrides,
  createStudio,
  setStudioStatus,
  createStudioCode,
  setCodeStatus,
  markOverridePaid,
} from "../../../lib/studios/api";

function pct(bps) {
  return `${(Number(bps) || 0) / 100}%`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StudiosConsole() {
  const [studios, setStudios] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(() => {
    setStudios(null);
    setError(null);
    listStudios().then(({ studios: rows, error: e }) => {
      if (e) setError(e.message || "Failed to load studios");
      setStudios(rows || []);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold uppercase tracking-widest mb-2">
            <Icon name="studio" size={13} /> BuildEx Studios
          </div>
          <h1 className="text-2xl font-extrabold">Studio partners</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create partner studios, mint capped referral codes, and settle the
            override ledger.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="px-4 py-2 rounded-full text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-all"
        >
          {creating ? "Cancel" : "New studio"}
        </button>
      </header>

      {creating && (
        <NewStudioForm
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {studios === null ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
        </div>
      ) : studios.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-gray-500">
          No studios yet. Create your first partner above.
        </div>
      ) : (
        <div className="space-y-4">
          {studios.map((s) => (
            <StudioRow key={s.id} studio={s} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">{label}</span>
      {children}
    </label>
  );
}

const INPUT =
  "w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/20";

function NewStudioForm({ onCreated }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bio, setBio] = useState("");
  const [sharePct, setSharePct] = useState(40);
  const [promoPct, setPromoPct] = useState(11);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await createStudio({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      logoUrl: logoUrl.trim() || null,
      bio: bio.trim() || null,
      shareBps: Math.round(Number(sharePct) * 100),
      promoBps: Math.round(Number(promoPct) * 100),
    });
    setBusy(false);
    if (error) {
      setErr(error.message || "Couldn't create the studio.");
      return;
    }
    onCreated?.();
  }, [busy, name, slug, logoUrl, bio, sharePct, promoPct, onCreated]);

  return (
    <div className="glass rounded-3xl p-5 sm:p-6 space-y-4 border border-emerald-500/20">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Studio name">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Atlas Build Co." />
        </Field>
        <Field label="Slug (storefront URL)">
          <input className={INPUT} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="atlas" />
        </Field>
        <Field label="Logo URL (optional)">
          <input className={INPUT} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Studio share %">
            <input type="number" min={0} max={100} className={INPUT} value={sharePct} onChange={(e) => setSharePct(e.target.value)} />
          </Field>
          <Field label="Promo rate %">
            <input type="number" min={0} max={100} className={INPUT} value={promoPct} onChange={(e) => setPromoPct(e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Bio (optional)">
        <textarea className={`${INPUT} resize-y`} rows={2} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short studio description for the storefront." />
      </Field>
      <p className="text-[11px] text-gray-500">
        Share = the studio&apos;s cut of our commission (default 40%). Promo = the
        flat commission a referred builder pays for their first 4 months.
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim() || !slug.trim()}
          className="px-5 py-2.5 rounded-full text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-all disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create studio"}
        </button>
      </div>
    </div>
  );
}

function StudioRow({ studio, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const suspended = studio.status === "suspended";

  const toggleStatus = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await setStudioStatus({ id: studio.id, status: suspended ? "active" : "suspended" });
    setBusy(false);
    onChanged?.();
  }, [busy, studio.id, suspended, onChanged]);

  return (
    <div className={`glass rounded-3xl p-5 sm:p-6 space-y-3 ${suspended ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold">{studio.name}</h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${suspended ? "bg-red-500/15 text-red-300 border-red-500/30" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"}`}>
              {studio.status}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            /studios?s={studio.slug} · share {pct(studio.studio_share_bps)} · promo {pct(studio.promo_bps)}
            {" · "}
            <Link href={`/studios?s=${encodeURIComponent(studio.slug)}`} className="text-emerald-300 hover:underline">
              view storefront
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={toggleStatus}
            disabled={busy}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-white/15 text-gray-200 hover:bg-white/5 transition-all disabled:opacity-50"
          >
            {suspended ? "Reactivate" : "Suspend"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-500/30 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
          >
            {expanded ? "Close" : "Manage"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="pt-3 border-t border-white/[0.06] space-y-5">
          <CodesPanel studioId={studio.id} />
          <OverridesPanel studioId={studio.id} />
        </div>
      )}
    </div>
  );
}

function CodesPanel({ studioId }) {
  const [codes, setCodes] = useState(null);
  const [code, setCode] = useState("");
  const [max, setMax] = useState(25);
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const reload = useCallback(() => {
    listStudioCodes(studioId).then(({ codes: rows }) => setCodes(rows || []));
  }, [studioId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const mint = useCallback(async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    setErr(null);
    const { error } = await createStudioCode({
      studioId,
      code: code.trim(),
      maxRedemptions: Math.max(1, Math.round(Number(max) || 1)),
      expiresAt: expires ? new Date(expires).toISOString() : null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message || "Couldn't create the code.");
      return;
    }
    setCode("");
    reload();
  }, [busy, code, max, expires, studioId, reload]);

  const toggle = useCallback(
    async (c) => {
      await setCodeStatus({ id: c.id, status: c.status === "active" ? "disabled" : "active" });
      reload();
    },
    [reload]
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <Icon name="handshake" size={15} className="text-emerald-300" /> Referral codes
      </h3>

      {codes === null ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : codes.length === 0 ? (
        <p className="text-xs text-gray-500">No codes minted yet.</p>
      ) : (
        <ul className="space-y-2">
          {codes.map((c) => {
            const exhausted = c.redemptions_used >= c.max_redemptions;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/10 flex-wrap">
                <div className="min-w-0">
                  <span className="font-mono font-bold text-sm text-emerald-300">{c.code}</span>
                  <span className="text-[11px] text-gray-500 ml-2">
                    {c.redemptions_used}/{c.max_redemptions} used
                    {c.expires_at && ` · expires ${formatDate(c.expires_at)}`}
                    {exhausted && " · full"}
                    {c.status === "disabled" && " · disabled"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  className="text-[11px] font-semibold text-gray-300 hover:text-emerald-300"
                >
                  {c.status === "active" ? "Disable" : "Enable"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        <Field label="New code">
          <input className={INPUT} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ATLAS" />
        </Field>
        <Field label="Max uses">
          <input type="number" min={1} className={`${INPUT} w-24`} value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
        <Field label="Expires (optional)">
          <input type="date" className={INPUT} value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <button
          type="button"
          onClick={mint}
          disabled={busy || !code.trim()}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-500/90 text-black hover:bg-emerald-400 transition-all disabled:opacity-50"
        >
          Mint
        </button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}

function OverridesPanel({ studioId }) {
  const [overrides, setOverrides] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(() => {
    listStudioOverrides(studioId).then(({ overrides: rows }) => setOverrides(rows || []));
  }, [studioId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const accrued = (overrides || []).filter((o) => o.status === "accrued");
  const accruedTotal = accrued.reduce((sum, o) => sum + (o.amount_cents || 0), 0);

  const pay = useCallback(
    async (id) => {
      setBusyId(id);
      await markOverridePaid({ id });
      setBusyId(null);
      reload();
    },
    [reload]
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <Icon name="wallet" size={15} className="text-emerald-300" /> Override ledger
        {accrued.length > 0 && (
          <span className="text-[11px] font-normal text-gray-500">
            · {formatPrice(accruedTotal)} accrued, unpaid
          </span>
        )}
      </h3>

      {overrides === null ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : overrides.length === 0 ? (
        <p className="text-xs text-gray-500">No override earned yet.</p>
      ) : (
        <ul className="space-y-2">
          {overrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/10 flex-wrap">
              <div className="min-w-0">
                <span className="font-bold text-sm text-gray-200">{formatPrice(o.amount_cents)}</span>
                <span className="text-[11px] text-gray-500 ml-2">
                  {formatDate(o.created_at)}
                  {" · "}
                  <span
                    className={
                      o.status === "paid"
                        ? "text-emerald-300"
                        : o.status === "clawed_back"
                        ? "text-red-300"
                        : "text-amber-300"
                    }
                  >
                    {o.status}
                  </span>
                </span>
              </div>
              {o.status === "accrued" && (
                <button
                  type="button"
                  onClick={() => pay(o.id)}
                  disabled={busyId === o.id}
                  className="text-[11px] font-semibold text-emerald-300 hover:underline disabled:opacity-50"
                >
                  {busyId === o.id ? "…" : "Mark paid"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
