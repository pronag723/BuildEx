"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Admin dispute queue (Stage 10)
// Lists every OPEN dispute (via the admin-only list_open_disputes RPC) and lets
// an admin resolve each one by releasing the escrow to the builder or refunding
// the buyer. Both actions route through resolve_dispute, which re-checks
// profiles.is_admin server-side — this page is just the operator surface.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import { listOpenDisputes, resolveDispute } from "../../../lib/disputes/api";
import { formatPrice, SIZE_META } from "../../../lib/pricing";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import { useGradientBackground } from "../../../lib/ui/useGradientBackground";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  useRequireAuth();
  const { profile, status } = useAuth();
  const isAdmin = profile?.is_admin === true;

  // ── Theme + nav (mirrors the rest of the catalog) ─────────────────────────
  const [theme, setTheme] = useState(null);
  const isLight = theme === "light";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { gradientRef, edgeGlowRef } = useGradientBackground();
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);
  useEffect(() => {
    if (!theme) return;
    const html = document.documentElement;
    html.classList.toggle("light", isLight);
    html.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  const ready = status === "authenticated" && theme !== null;

  return (
    <div
      className={`builder-profile-root ${isLight ? "light" : ""} catalog-root min-h-screen flex flex-col`}
    >
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

      <CatalogNavbar
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />
      <CatalogMobileMenu
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <main className="relative z-10 flex-1 px-4 pt-28 pb-20">
        <div className="max-w-3xl mx-auto">
          {!ready ? (
            <Spinner />
          ) : !isAdmin ? (
            <NotAuthorized />
          ) : (
            <DisputeQueue />
          )}
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="glass rounded-3xl p-8 text-center">
      <h1 className="text-xl font-extrabold mb-2">Admins only</h1>
      <p className="text-sm text-gray-400">
        This page is reserved for the BuildEx team.
      </p>
      <Link
        href="/orders"
        className="inline-block mt-5 px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black transition-all"
      >
        Back to orders
      </Link>
    </div>
  );
}

function DisputeQueue() {
  const [disputes, setDisputes] = useState(null); // null = loading
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setDisputes(null);
    setError(null);
    listOpenDisputes().then(({ disputes: rows, error: e }) => {
      if (e) setError(e.message || "Failed to load disputes");
      setDisputes(rows);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (disputes === null) return <Spinner />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Open disputes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Resolve each by releasing the escrow to the builder or refunding the
          buyer. Refunds and payouts are wired up in the payment stage.
        </p>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {disputes.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-gray-500">
          No open disputes. 🎉
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((d) => (
            <DisputeRow key={d.dispute_id} dispute={d} onResolved={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function DisputeRow({ dispute, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [note, setNote] = useState("");

  const sizeLabel =
    dispute.size_label || SIZE_META[dispute.building_size]?.label || dispute.building_size;

  const resolve = useCallback(
    async (outcome) => {
      if (busy) return;
      setBusy(true);
      setErrMsg(null);
      const { error } = await resolveDispute({
        orderId: dispute.order_id,
        outcome,
        note: note.trim() || null,
      });
      if (error) {
        setBusy(false);
        setErrMsg(error.message || "Couldn't resolve the dispute.");
        return;
      }
      // The row drops out of the open queue on success.
      onResolved?.();
    },
    [busy, dispute.order_id, note, onResolved]
  );

  return (
    <div className="glass rounded-3xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 uppercase tracking-widest">
            {sizeLabel} · <span className="capitalize">{dispute.style}</span>
          </p>
          <p className="text-sm text-gray-300 mt-0.5">
            <strong className="text-gray-100">
              {dispute.buyer_display_name || dispute.buyer_username || "Buyer"}
            </strong>{" "}
            vs{" "}
            <strong className="text-gray-100">
              {dispute.builder_display_name || dispute.builder_username || "Builder"}
            </strong>
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Opened {formatDate(dispute.opened_at)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-[#4ade80] text-sm">
            {formatPrice(dispute.price_kopecks)}
          </p>
          <Link
            href={`/orders/?id=${encodeURIComponent(dispute.order_id)}`}
            className="text-[11px] font-semibold text-[#4ade80] hover:underline"
          >
            View order
          </Link>
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-black/30 border border-white/10">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">
          Buyer's reason
        </span>
        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
          {dispute.reason}
        </p>
      </div>

      <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">
          Brief
        </span>
        <p className="text-sm text-gray-400 whitespace-pre-wrap break-words leading-relaxed line-clamp-4">
          {dispute.brief}
        </p>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        rows={2}
        maxLength={4000}
        placeholder="Resolution note (optional) — visible to both parties."
        className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-[#4ade80]/60 focus:outline-none focus:ring-2 focus:ring-[#4ade80]/20 resize-y"
      />

      {errMsg && <p className="text-sm text-red-400">{errMsg}</p>}

      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          onClick={() => resolve("refund")}
          disabled={busy}
          className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/15 text-gray-200 hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-wait"
        >
          {busy ? "Working…" : "Refund buyer"}
        </button>
        <button
          type="button"
          onClick={() => resolve("release")}
          disabled={busy}
          className="px-5 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-wait"
        >
          {busy ? "Working…" : "Release to builder"}
        </button>
      </div>
    </div>
  );
}
