"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  approveWithdrawal,
  createPayoutBatch,
  listPayouts,
  markWithdrawalFailed,
  markWithdrawalSent,
  reconcilePayoutBatch,
  rejectWithdrawal,
  verifyPayoutBatch,
} from "../../../lib/payouts/api";
import { getAdminUserOrders } from "../../../lib/admin/api";
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
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);

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

  async function showHistory(payout) {
    setHistory({ name: payout.builder?.display_name || payout.builder?.username || "Builder", orders: null });
    setHistoryError(null);
    const { orders, error: loadError } = await getAdminUserOrders(payout.builder_id);
    if (loadError) setHistoryError(loadError.message || "Could not load order history.");
    setHistory((current) => (current ? { ...current, orders } : current));
  }

  async function sendWeeklyBatch() {
    const approved = (payouts || []).filter((payout) => payout.status === "approved");
    if (!approved.length) return;
    setBusy(true);
    setError(null);
    const { data, error: createError } = await createPayoutBatch(
      approved.map((payout) => payout.id),
    );
    if (createError || !data?.batchId) {
      setBusy(false);
      setError(createError?.message || "Could not create the payout batch.");
      return;
    }
    const code = window.prompt(
      `NOWPayments batch ${data.batchId} created for ${approved.length} withdrawal(s). Enter the 2FA code:`,
    );
    if (code === null) {
      setBusy(false);
      setNotice(`Batch ${data.batchId} is awaiting 2FA verification.`);
      await reload();
      return;
    }
    const { error: verifyError } = await verifyPayoutBatch(data.batchId, code.trim());
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message || "2FA verification failed.");
    } else {
      setNotice(`Weekly batch ${data.batchId} verified and processing.`);
    }
    await reload();
  }

  async function reconcileProcessing() {
    const batchIds = [...new Set(
      (payouts || [])
        .filter((payout) => payout.status === "processing" && payout.provider_batch_id)
        .map((payout) => payout.provider_batch_id),
    )];
    if (!batchIds.length) return;
    setBusy(true);
    const results = await Promise.all(batchIds.map(reconcilePayoutBatch));
    setBusy(false);
    const failed = results.find((result) => result.error);
    setError(failed?.error?.message || null);
    if (!failed) setNotice("Payout batch statuses reconciled.");
    await reload();
  }

  async function verifyProcessingBatch() {
    const batchIds = [...new Set(
      (payouts || [])
        .filter((payout) => payout.status === "processing" && payout.provider_batch_id)
        .map((payout) => payout.provider_batch_id),
    )];
    if (!batchIds.length) return;
    const batchId = window.prompt(
      "NOWPayments batch ID to verify:",
      batchIds[0],
    );
    if (!batchId) return;
    const code = window.prompt("Enter the NOWPayments 2FA code:");
    if (!code) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await verifyPayoutBatch(batchId.trim(), code.trim());
    setBusy(false);
    if (verifyError) setError(verifyError.message || "2FA verification failed.");
    else setNotice(`Batch ${batchId.trim()} verified and processing.`);
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
          Review requests, then send approved USDT-BSC withdrawals in the weekly custody batch.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !(payouts || []).some((payout) => payout.status === "approved")}
          onClick={sendWeeklyBatch}
          className="rounded-xl bg-[#4ade80] px-4 py-2 text-xs font-bold text-black disabled:opacity-40"
        >
          Send approved weekly batch
        </button>
        <button
          type="button"
          disabled={busy || !(payouts || []).some((payout) => payout.status === "processing")}
          onClick={verifyProcessingBatch}
          className="rounded-xl border border-[#4ade80]/30 px-4 py-2 text-xs font-semibold text-[#4ade80] disabled:opacity-40"
        >
          Verify batch with 2FA
        </button>
        <button
          type="button"
          disabled={busy || !(payouts || []).some((payout) => payout.status === "processing")}
          onClick={reconcileProcessing}
          className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-gray-300 disabled:opacity-40"
        >
          Reconcile processing batches
        </button>
      </div>

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
              <article key={p.id} className="overflow-hidden rounded-[24px] border border-emerald-400/30 bg-[#1b1f1d]/95 transition-all duration-200 hover:border-emerald-400/55 hover:shadow-[0_14px_45px_rgba(16,185,129,0.07)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3.5 sm:px-6">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Payout #{String(p.id).slice(0, 8)}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${meta[1]}`}>{meta[0]}</span>
                  </div>
                  <p className="inline-flex items-center gap-1.5 text-[11px] text-gray-500"><Icon name="calendar" size={13} /> Requested {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
                <div className="grid gap-5 px-5 py-4 sm:px-6 md:grid-cols-2 xl:grid-cols-[1fr_1.5fr_.65fr_auto] xl:items-center">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Requester</p>
                  {p.builder?.username ? <Link href={`/chats?to=${encodeURIComponent(p.builder.username)}`} className="mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate text-base font-bold text-white transition-colors hover:text-emerald-300"><span className="truncate">{name}</span> <span className="text-emerald-300">@{p.builder.username}</span><Icon name="chat" size={15} /></Link> : <p className="mt-1.5 truncate text-base font-bold">{name}</p>}
                  <p className="mt-1 text-[11px] text-gray-500">{p.builder?.username ? "Open direct message" : "Studio payout request"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Payout wallet</p>
                  <p className="mt-1.5 truncate text-sm font-semibold text-gray-200">
                    USDT BSC/BEP-20
                    {" · "}<code>{short(p.destination)}</code>
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-xs text-gray-400 select-all" title={p.destination || ""}>
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
                        className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] text-gray-300 transition-colors hover:border-emerald-400/40 hover:text-white"
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
                <div className="min-w-[120px] md:text-right"><p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Requested amount</p><span className="mt-1 block text-2xl font-extrabold text-[#4ade80]">{formatPrice(p.amount_cents)}</span>{p.fee_amount_cents != null && <p className="mt-0.5 text-xs text-gray-400">Net {formatPrice(p.net_amount_cents ?? p.amount_cents)}</p>}</div>
                <div className="flex min-w-[126px] flex-col gap-2">
                  {p.builder_id && <button type="button" onClick={() => showHistory(p)} className="min-h-10 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-4 py-2 text-xs font-semibold text-emerald-300 transition-all hover:border-emerald-400/50 hover:bg-emerald-400/[0.12]">View history →</button>}

                  {p.status === "requested" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () => approveWithdrawal(p.id, 0),
                          "Withdrawal approved for the next weekly batch.",
                        )
                      }
                      className="min-h-10 rounded-xl bg-[#4ade80] px-4 py-2 text-xs font-bold text-black"
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
                      className="min-h-10 rounded-xl border border-red-400/30 px-4 py-2 text-xs text-red-300"
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
                      className="min-h-10 rounded-xl bg-[#4ade80] px-4 py-2 text-xs font-bold text-black"
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
                      className="min-h-10 rounded-xl border border-red-400/30 px-4 py-2 text-xs text-red-300"
                    >
                      Mark failed
                    </button>
                  </>
                )}
                </div>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] bg-black/[0.1] px-5 py-2.5 sm:px-6">
                  <p className="text-[11px] text-gray-500">BuildEx covers network fees</p>
                  <p className="text-[11px] text-gray-500">Wallet details and actions</p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-50 p-4 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm" onClick={() => setHistory(null)}>
          <section className="glass w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-3xl p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div><p className="text-[11px] uppercase tracking-widest text-emerald-300">Payout review</p><h2 className="text-lg font-bold">{history.name}&apos;s order history</h2></div>
              <button type="button" onClick={() => setHistory(null)} className="text-sm text-gray-400 hover:text-white">Close</button>
            </div>
            {historyError && <p className="text-sm text-red-400 mb-3">{historyError}</p>}
            {history.orders === null ? <p className="py-10 text-center text-sm text-gray-500">Loading history…</p> : history.orders.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No orders found for this builder.</p> : (
              <div className="bx-scroll max-h-[55vh] overflow-y-auto space-y-2 pr-1">
                {history.orders.map((order) => (
                  <div key={order.order_id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex justify-between gap-3">
                    <div><p className="text-sm font-semibold">#{String(order.order_id).slice(0, 8)} <span className="font-normal text-gray-400">· {order.size_label || order.building_size}</span></p><p className="text-[11px] text-gray-500">Client: {order.buyer_display_name || order.buyer_username || "Unknown"} · {new Date(order.created_at).toLocaleDateString()}</p></div>
                    <div className="text-right"><p className="text-sm font-bold text-emerald-300">{formatPrice(order.builder_earnings_kopecks)}</p><p className="text-[11px] text-gray-500 capitalize">{order.status.replaceAll("_", " ")}</p></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
