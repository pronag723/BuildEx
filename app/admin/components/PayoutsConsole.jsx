"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveWithdrawal,
  confirmPayoutBatch,
  listPayouts,
  reconcilePayoutBatch,
  rejectWithdrawal,
  startPayoutBatch,
} from "../../../lib/payouts/api";
import { formatPrice } from "../../../lib/pricing";
import { Icon } from "../../../lib/icons";

const STATUS_META = {
  requested: ["Review", "bg-amber-400/10 border-amber-400/30 text-amber-300"],
  approved: ["Approved", "bg-sky-400/10 border-sky-400/30 text-sky-300"],
  processing: ["Processing", "bg-violet-400/10 border-violet-400/30 text-violet-300"],
  sent: ["Sent", "bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]"],
  rejected: ["Rejected", "bg-red-400/10 border-red-400/30 text-red-300"],
  failed: ["Failed", "bg-red-400/10 border-red-400/30 text-red-300"],
  cancelled: ["Cancelled", "bg-gray-400/10 border-gray-400/30 text-gray-300"],
};

function short(value, head = 8, tail = 6) {
  const text = String(value || "");
  return text.length > head + tail + 1
    ? `${text.slice(0, head)}…${text.slice(-tail)}`
    : text;
}

export default function PayoutsConsole() {
  const [payouts, setPayouts] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [batchId, setBatchId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async () => {
    const { payouts: rows, error: loadError } = await listPayouts();
    setPayouts(rows);
    setError(loadError?.message || null);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const approved = useMemo(
    () => (payouts || []).filter((p) => p.status === "approved"),
    [payouts],
  );
  const selectedTotal = approved.reduce(
    (sum, p) => sum + (selected.has(p.id) ? Number(p.amount_cents) || 0 : 0),
    0,
  );

  async function act(action, success) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: actionError } = await action();
    setBusy(false);
    if (actionError) {
      setError(actionError.message || "Action failed.");
      return;
    }
    setNotice(success);
    await reload();
  }

  async function sendBatch() {
    if (!selected.size) return;
    setBusy(true);
    setError(null);
    const { batchId: id, count, error: sendError } =
      await startPayoutBatch(Array.from(selected));
    setBusy(false);
    if (sendError || !id) {
      setError(sendError?.message || "Could not create payout batch.");
      return;
    }
    setBatchId(id);
    setSelected(new Set());
    setNotice(`Batch created for ${count} withdrawal${count === 1 ? "" : "s"}. Enter the NOWPayments 2FA code.`);
    await reload();
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { ok, error: verifyError } = await confirmPayoutBatch(batchId, code);
    setBusy(false);
    if (verifyError || !ok) {
      setError(verifyError?.message || "2FA verification failed.");
      return;
    }
    setCode("");
    setNotice("Batch accepted by NOWPayments. Reconcile it after provider processing completes.");
    await reload();
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold uppercase tracking-widest mb-2">
          <Icon name="wallet" size={13} /> Payouts console
        </div>
        <h1 className="text-2xl font-extrabold">Builder withdrawals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review requests, approve valid wallets, then send approved withdrawals through NOWPayments.
        </p>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      {batchId && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 flex-wrap border border-sky-400/30">
          <span className="text-sm text-gray-300 flex-1">
            Batch <code className="text-sky-300">{short(batchId, 6, 4)}</code>
          </span>
          <input value={code} onChange={(e) => setCode(e.target.value)}
            inputMode="numeric" placeholder="2FA code"
            className="px-4 py-2 rounded-full bg-black/30 border border-white/10 text-sm w-32" />
          <button type="button" onClick={verify} disabled={busy || !code.trim()}
            className="px-5 py-2 rounded-full text-sm font-bold bg-sky-400 text-black disabled:opacity-40">
            Confirm 2FA
          </button>
          <button type="button"
            onClick={() => act(() => reconcilePayoutBatch(batchId), "Provider status reconciled.")}
            disabled={busy}
            className="px-4 py-2 rounded-full text-xs font-semibold border border-white/15">
            Reconcile
          </button>
        </div>
      )}

      {approved.length > 0 && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => setSelected(
            selected.size === approved.length ? new Set() : new Set(approved.map((p) => p.id))
          )} className="text-xs font-semibold text-[#4ade80]">
            {selected.size === approved.length ? "Clear" : "Select all approved"}
          </button>
          <span className="text-sm text-gray-400 flex-1">
            {selected.size} selected · {formatPrice(selectedTotal)}
          </span>
          <button type="button" onClick={sendBatch} disabled={busy || !selected.size}
            className="px-5 py-2 rounded-full text-sm font-bold bg-[#4ade80] text-black disabled:opacity-40">
            Create payout batch
          </button>
        </div>
      )}

      {payouts === null ? (
        <p className="text-sm text-gray-500 py-12 text-center">Loading…</p>
      ) : payouts.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-gray-500">
          No withdrawal requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {payouts.map((p) => {
            const meta = STATUS_META[p.status] || [p.status, "border-white/10 text-gray-300"];
            const name = p.builder?.display_name || p.builder?.username || "Builder";
            const selectable = p.status === "approved";
            return (
              <div key={p.id} className="glass rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                {selectable ? (
                  <input type="checkbox" checked={selected.has(p.id)}
                    onChange={() => setSelected((previous) => {
                      const next = new Set(previous);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      return next;
                    })} className="accent-[#4ade80]" />
                ) : <span className="w-4" />}
                <div className="flex-1 min-w-[210px]">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-[11px] text-gray-500">
                    {p.payout_method === "usdt_erc20" ? "USDT ERC-20" : "USDT TRC-20"}
                    {" · "}<code>{short(p.destination)}</code>
                  </p>
                  {p.rejection_reason && <p className="text-[11px] text-red-300 mt-1">{p.rejection_reason}</p>}
                </div>
                <span className="font-bold text-[#4ade80]">{formatPrice(p.amount_cents)}</span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta[1]}`}>
                  {meta[0]}
                </span>
                {p.status === "requested" && (
                  <>
                    <button type="button" disabled={busy}
                      onClick={() => {
                        const fee = window.prompt(
                          "Provider/network fee in USD to deduct from this withdrawal:",
                          p.payout_method === "usdt_erc20" ? "5.00" : "1.00",
                        );
                        if (fee === null) return;
                        const cents = Math.round(Number(fee) * 100);
                        if (!Number.isFinite(cents) || cents < 0 || cents >= p.amount_cents) {
                          setError("Enter a valid fee lower than the withdrawal amount.");
                          return;
                        }
                        act(() => approveWithdrawal(p.id, cents), "Withdrawal approved.");
                      }}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[#4ade80] text-black">
                      Approve
                    </button>
                    <button type="button" disabled={busy}
                      onClick={() => {
                        const reason = window.prompt("Reason shown to the builder:", "Destination could not be verified.");
                        if (reason !== null) act(() => rejectWithdrawal(p.id, reason), "Withdrawal rejected and balance released.");
                      }}
                      className="px-3 py-1.5 rounded-full text-[11px] border border-red-400/30 text-red-300">
                      Reject
                    </button>
                  </>
                )}
                {p.status === "failed" && (
                  <button type="button" disabled={busy}
                    onClick={() => act(() => rejectWithdrawal(p.id, "Provider payout failed; funds released."), "Failed withdrawal released.")}
                    className="px-3 py-1.5 rounded-full text-[11px] border border-white/15">
                    Release funds
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
