"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  addStudioPortfolioImage,
  assignStudioOrder,
  cancelStudioWithdrawal,
  createEmployeeCode,
  deleteStudioPortfolioImage,
  fetchMyStudio,
  getStudioBalance,
  listEmployeeCodes,
  listMyEmployeeEarnings,
  listStudioEmployeeEarnings,
  listStudioMembers,
  removeStudioEmployee,
  requestStudioWithdrawal,
  setEmployeeCodeStatus,
  setMyEmployeeAvailability,
  updateMyStudio,
} from "../../lib/studios/api";
import { listMyOrders } from "../../lib/orders/api";
import { listMyPayoutHistory } from "../../lib/payouts/api";
import { formatPrice } from "../../lib/pricing";
import AvatarUploader from "../onboarding/components/AvatarUploader";
import {
  RatesEditor,
  mergeRates,
  normalizeRates,
  validateRates,
} from "../onboarding/components/RatesFields";

const INPUT =
  "w-full px-3 py-2.5 rounded-xl bg-black/25 border border-white/10 text-sm outline-none focus:border-[#4ade80]/60";

function Card({ title, children, aside }) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h2 className="font-bold text-lg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StudioModeratorDashboard() {
  const { user } = useAuth();
  const [studio, setStudio] = useState(null);
  const [members, setMembers] = useState([]);
  const [codes, setCodes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [balance, setBalance] = useState(null);
  const [employeeEarnings, setEmployeeEarnings] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [rates, setRates] = useState(() => mergeRates(null));
  const [employeePct, setEmployeePct] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState("usdt_trc20");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [newCode, setNewCode] = useState("");
  const [codeLimit, setCodeLimit] = useState(1);
  const [codeExpiry, setCodeExpiry] = useState("");
  const [withdrawDollars, setWithdrawDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const studioResult = await fetchMyStudio();
    if (studioResult.error || !studioResult.studio) {
      setError(studioResult.error?.message || "Studio not found.");
      return;
    }
    const row = studioResult.studio;
    setStudio(row);
    setName(row.display_name);
    setUsername(row.username);
    setAvatarUrl(row.avatar);
    setRates(mergeRates(row.rates));
    setEmployeePct(
      row.employee_commission_bps == null ? "" : String(row.employee_commission_bps / 100)
    );
    setAccepting(row.accepting_orders);
    setPayoutMethod(row.payout_method || "usdt_trc20");
    setPayoutDetails(row.payout_details || "");
    const [
      memberResult,
      codeResult,
      orderResult,
      balanceResult,
      earningsResult,
      withdrawalResult,
    ] = await Promise.all([
      listStudioMembers(row.id),
      listEmployeeCodes(row.id),
      listMyOrders(),
      getStudioBalance(),
      listStudioEmployeeEarnings(row.id),
      listMyPayoutHistory(),
    ]);
    setMembers(memberResult.members || []);
    setCodes(codeResult.codes || []);
    setOrders((orderResult.orders || []).filter((order) => order.studio_id === row.id));
    setBalance(balanceResult.summary || null);
    setEmployeeEarnings(earningsResult.earnings || []);
    setWithdrawals(
      (withdrawalResult.payouts || []).filter((payout) => payout.studio_id === row.id)
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const availableMembers = useMemo(
    () =>
      members.filter(
        (member) => member.status === "active" && member.availability_status === "available"
      ),
    [members]
  );

  async function saveStudio() {
    const validation = validateRates(rates);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await updateMyStudio({
      name: name.trim(),
      username: username.trim(),
      avatarUrl,
      rates: normalizeRates(rates),
      employeeCommissionBps: Math.round(Number(employeePct) * 100),
      acceptingOrders: accepting,
      payoutMethod,
      payoutDetails,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't save studio settings.");
      return;
    }
    setNotice("Studio settings saved.");
    load();
  }

  if (!studio) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        {error || "Loading studio dashboard…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(error || notice) && (
        <div className={error ? "auth-banner auth-banner-error" : "auth-banner"}>
          {error || notice}
        </div>
      )}

      <Card
        title="Studio storefront"
        aside={
          <span className={`text-xs px-2.5 py-1 rounded-full border ${
            studio.status === "active"
              ? "text-[#4ade80] border-[#4ade80]/30 bg-[#4ade80]/10"
              : "text-amber-300 border-amber-400/30 bg-amber-400/10"
          }`}>
            {studio.status}
          </span>
        }
      >
        <div className="grid lg:grid-cols-[150px_1fr] gap-6">
          <AvatarUploader
            userId={user?.id}
            value={avatarUrl}
            onChange={setAvatarUrl}
            onError={setError}
            fallbackInitial={(name || "S")[0]}
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <label>
              <span className="text-xs text-gray-400 block mb-1">Studio name</span>
              <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <span className="text-xs text-gray-400 block mb-1">Username</span>
              <input
                className={INPUT}
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
              />
            </label>
            <label>
              <span className="text-xs text-gray-400 block mb-1">Employee commission %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className={INPUT}
                value={employeePct}
                onChange={(e) => setEmployeePct(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs text-gray-400 block mb-1">Payout network</span>
              <select className={INPUT} value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}>
                <option value="usdt_trc20">USDT TRC-20</option>
                <option value="usdt_erc20">USDT ERC-20</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs text-gray-400 block mb-1">Payout wallet</span>
              <input className={INPUT} value={payoutDetails} onChange={(e) => setPayoutDetails(e.target.value)} />
            </label>
            <label className="sm:col-span-2 flex items-center justify-between gap-4 p-3 rounded-2xl border border-white/10">
              <span>
                <span className="font-semibold text-sm block">Accept new orders</span>
                <span className="text-xs text-gray-500">
                  Requires an active BuildEx commission and an available employee.
                </span>
              </span>
              <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} />
            </label>
          </div>
        </div>
        <div className="mt-6">
          <RatesEditor rates={rates} onChange={setRates} />
        </div>
        <button
          type="button"
          onClick={saveStudio}
          disabled={busy || employeePct === ""}
          className="mt-5 px-5 py-2.5 rounded-full bg-[#4ade80] text-black font-bold text-sm disabled:opacity-40"
        >
          Save studio settings
        </button>
      </Card>

      <Card title="Studio portfolio">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {studio.portfolio.map((image) => (
            <div key={image.id} className="relative rounded-2xl overflow-hidden bg-black/30 aspect-video">
              <img src={image.thumbnail} alt={image.title} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={async () => {
                  await deleteStudioPortfolioImage(image);
                  load();
                }}
                className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 text-xs text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
          <label className="aspect-video rounded-2xl border border-dashed border-[#4ade80]/40 flex items-center justify-center text-sm text-[#4ade80] cursor-pointer hover:bg-[#4ade80]/5">
            Add portfolio image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const result = await addStudioPortfolioImage(studio.id, file, studio.portfolio.length);
                if (result.error) setError(result.error.message);
                else load();
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </Card>

      <Card title="Team and employee codes" aside={<span className="text-xs text-gray-500">{availableMembers.length} available</span>}>
        <div className="grid md:grid-cols-[1fr_120px_160px_auto] gap-2 mb-5">
          <input className={INPUT} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="New employee code" />
          <input type="number" min="1" max="1000" className={INPUT} value={codeLimit} onChange={(e) => setCodeLimit(e.target.value)} />
          <input type="date" className={INPUT} value={codeExpiry} onChange={(e) => setCodeExpiry(e.target.value)} />
          <button
            type="button"
            onClick={async () => {
              const result = await createEmployeeCode({
                code: newCode.trim(),
                maxRedemptions: Number(codeLimit),
                expiresAt: codeExpiry ? new Date(`${codeExpiry}T23:59:59`).toISOString() : null,
              });
              if (result.error) setError(result.error.message);
              else {
                setNewCode("");
                load();
              }
            }}
            className="px-4 py-2 rounded-xl bg-[#4ade80] text-black text-sm font-bold"
          >
            Generate
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {codes.map((codeRow) => (
            <button
              key={codeRow.id}
              type="button"
              onClick={async () => {
                await setEmployeeCodeStatus(
                  codeRow.id,
                  codeRow.status === "active" ? "disabled" : "active"
                );
                load();
              }}
              className="px-3 py-2 rounded-xl border border-white/10 text-xs text-left"
              title="Click to enable or disable"
            >
              <span className="font-mono text-gray-200">{String(codeRow.code)}</span>
              <span className="text-gray-500 ml-2">
                {codeRow.redemptions_used}/{codeRow.max_redemptions} · {codeRow.status}
              </span>
            </button>
          ))}
        </div>
        <div className="divide-y divide-white/[0.07]">
          {members.filter((member) => member.status === "active").map((member) => (
            <div key={member.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold">{member.builder?.display_name}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Tracked total:{" "}
                  {formatPrice(
                    employeeEarnings
                      .filter((row) => row.builder_id === member.builder_id)
                      .reduce((sum, row) => sum + Number(row.amount_kopecks || 0), 0)
                  )}
                  {orders.some((order) => order.assigned_builder_id === member.builder_id)
                    ? " · currently assigned"
                    : ""}
                </p>
                <p className="text-xs text-gray-500">
                  @{member.builder?.username} · {member.availability_status}
                </p>
              </div>
              <Link href={`/chats?to=${encodeURIComponent(member.builder?.username || "")}`} className="px-3 py-1.5 rounded-lg border border-white/10 text-xs">
                Message
              </Link>
              <button
                type="button"
                onClick={async () => {
                  const result = await removeStudioEmployee(member.builder_id);
                  if (result.error) setError(result.error.message);
                  else load();
                }}
                className="px-3 py-1.5 rounded-lg border border-red-400/20 text-red-300 text-xs"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Studio orders">
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-sm text-gray-500">No studio orders yet.</p>}
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-white/10 p-4 flex flex-wrap gap-3 items-center">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-semibold">{order.buyer?.display_name || "Buyer"} · {order.size_label || order.building_size}</p>
                <p className="text-xs text-gray-500 mt-1">{order.status} · {formatPrice(order.price_kopecks)}</p>
              </div>
              {["paid", "in_progress"].includes(order.status) && (
                <select
                  className={INPUT + " max-w-[220px]"}
                  value={order.assigned_builder_id || ""}
                  onChange={async (event) => {
                    if (!event.target.value) return;
                    const result = await assignStudioOrder(order.id, event.target.value);
                    if (result.error) setError(result.error.message);
                    else load();
                  }}
                >
                  <option value="">Assign available employee</option>
                  {members
                    .filter(
                      (member) =>
                        member.status === "active" &&
                        (member.availability_status === "available" ||
                          member.builder_id === order.assigned_builder_id)
                    )
                    .map((member) => (
                    <option key={member.builder_id} value={member.builder_id}>
                      {member.builder?.display_name}
                      {member.builder_id === order.assigned_builder_id ? " (assigned)" : ""}
                    </option>
                    ))}
                </select>
              )}
              <Link href={`/orders/?id=${order.id}`} className="px-3 py-2 rounded-xl border border-[#4ade80]/30 text-[#4ade80] text-xs">
                Open order
              </Link>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Studio balance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            ["Available", balance?.available_cents],
            ["Earned", balance?.earned_cents],
            ["Pending", balance?.pending_cents],
            ["Withdrawn", balance?.withdrawn_cents],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-black/20 border border-white/10 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="font-bold mt-1">{formatPrice(Number(value) || 0)}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 max-w-md">
          <input
            type="number"
            min="20"
            step="0.01"
            className={INPUT}
            value={withdrawDollars}
            onChange={(e) => setWithdrawDollars(e.target.value)}
            placeholder="Withdrawal amount (USD)"
          />
          <button
            type="button"
            onClick={async () => {
              const result = await requestStudioWithdrawal(Math.round(Number(withdrawDollars) * 100));
              if (result.error) setError(result.error.message);
              else {
                setWithdrawDollars("");
                setNotice("Studio withdrawal requested.");
                load();
              }
            }}
            className="px-4 py-2 rounded-xl bg-[#4ade80] text-black text-sm font-bold"
          >
            Withdraw
          </button>
        </div>
        {withdrawals.length > 0 && (
          <div className="mt-5 divide-y divide-white/[0.07]">
            {withdrawals.map((withdrawal) => (
              <div key={withdrawal.id} className="py-3 flex justify-between gap-3 text-sm">
                <span className="capitalize text-gray-400">{withdrawal.status}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{formatPrice(withdrawal.amount_cents)}</span>
                  {withdrawal.status === "requested" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await cancelStudioWithdrawal(withdrawal.id);
                        if (result.error) setError(result.error.message);
                        else load();
                      }}
                      className="text-xs text-red-300 hover:text-red-200"
                    >
                      Cancel
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function StudioEmployeeDashboard({ builderProfile }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(builderProfile?.availability_status || "available");
  const [earnings, setEarnings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [earningResult, orderResult] = await Promise.all([
      listMyEmployeeEarnings(),
      listMyOrders(),
    ]);
    setEarnings(earningResult.earnings || []);
    setOrders(orderResult.orders || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = earnings.reduce((sum, row) => sum + Number(row.amount_kopecks || 0), 0);
  const active = orders.find(
    (order) =>
      order.assigned_builder_id === user?.id &&
      ["paid", "in_progress", "delivered", "disputed"].includes(order.status)
  );

  return (
    <div className="space-y-6">
      {error && <div className="auth-banner auth-banner-error">{error}</div>}
      <Card title="Employment status">
        <div className="flex flex-wrap gap-3 items-center">
          {["available", "busy"].map((value) => (
            <button
              key={value}
              type="button"
              disabled={Boolean(active)}
              onClick={async () => {
                const result = await setMyEmployeeAvailability(value);
                if (result.error) setError(result.error.message);
                else setStatus(value);
              }}
              className={`px-4 py-2 rounded-full border text-sm capitalize ${
                status === value
                  ? "border-[#4ade80] bg-[#4ade80]/10 text-[#4ade80]"
                  : "border-white/10 text-gray-400"
              } disabled:opacity-40`}
            >
              {value}
            </button>
          ))}
          {active && <span className="text-xs text-gray-500">Status is controlled by your active order.</span>}
        </div>
      </Card>
      <Card title="Assigned and archived orders">
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-sm text-gray-500">No studio orders assigned yet.</p>}
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-white/10">
            <Link
              href={`/orders/?id=${order.id}`}
              className="block p-4 hover:text-[#4ade80]"
            >
              <p className="font-semibold text-sm">{order.buyer?.display_name || "Buyer"}</p>
              <p className="text-xs text-gray-500 mt-1">{order.status} · {order.style}</p>
            </Link>
            <div className="px-4 -mt-2 pb-3">
              <p className="text-[11px] text-gray-500">
                {order.assigned_builder_id === user?.id ? "Current assignment" : "Archived assignment"}
              </p>
              {order.assignments
                ?.filter((assignment) => assignment.builder_id === user?.id)
                .map((assignment) => (
                  <p key={assignment.id} className="text-[11px] text-gray-500 mt-1">
                    Commission snapshot:{" "}
                    {(Number(assignment.employee_commission_bps) / 100).toFixed(2)}%
                    {assignment.released_at
                      ? ` · released ${new Date(assignment.released_at).toLocaleDateString()}`
                      : ""}
                  </p>
                ))}
            </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Tracked employee commission">
        <p className="text-2xl font-extrabold text-[#4ade80]">{formatPrice(total)}</p>
        <p className="text-xs text-gray-500 mt-1">
          Informational amount owed by the studio; employee payouts are currently handled off-platform.
        </p>
        <div className="mt-4 divide-y divide-white/[0.07]">
          {earnings.map((row) => (
            <div key={row.id} className="py-3 flex justify-between gap-3 text-sm">
              <span>{row.studio?.name || "Studio"} · {(Number(row.commission_bps) / 100).toFixed(2)}%</span>
              <span className="font-semibold">{formatPrice(row.amount_kopecks)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
