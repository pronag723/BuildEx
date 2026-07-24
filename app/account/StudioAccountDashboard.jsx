"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  GripHorizontal,
  ImagePlus,
  Inbox,
  Pencil,
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
  deleteEmployeeCode,
  deleteStudioPortfolioImage,
  fetchMyStudio,
  getStudioBalance,
  listEmployeeCodes,
  listMyEmployeeEarnings,
  listStudioEmployeeEarnings,
  listStudioMembers,
  removeStudioEmployee,
  requestStudioWithdrawal,
  setMyStudioAcceptingOrders,
  setEmployeeCodeStatus,
  setMyEmployeeAvailability,
  updateMyStudio,
  updateMyStudioAbout,
  updateStudioPortfolioPositions,
} from "../../lib/studios/api";
import { listMyOrders } from "../../lib/orders/api";
import { listMyPayoutHistory } from "../../lib/payouts/api";
import { formatPrice, ratesToTiers } from "../../lib/pricing";
import AvatarUploader from "../onboarding/components/AvatarUploader";
import Avatar from "../../lib/ui/Avatar";
import {
  BIO_MAX,
  PORTFOLIO_ACCEPTED_MIME,
  PORTFOLIO_MAX_FILE_MB,
  PORTFOLIO_MAX_IMAGES,
} from "../../lib/onboarding/constants";
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

