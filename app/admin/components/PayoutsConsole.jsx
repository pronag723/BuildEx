"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Payouts console (admin)
// Operator surface for paying builders. Lists the payout queue (migration 0033)
// and drives NOWPayments Mass Payout via the create-payout / verify-payout Edge
// Functions (lib/payouts/api.js):
//   • select pending rows → Send batch → enter the emailed 2FA code → Confirm.
//   • blocked (no wallet) / failed rows → Re-queue once the builder fixes it.
// All privileged work re-checks is_admin server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listPayouts,
  startPayoutBatch,
  confirmPayoutBatch,
  requeuePayout,
  markFiatPayoutSent,
} from "../../../lib/payouts/api";
import { formatPrice } from "../../../lib/pricing";
import { Icon } from "../../../lib/icons";

const STATUS_META = {
  pending: { label: "Pending", cls: "bg-amber-400/10 border-amber-400/30 text-amber-300" },
  processing: { label: "Processing", cls: "bg-sky-400/10 border-sky-400/30 text-sky-300" },
  sent: { label: "Sent", cls: "bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]" },
  failed: { label: "Failed", cls: "bg-red-400/10 border-red-400/30 text-red-300" },
  blocked: { label: "Blocked", cls: "bg-gray-400/10 border-gray-400/30 text-gray-300" },
  fiat_card_pending: { label: "Card review", cls: "bg-violet-400/10 border-violet-400/30 text-violet-300" },
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shorten(s, head = 8, tail = 6) {
  if (!s) return "";
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

export default function PayoutsConsole() {
  const [payouts, setPayouts] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  // Two-step send: after a batch is created we hold its id and ask for the code.
  const [batchId, setBatchId] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(() => {
    setPayouts(null);
    setError(null);
    listPayouts().then(({ payouts: rows, error: e }) => {
      if (e) setError(e.message || "Failed to load payouts");
      setPayouts(rows || []);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const pending = useMemo(
    () => (payouts || []).filter((p) => p.status === "pending"),
    [payouts]
  );

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllPending = useCallback(() => {
    setSelected((prev) =>
      prev.size === pending.length ? new Set() : new Set(pending.map((p) => p.id))
    );
  }, [pending]);

  const selectedTotal = useMemo(() => {
    let cents = 0;
    for (const p of pending) if (selected.has(p.id)) cents += Number(p.amount_cents) || 0;
    return cents;
  }, [pending, selected]);

  const send = useCallback(async () => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const ids = Array.from(selected);
    const { batchId: id, count, error: e } = await startPayoutBatch(ids);
    setBusy(false);
    if (e || !id) {
      setError(e?.message || "Could not create the payout batch.");
      return;
    }
    setBatchId(id);
    setSelected(new Set());
    setNotice(
      `Batch created for ${count} payout${count === 1 ? "" : "s"}. NOWPayments emailed a 2FA code — enter it below to send.`
    );
    reload();
  }, [busy, selected, reload]);

  const confirm = useCallback(async () => {
    if (busy || !batchId || !code.trim()) return;
    setBusy(true);
    setError(null);
    const { ok, error: e } = await confirmPayoutBatch(batchId, code);
    setBusy(false);
    if (e || !ok) {
      setError(e?.message || "Could not confirm the batch. Check the code and retry.");
      return;
    }
    setBatchId(null);
    setCode("");
    setNotice("Payouts sent.");
    reload();
  }, [busy, batchId, code, reload]);

  const onRequeue = useCallback(
    async (id) => {
      setError(null);
      const { error: e } = await requeuePayout(id);
      if (e) {
        setError(e.message || "Could not re-queue this payout.");
        return;
      }
      reload();
    },
    [reload]
  );

  const onMarkFiatSent = useCallback(
    async (id) => {
      setError(null);
      const { error: e } = await markFiatPayoutSent(
        id,
        "Completed through NOWPayments off-ramp dashboard."
      );
      if (e) {
        setError(e.message || "Could not mark this payout as sent.");
        return;
      }
      reload();
    },
    [reload]
  );

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold uppercase tracking-widest mb-2">
          <Icon name="wallet" size={13} /> Payouts console
        </div>
        <h1 className="text-2xl font-extrabold">Builder payouts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pay builders their earnings in USDT. Select pending payouts, send them as
          one NOWPayments batch, then confirm with the 2FA code.
        </p>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      {/* 2FA confirm bar — shown after a batch is created. */}
      {batchId && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 flex-wrap border border-sky-400/30">
          <span className="text-sm text-gray-300 flex-1 min-w-[200px]">
            Batch <code className="text-sky-300">{shorten(batchId, 6, 4)}</code> awaiting 2FA confirmation.
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="2FA code"
            className="px-4 py-2 rounded-full bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-sky-400/60 focus:outline-none w-32"
          />
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !code.trim()}
            className="px-5 py-2 rounded-full text-sm font-bold bg-sky-400 text-black hover:bg-sky-300 transition-all disabled:opacity-50 disabled:cursor-wait"
          >
            {busy ? "Confirming…" : "Confirm & send"}
          </button>
          <button
            type="button"
            onClick={() => {
              setBatchId(null);
              setCode("");
            }}
            disabled={busy}
            className="px-4 py-2 rounded-full text-xs font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Send bar — selection summary + action. */}
      {!batchId && pending.length > 0 && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={selectAllPending}
            className="text-xs font-semibold text-[#4ade80] hover:underline"
          >
            {selected.size === pending.length ? "Clear selection" : "Select all pending"}
          </button>
          <span className="text-sm text-gray-400 flex-1">
            {selected.size} selected · {formatPrice(selectedTotal)}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={busy || selected.size === 0}
            className="px-5 py-2 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-wait"
          >
            {busy ? "Creating batch…" : `Send batch (${selected.size})`}
          </button>
        </div>
      )}

      {payouts === null ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        </div>
      ) : payouts.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-gray-500">
          No payouts yet. They appear here when an order completes.
        </div>
      ) : (
        <div className="space-y-3">
          {payouts.map((p) => (
            <PayoutRow
              key={p.id}
              payout={p}
              selectable={!batchId && p.status === "pending"}
              checked={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
              onRequeue={() => onRequeue(p.id)}
              onMarkFiatSent={() => onMarkFiatSent(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PayoutRow({ payout: p, selectable, checked, onToggle, onRequeue, onMarkFiatSent }) {
  const meta = STATUS_META[p.status] || STATUS_META.pending;
  const name = p.builder?.display_name || p.builder?.username || "Builder";
  const canRequeue = p.status === "blocked" || p.status === "failed";
  const isFiatCard = p.status === "fiat_card_pending";

  return (
    <div className="glass rounded-2xl p-4 flex items-center gap-3 flex-wrap">
      {selectable ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="w-4 h-4 accent-[#4ade80] flex-shrink-0"
          aria-label={`Select payout to ${name}`}
        />
      ) : (
        <span className="w-4 flex-shrink-0" aria-hidden="true" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-100 truncate">{name}</p>
        <p className="text-[11px] text-gray-500 truncate">
          {p.destination ? (
            <>{isFiatCard ? "Reference" : "Wallet"} <code className="text-gray-400">{shorten(p.destination)}</code></>
          ) : (
            <span className="text-gray-500 italic">no payout destination on file</span>
          )}{" "}
          · {formatDate(p.created_at)}
        </p>
      </div>

      <span className="font-bold text-[#4ade80] text-sm flex-shrink-0">
        {formatPrice(p.amount_cents)}
      </span>

      <span
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 ${meta.cls}`}
      >
        {meta.label}
      </span>

      {canRequeue && (
        <button
          type="button"
          onClick={onRequeue}
          className="px-3 py-1.5 rounded-full text-[11px] font-semibold border border-white/15 text-gray-200 hover:bg-white/5 transition-all flex-shrink-0"
        >
          Re-queue
        </button>
      )}

      {isFiatCard && (
        <button
          type="button"
          onClick={onMarkFiatSent}
          className="px-3 py-1.5 rounded-full text-[11px] font-semibold border border-violet-300/30 text-violet-200 hover:bg-violet-400/10 transition-all flex-shrink-0"
        >
          Mark sent
        </button>
      )}
    </div>
  );
}
