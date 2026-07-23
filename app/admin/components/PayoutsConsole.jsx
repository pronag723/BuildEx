"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveWithdrawal,
  listPayouts,
  markWithdrawalFailed,
  markWithdrawalSent,
  rejectWithdrawal,
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

function promptOptional(message, fallback = "") {
  const value = window.prompt(message, fallback);
  if (value === null) return null;
  return value.trim();
}

export default function PayoutsConsole() {
  const [payouts, setPayouts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const reload = useCallback(async () => {
    const { payouts: rows, error: loadError } = await listPayouts();
    setPayouts(rows);
    setError(loadError?.message || null);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold uppercase tracking-widest mb-2">
          <Icon name="wallet" size={13} /> Payouts console
        </div>
        <h1 className="text-2xl font-extrabold">Builder withdrawals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review requests, confirm the fee you will deduct, then record the manual payout after you send it.
        </p>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

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
            const name =
              p.studio?.name ||
              p.builder?.display_name ||
              p.builder?.username ||
              "Provider";
            return (
              <div key={p.id} className="glass rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[230px]">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-[11px] text-gray-500">
                    {p.payout_method === "usdt_erc20" ? "USDT ERC-20" : "USDT TRC-20"}
                    {" · "}<code>{short(p.destination)}</code>
                  </p>
                  <div className="flex items-start gap-2 mt-1">
                    <code className="min-w-0 flex-1 text-[11px] text-gray-300 break-all select-all">
                      {p.destination || "No destination recorded"}
                    </code>
                    {p.destination && (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(p.destination);
                          setCopiedId(p.id);
                          window.setTimeout(() => setCopiedId(null), 1500);
                        }}
                        className="shrink-0 px-2 py-1 rounded-md border border-white/15 text-[10px] text-gray-300 hover:text-white"
                      >
                        {copiedId === p.id ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  {p.fee_amount_cents != null && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      Requested {formatPrice(p.amount_cents)} · Net {formatPrice(p.net_amount_cents ?? p.amount_cents)}
                    </p>
                  )}
                  {p.payout_reference && (
                    <p className="text-[11px] text-sky-300 mt-1">
                      Ref <code>{short(p.payout_reference, 12, 8)}</code>
                    </p>
                  )}
                  {p.admin_note && <p className="text-[11px] text-gray-400 mt-1">{p.admin_note}</p>}
                  {p.rejection_reason && <p className="text-[11px] text-red-300 mt-1">{p.rejection_reason}</p>}
                </div>
                <span className="font-bold text-[#4ade80]">{formatPrice(p.amount_cents)}</span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta[1]}`}>
                  {meta[0]}
                </span>

                {p.status === "requested" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const fee = window.prompt(
                          "Fee to deduct from this withdrawal (USD):",
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
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[#4ade80] text-black"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(
                          "Reason shown to the builder:",
                          "Destination could not be verified.",
                        );
                        if (reason !== null) {
                          act(
                            () => rejectWithdrawal(p.id, reason),
                            "Withdrawal rejected and balance released.",
                          );
                        }
                      }}
                      className="px-3 py-1.5 rounded-full text-[11px] border border-red-400/30 text-red-300"
                    >
                      Reject
                    </button>
                  </>
                )}

                {p.status === "approved" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reference = promptOptional(
                          "Paste the blockchain TXID, exchange payout ID, or leave blank:",
                        );
                        if (reference === null) return;
                        const note = promptOptional(
                          "Optional private admin note:",
                          "Sent manually by admin.",
                        );
                        if (note === null) return;
                        act(
                          () => markWithdrawalSent(p.id, reference, note),
                          "Withdrawal marked as sent.",
                        );
                      }}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[#4ade80] text-black"
                    >
                      Mark sent
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reason = promptOptional(
                          "Failure reason shown to the builder:",
                          "Manual payout failed; funds released.",
                        );
                        if (reason === null) return;
                        const note = promptOptional(
                          "Optional private admin note:",
                          "",
                        );
                        if (note === null) return;
                        act(
                          () => markWithdrawalFailed(p.id, reason, note),
                          "Withdrawal marked as failed and funds released.",
                        );
                      }}
                      className="px-3 py-1.5 rounded-full text-[11px] border border-red-400/30 text-red-300"
                    >
                      Mark failed
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