function Card({ title, description, children, aside, className = "" }) {
  return (
    <section className={`glass studio-panel rounded-3xl p-6 lg:p-8 detail-fade-up ${className}`}>
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

function PortfolioRail({ studio, onReload, onError, editing }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
        <GripHorizontal size={15} className="text-[#4ade80]" />
        Scroll horizontally to browse the studio's work.
      </div>
      <div className="studio-portfolio-fade -mx-2 px-2">
        <div
          className="studio-portfolio-rail bx-scroll flex gap-4 overflow-x-auto pb-4"
        >
          {studio.portfolio.map((image, index) => (
            <article
              key={image.id}
              className="studio-portfolio-card group relative flex-[0_0_clamp(250px,38vw,360px)] rounded-2xl overflow-hidden bg-black/30 border border-white/10 aspect-[16/10]"
            >
              <img
                src={image.thumbnail}
                alt={image.title}
                className="w-full h-full object-cover"
                draggable="false"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20 opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <span className="absolute left-3 bottom-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-black/55 border border-white/15 text-gray-200 backdrop-blur-md">
                {index === 0 ? "Cover image" : `Build ${index + 1}`}
              </span>
              {editing && (
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
              )}
            </article>
          ))}
          {editing && <label className="studio-portfolio-add flex-[0_0_clamp(220px,30vw,300px)] aspect-[16/10] snap-start rounded-2xl border border-dashed border-[#4ade80]/40 flex flex-col gap-2 items-center justify-center text-sm text-[#4ade80] cursor-pointer transition-all hover:bg-[#4ade80]/[0.07] hover:border-[#4ade80]/70 hover:-translate-y-1">
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
          </label>}
        </div>
      </div>
    </div>
  );
}

function StudioPortfolioEditor({ studio, onReload, onError }) {
  const inputRef = useRef(null);
  const [images, setImages] = useState(studio.portfolio || []);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    setImages(studio.portfolio || []);
  }, [studio.portfolio]);

  function validFile(file) {
    if (!PORTFOLIO_ACCEPTED_MIME.includes(file.type)) {
      onError?.(`"${file.name}" isn't a supported image format.`);
      return false;
    }
    if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) {
      onError?.(`"${file.name}" is larger than ${PORTFOLIO_MAX_FILE_MB} MB.`);
      return false;
    }
    return true;
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter(validFile);
    const remaining = PORTFOLIO_MAX_IMAGES - images.length;
    const accepted = incoming.slice(0, Math.max(0, remaining));
    if (accepted.length === 0) {
      if (incoming.length > 0) onError?.(`Maximum ${PORTFOLIO_MAX_IMAGES} portfolio images.`);
      return;
    }
    if (accepted.length < incoming.length) {
      onError?.(`Only ${accepted.length} image${accepted.length === 1 ? "" : "s"} fit — maximum ${PORTFOLIO_MAX_IMAGES}.`);
    }

    setUploading(accepted.length);
    const basePosition = images.length;
    const results = await Promise.all(
      accepted.map((file, index) =>
        addStudioPortfolioImage(studio.id, file, basePosition + index)
      )
    );
    setUploading(0);
    const failed = results.find((result) => result.error);
    if (failed?.error) onError?.(failed.error.message || "Failed to upload an image.");
    await onReload();
  }

  async function remove(image) {
    const previous = images;
    setImages((current) => current.filter((item) => item.id !== image.id));
    const result = await deleteStudioPortfolioImage(image);
    if (result.error) {
      setImages(previous);
      onError?.(result.error.message || "Failed to remove the image.");
      return;
    }
    await onReload();
  }

  async function move(imageId, delta) {
    const index = images.findIndex((image) => image.id === imageId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= images.length) return;
    const next = [...images];
    const [image] = next.splice(index, 1);
    next.splice(target, 0, image);
    const positioned = next.map((item, position) => ({ ...item, position }));
    setImages(positioned);
    const result = await updateStudioPortfolioPositions(studio.id, positioned);
    if (result.error) {
      setImages(images);
      onError?.(result.error.message || "Failed to reorder the portfolio.");
      return;
    }
    await onReload();
  }

  const used = images.length + uploading;
  const remaining = Math.max(0, PORTFOLIO_MAX_IMAGES - used);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`upload-tile w-full py-10 ${dragOver ? "is-dragging" : ""}`}
        aria-label="Upload studio portfolio images"
      >
        <ImagePlus size={38} className="text-[#4ade80] mb-2" />
        <div className="text-base font-semibold">Drop images here or click to browse</div>
        <p className="text-xs text-gray-500 mt-1">
          PNG, JPG, WebP, GIF · up to {PORTFOLIO_MAX_FILE_MB} MB each · up to {PORTFOLIO_MAX_IMAGES} images
        </p>
        <p className="text-[11px] mt-3 text-gray-500">
          <span className={remaining > 0 ? "text-[#4ade80]" : "text-amber-300"}>
            {uploading > 0
              ? `Uploading ${uploading} image${uploading === 1 ? "" : "s"}…`
              : remaining > 0
                ? `${remaining} slot${remaining === 1 ? "" : "s"} left`
                : "Portfolio full"}
          </span>
          {used > 0 && <span className="text-gray-600"> · {used}/{PORTFOLIO_MAX_IMAGES} used</span>}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PORTFOLIO_ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {images.length > 0 && (
        <div className="portfolio-grid mt-6">
          {images.map((image, index) => (
            <div key={image.id} className="portfolio-tile group">
              <img src={image.thumbnail} alt={image.title || "Studio portfolio image"} loading="lazy" />
              <div className="tile-actions">
                {index === 0 ? <span className="tile-badge">Cover</span> : <span />}
                <button
                  type="button"
                  onClick={() => remove(image)}
                  className="tile-btn"
                  aria-label="Remove image"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="tile-reorder">
                <button
                  type="button"
                  onClick={() => move(image.id, -1)}
                  className="tile-btn"
                  disabled={index === 0}
                  aria-label="Move left"
                  title="Move left"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => move(image.id, 1)}
                  className="tile-btn"
                  disabled={index === images.length - 1}
                  aria-label="Move right"
                  title="Move right"
                >
                  ›
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudioRatesPreview({ rates }) {
  const tiers = ratesToTiers(rates).filter((tier) => tier.enabled && tier.price > 0);
  if (tiers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-500">
        No studio rates have been published yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tiers.map((tier) => (
        <div key={tier.id} className="rounded-2xl border border-white/10 p-4">
          <div className="flex items-center gap-2.5">
            <span className="icon-tile icon-tile-sm text-[#4ade80]">
              <Wallet size={16} />
            </span>
            <h3 className="font-semibold text-sm">{tier.label}</h3>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {tier.blocks > 0 ? `Up to ${tier.blocks}×${tier.blocks} blocks` : "Custom scope"}
          </p>
          <div className="mt-3 pt-3 border-t border-white/[0.07]">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Exact price</p>
            <p className="text-[#4ade80] font-extrabold text-xl">{formatPrice(tier.price)}</p>
          </div>
        </div>
      ))}
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
  const [about, setAbout] = useState("");
  const [rates, setRates] = useState(() => mergeRates(null));
  const [employeePct, setEmployeePct] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState("usdt_trc20");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [newCode, setNewCode] = useState("");
  const [codeLimit, setCodeLimit] = useState(1);
  const [codeExpiry, setCodeExpiry] = useState("");
  const [codeActionId, setCodeActionId] = useState(null);
  const [copiedCodeId, setCopiedCodeId] = useState(null);
  const [withdrawDollars, setWithdrawDollars] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("active");
  const [assignmentSelections, setAssignmentSelections] = useState({});
  const [ratesEditing, setRatesEditing] = useState(false);
  const [portfolioEditing, setPortfolioEditing] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [aboutEditing, setAboutEditing] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState("idle");
  const availabilityTimer = useRef(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
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
      setAbout(row.about || "");
      setRates(mergeRates(row.rates));
      setEmployeePct(
        row.employee_commission_bps == null ? "" : String(row.employee_commission_bps / 100)
      );
      setAccepting(row.accepting_orders);
      setPayoutMethod(row.payout_method || "usdt_trc20");
      setPayoutDetails(row.payout_details || "");

      const settled = await Promise.allSettled([
        listStudioMembers(row.id),
        listEmployeeCodes(row.id),
        listMyOrders(),
        getStudioBalance(),
        listStudioEmployeeEarnings(row.id),
        listMyPayoutHistory(),
      ]);
      const results = settled.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : { error: result.reason || new Error("Request failed") }
      );
      const [
        memberResult,
        codeResult,
        orderResult,
        balanceResult,
        earningsResult,
        withdrawalResult,
      ] = results;

      if (!memberResult.error) setMembers(memberResult.members || []);
      if (!codeResult.error) setCodes(codeResult.codes || []);
      if (!orderResult.error) {
        setOrders((orderResult.orders || []).filter((order) => order.studio_id === row.id));
      }
      if (!balanceResult.error) setBalance(balanceResult.summary || null);
      if (!earningsResult.error) setEmployeeEarnings(earningsResult.earnings || []);
      if (!withdrawalResult.error) {
        setWithdrawals(
          (withdrawalResult.payouts || []).filter((payout) => payout.studio_id === row.id)
        );
      }

      const partialError = results.find((result) => result.error)?.error;
      setError(
        partialError
          ? partialError.message || "Some studio details couldn't be refreshed. Try again."
          : null
      );
    } catch (loadFailure) {
      setError(loadFailure?.message || "Couldn't load the studio dashboard. Try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => clearTimeout(availabilityTimer.current), []);

  const availableMembers = useMemo(
    () =>
      members.filter(
        (member) => member.status === "active" && member.availability_status === "available"
      ),
    [members]
  );
  const visibleOrders = useMemo(() => {
    if (orderStatusFilter === "all") return orders;
    if (orderStatusFilter === "active") {
      return orders.filter((order) => !["completed", "cancelled"].includes(order.status));
    }
    return orders.filter((order) => order.status === orderStatusFilter);
  }, [orderStatusFilter, orders]);
  const storefrontChanged = useMemo(
    () =>
      Boolean(
        studio &&
          (name.trim() !== studio.display_name ||
            username.trim() !== studio.username ||
            avatarUrl !== studio.avatar)
      ),
    [avatarUrl, name, studio, username]
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
    if (options.closeProfile) setProfileEditing(false);
    if (ratesChanged) setRatesEditing(false);
    load();
  }

  function startProfileEdit() {
    setName(studio.display_name);
    setUsername(studio.username);
    setAvatarUrl(studio.avatar);
    setError(null);
    setProfileEditing(true);
  }

  function cancelProfileEdit() {
    setName(studio.display_name);
    setUsername(studio.username);
    setAvatarUrl(studio.avatar);
    setProfileEditing(false);
  }

  async function saveAbout() {
    setBusy(true);
    setError(null);
    const result = await updateMyStudioAbout(about);
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't save the studio description.");
      return;
    }
    setStudio((current) => ({ ...current, about: about.trim(), bio: about.trim() }));
    setAboutEditing(false);
    setNotice("Studio description saved.");
  }

  async function chooseAvailability(next) {
    if (next === accepting && availabilityStatus !== "error") return;
    const previous = accepting;
    setAccepting(next);
    setAvailabilityStatus("saving");
    setError(null);
    clearTimeout(availabilityTimer.current);
    const result = await setMyStudioAcceptingOrders(next);
    if (result.error) {
      setAccepting(previous);
      setAvailabilityStatus("error");
      setError(result.error.message || "Couldn't update studio availability.");
      return;
    }
    setStudio((current) => ({ ...current, accepting_orders: next }));
    setAvailabilityStatus("saved");
    availabilityTimer.current = setTimeout(() => setAvailabilityStatus("idle"), 1800);
  }

  async function copyCode(codeRow) {
    try {
      await navigator.clipboard.writeText(String(codeRow.code));
      setCopiedCodeId(codeRow.id);
      setTimeout(() => setCopiedCodeId(null), 1800);
    } catch {
      setError("Couldn't copy the invite code. Select it and copy it manually.");
    }
  }

  async function toggleCode(codeRow) {
    setCodeActionId(codeRow.id);
    setError(null);
    const result = await setEmployeeCodeStatus(
      codeRow.id,
      codeRow.status === "active" ? "disabled" : "active"
    );
    setCodeActionId(null);
    if (result.error) {
      setError(result.error.message || "Couldn't update the invite code.");
      return;
    }
    await load();
  }

  async function removeCode(codeRow) {
    if (!window.confirm(`Delete invite code "${codeRow.code}"? This can't be undone.`)) return;
    setCodeActionId(codeRow.id);
    setError(null);
    const result = await deleteEmployeeCode(codeRow.id);
    setCodeActionId(null);
    if (result.error) {
      setError(result.error.message || "Couldn't delete the invite code.");
      return;
    }
    setCodes((current) => current.filter((item) => item.id !== codeRow.id));
    setNotice("Invite code deleted.");
  }

  async function confirmAssignment(order) {
    const builderId = assignmentSelections[order.id] || order.assigned_builder_id;
    if (!builderId || builderId === order.assigned_builder_id) return;
    setBusy(true);
    setError(null);
    const result = await assignStudioOrder(order.id, builderId);
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't assign the order.");
      return;
    }
    setAssignmentSelections((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
    setNotice("Builder assigned to the order.");
    await load();
  }

  if (!studio) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        {error || "Loading studio dashboard…"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {(error || notice) && (
        <div className={error ? "auth-banner auth-banner-error" : "auth-banner"}>
          {error || notice}
        </div>
      )}

      {section === "profile" && (
        <section className="detail-fade-up glass rounded-3xl p-6 lg:p-8">
          {profileEditing ? (
            <div className="flex flex-col sm:flex-row gap-7 items-center sm:items-start">
              <AvatarUploader
                userId={user?.id}
                value={avatarUrl}
                onChange={setAvatarUrl}
                onError={setError}
                fallbackInitial={(name || "S")[0]}
              />
              <div className="flex-1 w-full space-y-4">
                <label className="block">
                  <span className="onb-label block mb-2">Studio name</span>
                  <input
                    className="onb-input"
                    value={name}
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="onb-label block mb-2">Studio @nickname</span>
                  <div className="onb-input-with-prefix">
                    <span className="onb-input-prefix">@</span>
                    <input
                      className="onb-input"
                      value={username}
                      maxLength={24}
                      onChange={(event) =>
                        setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                      }
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Unique to the studio — used in its profile URL and chats.
                  </p>
                </label>
              </div>
              <div className="flex items-center gap-2 self-center sm:self-start">
                <button
                  type="button"
                  onClick={cancelProfileEdit}
                  className="px-4 py-2 rounded-full text-xs font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveStudio({ closeProfile: true })}
                  disabled={
                    busy ||
                    !storefrontChanged ||
                    name.trim().length < 2 ||
                    username.trim().length < 3 ||
                    employeePct === ""
                  }
                  className="px-5 py-2 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {busy && <span className="w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <div className="relative flex-shrink-0">
                <Avatar
                  src={studio.avatar}
                  name={studio.display_name}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl ring-2 ring-[#4ade80]/30 shadow-xl text-4xl"
                />
                <span className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-[#1a1a1a] ${
                  accepting ? "bg-[#4ade80] online-dot" : "bg-amber-400"
                }`} />
              </div>
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                  <h2 className="text-2xl sm:text-3xl font-extrabold">{studio.display_name}</h2>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30">
                    Studio
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">@{studio.username}</p>
                <p className={`text-sm inline-flex items-center gap-1.5 ${accepting ? "text-[#4ade80]" : "text-amber-300"}`}>
                  <span className={`w-2 h-2 rounded-full ${accepting ? "bg-[#4ade80]" : "bg-amber-400"}`} />
                  {accepting ? "Available for new projects" : "Not taking new orders"}
                </p>
              </div>
              <button
                type="button"
                onClick={startProfileEdit}
                className="px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
              >
                <Pencil size={14} />
                Edit profile
              </button>
            </div>
          )}
        </section>
      )}

      {section === "profile" && <Card
        title="About"
        aside={
          aboutEditing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAbout(studio.about || "");
                  setAboutEditing(false);
                }}
                className="px-4 py-1.5 rounded-full text-xs font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAbout}
                disabled={busy}
                className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy && <span className="w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />}
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAboutEditing(true)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
            >
              <Pencil size={13} />
              Edit
            </button>
          )
        }
      >
        {aboutEditing ? (
          <div>
            <label htmlFor="studio-about" className="onb-label block mb-2">Bio</label>
            <textarea
              id="studio-about"
              className="onb-input onb-textarea"
              value={about}
              maxLength={BIO_MAX}
              onChange={(event) => setAbout(event.target.value.slice(0, BIO_MAX))}
              placeholder="Tell clients about your team, specialties, and the projects you love building."
            />
            <p className="mt-2 text-xs text-gray-500 text-right">{about.length}/{BIO_MAX}</p>
          </div>
        ) : (
          <p className={studio.about ? "text-gray-400 leading-relaxed" : "text-gray-500 text-sm italic"}>
            {studio.about || "Tell clients about the studio, its team, and the work it specializes in."}
          </p>
        )}
      </Card>}

      {section === "profile" && <Card
        title="Availability"
        description="Let clients know whether the studio is taking new commissions. Changes save instantly."
        aside={
          <span className={`text-xs font-medium transition-opacity duration-300 inline-flex items-center gap-1.5 ${
            availabilityStatus === "idle" ? "opacity-0" : "opacity-100"
          } ${availabilityStatus === "error" ? "text-red-300" : "text-[#4ade80]"}`}>
            {availabilityStatus === "saving" && <span className="w-3 h-3 rounded-full border-2 border-[#4ade80]/40 border-t-[#4ade80] animate-spin" />}
            {availabilityStatus === "saving" && "Saving…"}
            {availabilityStatus === "saved" && <><Check size={13} /> Saved</>}
            {availabilityStatus === "error" && "Couldn't save — try again"}
          </span>
        }
      >
        <div className="relative grid grid-cols-2 p-1 rounded-full bg-white/[0.04] border border-white/10">
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 left-1 rounded-full transition-transform duration-300 ease-out ${
              accepting
                ? "bg-[#4ade80]/15 shadow-[0_0_0_1px_rgba(74,222,128,0.5),0_0_14px_rgba(74,222,128,0.22)]"
                : "bg-amber-400/15 shadow-[0_0_0_1px_rgba(251,191,36,0.5),0_0_14px_rgba(251,191,36,0.18)]"
            }`}
            style={{
              width: "calc((100% - 0.5rem) / 2)",
              transform: accepting ? "translateX(0)" : "translateX(100%)",
            }}
          />
          {[
            { value: true, label: "Available", dot: "bg-[#4ade80]" },
            { value: false, label: "Not taking orders", dot: "bg-amber-400" },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => chooseAvailability(option.value)}
              className={`relative z-10 flex items-center justify-center gap-2 py-2.5 px-2 rounded-full text-xs sm:text-sm font-semibold transition-colors ${
                accepting === option.value ? "text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${option.dot}`} />
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 px-4 py-3 flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${accepting ? "bg-[#4ade80]" : "bg-amber-400"}`} />
          <div>
            <p className="text-sm font-semibold">{accepting ? "Available" : "Not taking orders"}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {accepting
                ? "The studio appears in the feed and can accept orders whenever an employee is available."
                : "The storefront remains visible and contactable, but new orders are paused."}
            </p>
          </div>
        </div>
      </Card>}

      {section === "profile" && <Card
        title="Rates & Project Scale"
        description="Set an exact price for each build scale. Toggle off sizes the studio doesn't offer."
        aside={
          <button
            type="button"
            onClick={() => setRatesEditing((current) => !current)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 inline-flex items-center gap-1.5"
          >
            <Pencil size={13} />
            {ratesEditing ? "Cancel" : "Edit"}
          </button>
        }
      >
        {ratesEditing ? (
          <>
            <RatesEditor rates={rates} onChange={setRates} />
            <SaveButton
              changed={ratesChanged}
              busy={busy}
              invalid={employeePct === "" || Boolean(validateRates(rates))}
              onClick={saveStudio}
            >
              {busy ? "Saving…" : "Save rates"}
            </SaveButton>
          </>
        ) : (
          <StudioRatesPreview rates={studio.rates} />
        )}
      </Card>}

      {section === "profile" && <section className="detail-fade-up">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-xl">Portfolio</h2>
            <p className="text-xs text-gray-500 mt-1">
              Drag in the studio&apos;s best builds. The first image becomes the cover.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPortfolioEditing((current) => !current)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
          >
            <Pencil size={13} />
            {portfolioEditing ? "Done editing" : "Manage portfolio"}
          </button>
        </div>
        {portfolioEditing ? (
          <div className="glass rounded-3xl p-6 lg:p-8">
            <StudioPortfolioEditor studio={studio} onReload={load} onError={setError} />
          </div>
        ) : studio.portfolio.length === 0 ? (
          <div className="glass rounded-3xl p-12 text-center text-gray-500 text-sm">
            No builds in the studio portfolio yet. Click <strong>Manage portfolio</strong> to add some.
          </div>
        ) : (
          <PortfolioRail studio={studio} onReload={load} onError={setError} editing={false} />
        )}
      </section>}

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
        aside={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-xs font-semibold text-[#4ade80]">
            <Users size={13} />
            {availableMembers.length} available
          </span>
        }
      >
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Create an invite code</h3>
              <p className="text-xs text-gray-500 mt-1">
                Set how many teammates can redeem it and when it should expire.
              </p>
            </div>
            <span className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80]">
              <UserRoundCheck size={17} />
            </span>
          </div>
          <div className="grid md:grid-cols-[1fr_120px_180px_auto] gap-3 items-end">
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
        </div>
        <div className="mt-7 mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Generated invite codes</h3>
              <p className="text-xs text-gray-500 mt-1">Copy, pause, or permanently delete a code.</p>
            </div>
            <span className="text-xs text-gray-500">
              {codes.length} {codes.length === 1 ? "code" : "codes"}
            </span>
          </div>

          {codes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
              <p className="text-sm font-medium text-gray-300">No invite codes yet</p>
              <p className="text-xs text-gray-500 mt-1">Generate one above to start building your team.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {codes.map((codeRow) => {
                const expired = Boolean(
                  codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()
                );
                const enabled = codeRow.status === "active" && !expired;
                const usage = Math.min(
                  100,
                  Math.round(
                    (Number(codeRow.redemptions_used || 0) /
                      Math.max(Number(codeRow.max_redemptions || 1), 1)) *
                      100
                  )
                );
                const actionBusy = codeActionId === codeRow.id;

                return (
                  <article
                    key={codeRow.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5 transition-colors hover:border-white/20"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="break-all font-mono text-lg sm:text-xl font-bold tracking-[0.08em] text-white">
                            {String(codeRow.code)}
                          </code>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                              enabled
                                ? "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#4ade80]"
                                : expired
                                  ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
                                  : "border-white/10 bg-white/5 text-gray-400"
                            }`}
                          >
                            {expired ? "Expired" : codeRow.status}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-400">
                          <span>
                            <strong className="text-gray-200">{codeRow.redemptions_used}</strong>
                            /{codeRow.max_redemptions} uses
                          </span>
                          <span>
                            {codeRow.expires_at
                              ? `Expires ${new Intl.DateTimeFormat(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                }).format(new Date(codeRow.expires_at))}`
                              : "Never expires"}
                          </span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-[#4ade80] transition-[width]"
                            style={{ width: `${usage}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => copyCode(codeRow)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-[#4ade80]/30 hover:bg-[#4ade80]/10 hover:text-[#4ade80]"
                        >
                          {copiedCodeId === codeRow.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedCodeId === codeRow.id ? "Copied" : "Copy"}
                        </button>
                        {!expired && (
                          <button
                            type="button"
                            onClick={() => toggleCode(codeRow)}
                            disabled={actionBusy}
                            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                          >
                            {codeRow.status === "active" ? "Disable" : "Enable"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCode(codeRow)}
                          disabled={actionBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400/40 hover:bg-red-400/10 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        <div className="grid gap-3">
          {members.filter((member) => member.status === "active").map((member) => (
            <div key={member.id} className="rounded-2xl border border-white/10 bg-black/[0.08] p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Earned</p>
                  <p className="text-sm font-bold text-[#4ade80] mt-1">{formatPrice(employeeEarnings.filter((row) => row.builder_id === member.builder_id).reduce((sum, row) => sum + Number(row.amount_kopecks || 0), 0))}</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Completed</p>
                  <p className="text-sm font-bold mt-1">{employeeEarnings.filter((row) => row.builder_id === member.builder_id).length}</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2 col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Current work</p>
                  <p className="text-sm font-bold mt-1">{orders.filter((order) => order.assigned_builder_id === member.builder_id && !["completed", "cancelled"].includes(order.status)).length}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
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
        description="Review incoming work, filter the queue, then confirm each builder assignment."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-xs font-semibold text-gray-300">Show orders</p>
            <p className="text-[11px] text-gray-500 mt-1">Completed and cancelled orders stay available for review.</p>
          </div>
          <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-black/20 p-1" role="group" aria-label="Filter orders by status">
            {[['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={orderStatusFilter === value} onClick={() => setOrderStatusFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${orderStatusFilter === value ? "bg-[#4ade80] text-black" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {visibleOrders.length === 0 && (
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
          {visibleOrders.map((order) => (
            <div key={order.id} className="studio-order-row rounded-2xl border border-white/10 bg-black/[0.08] p-4 flex flex-wrap gap-3 items-center transition-all hover:border-[#4ade80]/30 hover:bg-[#4ade80]/[0.025]">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-semibold">{order.buyer?.display_name || "Buyer"} · {order.size_label || order.building_size}</p>
                <p className="text-xs text-gray-500 mt-1">{order.status} · {formatPrice(order.price_kopecks)}</p>
              </div>
              {["paid", "in_progress"].includes(order.status) && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <select
                    className={`${INPUT} catalog-select max-w-[230px]`}
                    value={assignmentSelections[order.id] ?? order.assigned_builder_id ?? ""}
                    onChange={(event) => setAssignmentSelections((current) => ({ ...current, [order.id]: event.target.value }))}
                    aria-label={`Select builder for order ${order.id}`}
                  >
                    <option value="">Select a builder</option>
                    {members
                      .filter((member) => member.status === "active" && (member.availability_status === "available" || member.builder_id === order.assigned_builder_id))
                      .map((member) => (
                        <option key={member.builder_id} value={member.builder_id}>
                          {member.builder?.display_name || "Builder"}{member.builder_id === order.assigned_builder_id ? " (assigned)" : ""}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => confirmAssignment(order)}
                    disabled={busy || !(assignmentSelections[order.id] || order.assigned_builder_id) || assignmentSelections[order.id] === order.assigned_builder_id}
                    className="px-4 py-2.5 rounded-xl bg-[#4ade80] text-black text-xs font-bold hover:bg-[#22c55e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    <Check size={14} /> Confirm
                  </button>
                </div>
              )}
              <Link href={`/orders/?id=${order.id}`} className="px-3 py-2.5 rounded-xl border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#4ade80] hover:text-black transition-all">
                Open order <ArrowRight size={13} />
              </Link>
            </div>
          ))}
        </div>
      </Card>}

      {section === "payouts" && <Card
        title="Payout"
        description="Choose the exact network and verify the receiving address."
        className="order-2"
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
        title={
          <span>
            <span className="block text-xs font-medium uppercase tracking-[0.16em] text-[#4ade80] mb-1">
              Studio wallet
            </span>
            <span className="block text-2xl">Balance</span>
          </span>
        }
        aside={<span className="text-xs text-gray-500">Balances are shown in USD.</span>}
        className="order-1"
      >
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          {[
            ["Available", balance?.available_cents],
            ["Pending", balance?.pending_cents],
            ["Lifetime paid", balance?.withdrawn_cents],
          ].map(([label, value]) => (
            <div key={label} className="studio-stat-card rounded-2xl bg-black/20 border border-white/10 p-5 transition-all hover:border-[#4ade80]/25">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`font-extrabold text-2xl mt-1 ${
                label === "Available"
                  ? "text-[#4ade80]"
                  : label === "Pending"
                    ? "text-amber-300"
                    : ""
              }`}>
                {formatPrice(Number(value) || 0)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-6 border-t border-white/[0.08]">
          <h3 className="font-bold text-lg">Withdraw funds</h3>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Minimum $20.00. Network or exchange fees may reduce the amount received.
          </p>
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
        </div>
        <div className="mt-6 pt-6 border-t border-white/[0.08] divide-y divide-white/[0.07]">
            <h3 className="font-bold text-lg pb-4">Withdrawal history</h3>
            {withdrawals.length === 0 && (
              <p className="text-sm text-gray-500 py-2">No withdrawals yet.</p>
            )}
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
