"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  GripHorizontal,
  ImagePlus,
  Inbox,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  Users,
  Wallet,
} from "lucide-react";
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
  "studio-control w-full px-4 py-3 rounded-2xl bg-black/25 border border-white/10 text-sm outline-none transition-all hover:border-white/20 focus:border-[#4ade80]/60 focus:ring-4 focus:ring-[#4ade80]/10";

const PAYOUT_NETWORKS = [
  {
    value: "usdt_trc20",
    label: "USDT",
    network: "TRON",
    badge: "TRC-20",
    hint: "Low network fees",
    prefix: "T",
  },
  {
    value: "usdt_erc20",
    label: "USDT",
    network: "Ethereum",
    badge: "ERC-20",
    hint: "Ethereum network",
    prefix: "0x",
  },
];

function getWalletValidation(method, address) {
  const value = address.trim();
  if (!value) {
    return { valid: false, empty: true, message: "Enter the receiving wallet address." };
  }
  if (method === "usdt_trc20") {
    const valid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
    return {
      valid,
      empty: false,
      message: valid
        ? "Valid TRON address format"
        : "TRC-20 addresses must begin with T and contain 34 characters.",
    };
  }
  if (method === "usdt_erc20") {
    const valid = /^0x[0-9a-fA-F]{40}$/.test(value);
    return {
      valid,
      empty: false,
      message: valid
        ? "Valid Ethereum address format"
        : "ERC-20 addresses must begin with 0x followed by 40 hexadecimal characters.",
    };
  }
  return { valid: false, empty: false, message: "Choose a supported payout network." };
}

function NetworkSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected =
    PAYOUT_NETWORKS.find((network) => network.value === value) || PAYOUT_NETWORKS[0];

  useEffect(() => {
    function close(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${INPUT} flex items-center justify-between gap-3 text-left`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#4ade80]/10 border border-[#4ade80]/20 text-[#4ade80] inline-flex items-center justify-center flex-shrink-0">
            <Wallet size={17} />
          </span>
          <span className="min-w-0">
            <span className="font-semibold text-gray-100">{selected.label}</span>
            <span className="text-gray-500"> · {selected.network}</span>
          </span>
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden xs:inline-flex text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-white/[0.05] border border-white/10 text-gray-400">
            {selected.badge}
          </span>
          <ChevronDown
            size={17}
            className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Payout network"
          className="absolute z-40 left-0 right-0 top-[calc(100%+8px)] p-2 rounded-2xl border border-white/15 bg-[#191d1a]/95 backdrop-blur-2xl shadow-2xl studio-network-menu"
        >
          {PAYOUT_NETWORKS.map((network) => {
            const active = network.value === selected.value;
            return (
              <button
                key={network.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(network.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                  active
                    ? "bg-[#4ade80]/12 border border-[#4ade80]/25"
                    : "border border-transparent hover:bg-white/[0.05]"
                }`}
              >
                <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center text-xs font-bold ${
                  active ? "bg-[#4ade80] text-black" : "bg-white/[0.06] text-gray-300"
                }`}>
                  {network.badge.split("-")[0]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold">
                    {network.label} on {network.network}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">{network.hint}</span>
                </span>
                {active && <Check size={17} className="text-[#4ade80]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ title, description, children, aside }) {
  return (
    <section className="glass studio-panel rounded-3xl p-6 lg:p-8 detail-fade-up">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-bold text-xl">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SaveButton({ changed, busy, invalid = false, onClick, children }) {
  const disabled = busy || invalid || !changed;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-5 px-5 py-2.5 rounded-full font-bold text-sm transition-all inline-flex items-center gap-2 ${
        disabled
          ? "bg-white/[0.04] border border-white/10 text-gray-500 cursor-not-allowed"
          : "bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] hover:scale-[1.02]"
      }`}
    >
      {children}
      {!disabled && <ArrowRight size={15} />}
    </button>
  );
}

function PortfolioRail({ studio, onReload, onError }) {
  const railRef = useRef(null);
  const dragRef = useRef({ active: false, x: 0, left: 0, moved: false });

  function startDrag(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rail = railRef.current;
    if (!rail || event.target.closest("button, label, input")) return;
    dragRef.current = {
      active: true,
      x: event.clientX,
      left: rail.scrollLeft,
      moved: false,
    };
    rail.setPointerCapture?.(event.pointerId);
    rail.classList.add("is-dragging");
  }

  function moveDrag(event) {
    const rail = railRef.current;
    const drag = dragRef.current;
    if (!rail || !drag.active) return;
    const distance = event.clientX - drag.x;
    if (Math.abs(distance) > 4) drag.moved = true;
    rail.scrollLeft = drag.left - distance;
  }

  function finishDrag(event) {
    const rail = railRef.current;
    if (!rail || !dragRef.current.active) return;
    dragRef.current.active = false;
    rail.releasePointerCapture?.(event.pointerId);
    rail.classList.remove("is-dragging");
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
        <GripHorizontal size={15} className="text-[#4ade80]" />
        Drag the gallery horizontally to browse. Hover a build for actions.
      </div>
      <div className="studio-portfolio-fade -mx-2 px-2">
        <div
          ref={railRef}
          className="studio-portfolio-rail bx-scroll flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory cursor-grab select-none"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onPointerLeave={(event) => {
            if (event.buttons === 0) finishDrag(event);
          }}
        >
          {studio.portfolio.map((image, index) => (
            <article
              key={image.id}
              className="studio-portfolio-card group relative flex-[0_0_clamp(250px,38vw,360px)] snap-start rounded-2xl overflow-hidden bg-black/30 border border-white/10 aspect-[16/10]"
            >
              <img
                src={image.thumbnail}
                alt={image.title}
                className="w-full h-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-[1.06]"
                draggable="false"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20 opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <span className="absolute left-3 bottom-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-black/55 border border-white/15 text-gray-200 backdrop-blur-md">
                {index === 0 ? "Cover image" : `Build ${index + 1}`}
              </span>
              <button
                type="button"
                aria-label={`Remove ${image.title || `build ${index + 1}`}`}
                onClick={async () => {
                  const result = await deleteStudioPortfolioImage(image);
                  if (result.error) onError(result.error.message);
                  else onReload();
                }}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/65 border border-white/15 text-gray-200 inline-flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 focus:opacity-100 transition-all hover:bg-red-500/25 hover:text-red-200 hover:border-red-400/40"
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
          <label className="studio-portfolio-add flex-[0_0_clamp(220px,30vw,300px)] aspect-[16/10] snap-start rounded-2xl border border-dashed border-[#4ade80]/40 flex flex-col gap-2 items-center justify-center text-sm text-[#4ade80] cursor-pointer transition-all hover:bg-[#4ade80]/[0.07] hover:border-[#4ade80]/70 hover:-translate-y-1">
            <span className="w-11 h-11 rounded-2xl bg-[#4ade80]/10 border border-[#4ade80]/20 inline-flex items-center justify-center">
              <ImagePlus size={20} />
            </span>
            <span className="font-semibold">Add portfolio image</span>
            <span className="text-[11px] text-gray-500">PNG, JPG, WebP or GIF</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const result = await addStudioPortfolioImage(
                  studio.id,
                  file,
                  studio.portfolio.length
                );
                if (result.error) onError(result.error.message);
                else onReload();
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function StudioModeratorDashboard({ section = "profile" }) {
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
  const storefrontChanged = useMemo(
    () =>
      Boolean(
        studio &&
          (name.trim() !== studio.display_name ||
            username.trim() !== studio.username ||
            avatarUrl !== studio.avatar ||
            accepting !== studio.accepting_orders)
      ),
    [accepting, avatarUrl, name, studio, username]
  );
  const ratesChanged = useMemo(
    () =>
      Boolean(
        studio &&
          JSON.stringify(normalizeRates(rates)) !== JSON.stringify(studio.rates || {})
      ),
    [rates, studio]
  );
  const commissionChanged = useMemo(
    () =>
      Boolean(
        studio &&
          employeePct !== "" &&
          Math.round(Number(employeePct) * 100) !== Number(studio.employee_commission_bps)
      ),
    [employeePct, studio]
  );
  const payoutChanged = useMemo(
    () =>
      Boolean(
        studio &&
          (payoutMethod !== (studio.payout_method || "usdt_trc20") ||
            payoutDetails.trim() !== (studio.payout_details || ""))
      ),
    [payoutDetails, payoutMethod, studio]
  );
  const walletValidation = useMemo(
    () => getWalletValidation(payoutMethod, payoutDetails),
    [payoutDetails, payoutMethod]
  );

  async function saveStudio(options = {}) {
    const validation = validateRates(rates);
    if (validation) {
      setError(validation);
      return;
    }
    if (options.validatePayout && !walletValidation.valid) {
      setError(walletValidation.message);
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
      payoutMethod: payoutDetails.trim() ? payoutMethod : null,
      payoutDetails: payoutDetails.trim() || null,
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

      {section === "profile" && <Card
        title="Studio storefront"
        description="Manage the identity and availability clients see across BuildEx."
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
        <SaveButton
          changed={storefrontChanged}
          busy={busy}
          invalid={employeePct === ""}
          onClick={saveStudio}
        >
          {busy ? "Saving…" : "Save storefront"}
        </SaveButton>
      </Card>}

      {section === "profile" && <Card
        title="Studio rates"
        description="Set the block area and client price for each project size."
      >
        <RatesEditor rates={rates} onChange={setRates} />
        <SaveButton
          changed={ratesChanged}
          busy={busy}
          invalid={employeePct === ""}
          onClick={saveStudio}
        >
          {busy ? "Saving…" : "Save rates"}
        </SaveButton>
      </Card>}

      {section === "profile" && <Card
        title="Studio portfolio"
        description="A compact, scrollable showcase that matches the public builder profile."
      >
        <PortfolioRail studio={studio} onReload={load} onError={setError} />
      </Card>}

      {section === "team" && <Card
        title="Employee commission"
        description="Set the percentage tracked for employees on newly assigned orders."
      >
        <label className="block max-w-sm">
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
        <SaveButton
          changed={commissionChanged}
          busy={busy}
          invalid={employeePct === ""}
          onClick={saveStudio}
        >
          {busy ? "Saving…" : "Save commission"}
        </SaveButton>
      </Card>}

      {section === "team" && <Card
        title="Team and employee codes"
        description="Invite employees and manage everyone attached to the studio."
        aside={<span className="text-xs text-gray-500">{availableMembers.length} available</span>}
      >
        <div className="grid md:grid-cols-[1fr_120px_180px_auto] gap-3 mb-5 items-end">
          <label>
            <span className="text-[11px] uppercase tracking-wider text-gray-500 block mb-2">
              Invite code
            </span>
            <input className={INPUT} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. BUILDEX-CREW" />
          </label>
          <label>
            <span className="text-[11px] uppercase tracking-wider text-gray-500 block mb-2">
              Uses
            </span>
            <input type="number" min="1" max="1000" className={INPUT} value={codeLimit} onChange={(e) => setCodeLimit(e.target.value)} />
          </label>
          <label>
            <span className="text-[11px] uppercase tracking-wider text-gray-500 block mb-2">
              Expires
            </span>
            <input type="date" className={INPUT} value={codeExpiry} onChange={(e) => setCodeExpiry(e.target.value)} />
          </label>
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
            disabled={!newCode.trim()}
            className="h-[46px] px-5 rounded-2xl bg-[#4ade80] text-black text-sm font-bold transition-all hover:bg-[#22c55e] hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
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
      </Card>}

      {section === "orders" && (
        <div className="grid sm:grid-cols-3 gap-3 detail-fade-up">
          {[
            [
              "Open orders",
              orders.filter(
                (order) => !["completed", "cancelled"].includes(order.status)
              ).length,
              Inbox,
            ],
            [
              "Ready to assign",
              orders.filter(
                (order) => order.status === "paid" && !order.assigned_builder_id
              ).length,
              UserRoundCheck,
            ],
            ["Available builders", availableMembers.length, Users],
          ].map(([label, value, StatIcon]) => (
            <div
              key={label}
              className="glass studio-stat-card rounded-2xl p-4 flex items-center gap-3"
            >
              <span className="w-10 h-10 rounded-xl bg-[#4ade80]/10 border border-[#4ade80]/20 text-[#4ade80] inline-flex items-center justify-center">
                <StatIcon size={18} />
              </span>
              <span>
                <span className="block text-xl font-extrabold">{value}</span>
                <span className="block text-[11px] text-gray-500">{label}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {section === "orders" && <Card
        title="Studio orders"
        description="Review incoming work and assign it to an available employee."
      >
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/15 bg-black/[0.08] px-6 py-12 text-center">
              <span className="mx-auto w-14 h-14 rounded-2xl bg-[#4ade80]/10 border border-[#4ade80]/20 text-[#4ade80] flex items-center justify-center mb-4">
                <Inbox size={25} />
              </span>
              <h3 className="font-bold text-lg">Your order queue is ready</h3>
              <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto mt-2">
                New paid studio orders will appear here with the client, project
                scale, value, and assignment controls. There is nothing waiting
                right now.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                <Link
                  href={`/studios?s=${encodeURIComponent(studio.username)}`}
                  className="px-4 py-2.5 rounded-full bg-[#4ade80] text-black text-sm font-bold inline-flex items-center gap-2 hover:bg-[#22c55e] transition-colors"
                >
                  View storefront <ExternalLink size={14} />
                </Link>
                <button
                  type="button"
                  onClick={load}
                  className="px-4 py-2.5 rounded-full border border-white/15 bg-white/[0.04] text-sm font-semibold hover:border-white/30 hover:bg-white/[0.08] transition-all"
                >
                  Refresh queue
                </button>
              </div>
            </div>
          )}
          {orders.map((order) => (
            <div key={order.id} className="studio-order-row rounded-2xl border border-white/10 bg-black/[0.08] p-4 flex flex-wrap gap-3 items-center transition-all hover:border-[#4ade80]/30 hover:bg-[#4ade80]/[0.025]">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-semibold">{order.buyer?.display_name || "Buyer"} · {order.size_label || order.building_size}</p>
                <p className="text-xs text-gray-500 mt-1">{order.status} · {formatPrice(order.price_kopecks)}</p>
              </div>
              {["paid", "in_progress"].includes(order.status) && (
                <select
                  className={`${INPUT} catalog-select max-w-[230px]`}
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
              <Link href={`/orders/?id=${order.id}`} className="px-3 py-2.5 rounded-xl border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#4ade80] hover:text-black transition-all">
                Open order <ArrowRight size={13} />
              </Link>
            </div>
          ))}
        </div>
      </Card>}

      {section === "payouts" && <Card
        title="Payout destination"
        description="Choose the exact network and verify the receiving address before saving."
        aside={
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[#4ade80]">
            <ShieldCheck size={14} /> Format validation enabled
          </span>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <label>
            <span className="text-[11px] uppercase tracking-wider text-gray-500 block mb-2">
              Asset &amp; network
            </span>
            <NetworkSelect
              value={payoutMethod}
              onChange={(nextValue) => {
                setPayoutMethod(nextValue);
                setError(null);
              }}
            />
          </label>
          <label>
            <span className="text-[11px] uppercase tracking-wider text-gray-500 block mb-2">
              Receiving wallet
            </span>
            <div className="relative">
              <input
                className={`${INPUT} pr-11 ${
                  payoutDetails && walletValidation.valid
                    ? "!border-[#4ade80]/55 !ring-4 !ring-[#4ade80]/10"
                    : payoutDetails
                      ? "!border-red-400/55 !ring-4 !ring-red-400/10"
                      : ""
                }`}
                value={payoutDetails}
                spellCheck="false"
                autoComplete="off"
                onChange={(e) => {
                  setPayoutDetails(e.target.value.replace(/\s/g, ""));
                  setError(null);
                }}
                placeholder={`${PAYOUT_NETWORKS.find((item) => item.value === payoutMethod)?.prefix || ""}…`}
              />
              {payoutDetails && (
                <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full inline-flex items-center justify-center ${
                  walletValidation.valid
                    ? "bg-[#4ade80]/15 text-[#4ade80]"
                    : "bg-red-400/10 text-red-300"
                }`}>
                  {walletValidation.valid ? (
                    <Check size={15} />
                  ) : (
                    <span className="text-sm font-bold">!</span>
                  )}
                </span>
              )}
            </div>
            <span className={`text-[11px] mt-2 min-h-[16px] flex items-center gap-1.5 ${
              walletValidation.valid
                ? "text-[#4ade80]"
                : walletValidation.empty
                  ? "text-gray-500"
                  : "text-red-300"
            }`}>
              {walletValidation.valid && <ShieldCheck size={13} />}
              {walletValidation.message}
            </span>
          </label>
        </div>
        <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3 text-[11px] text-amber-100/70 leading-relaxed">
          Network and address must match. Crypto transfers are irreversible, so
          compare the first and last characters with your wallet before requesting
          a withdrawal.
        </div>
        <SaveButton
          changed={payoutChanged}
          busy={busy}
          invalid={!walletValidation.valid}
          onClick={() => saveStudio({ validatePayout: true })}
        >
          {busy ? "Saving…" : "Save payout details"}
        </SaveButton>
      </Card>}

      {section === "payouts" && <Card
        title="Studio balance"
        description="A clear view of earnings, pending releases, and past withdrawals."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            ["Available", balance?.available_cents],
            ["Earned", balance?.earned_cents],
            ["Pending", balance?.pending_cents],
            ["Withdrawn", balance?.withdrawn_cents],
          ].map(([label, value]) => (
            <div key={label} className="studio-stat-card rounded-2xl bg-black/20 border border-white/10 p-4 transition-all hover:border-[#4ade80]/25">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="font-extrabold text-lg mt-1">{formatPrice(Number(value) || 0)}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
          <label className="relative flex-1">
            <span className="sr-only">Withdrawal amount in USD</span>
            <CircleDollarSign size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="number"
              min="20"
              step="0.01"
              className={`${INPUT} !pl-11`}
              value={withdrawDollars}
              onChange={(e) => setWithdrawDollars(e.target.value)}
              placeholder="Minimum $20.00"
            />
          </label>
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
            disabled={
              !walletValidation.valid ||
              Number(withdrawDollars) < 20 ||
              Number(withdrawDollars) * 100 > Number(balance?.available_cents || 0)
            }
            className="px-5 py-3 rounded-2xl bg-[#4ade80] text-black text-sm font-bold transition-all hover:bg-[#22c55e] hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            Withdraw
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">
          Withdrawals require a valid saved wallet, at least $20, and enough available balance.
        </p>
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
      </Card>}
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
