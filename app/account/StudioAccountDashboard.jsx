"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  GripHorizontal,
  ImagePlus,
  Inbox,
  MessageCircle,
  Pencil,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
  UserMinus,
  UserRoundCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  addStudioPortfolioImage,
  assignStudioOrder,
  cancelStudioWithdrawal,
  createEmployeeCode,
  createStudioBuilderInvitation,
  deleteEmployeeCode,
  deleteStudioPortfolioImage,
  fetchMyStudio,
  getStudioBalance,
  listEmployeeCodes,
  listMyEmployeeEarnings,
  listStudioEmployeeEarnings,
  listStudioMembers,
  searchIndependentBuilders,
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
import { RANKS } from "../builders/data/builders";
import { withBase } from "../home/utils";
import {
  AVAILABILITY_STATES,
  BIO_MAX,
  BUILDER_TOOLS,
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

const TOOL_LABELS = Object.fromEntries(BUILDER_TOOLS.map(({ key, label }) => [key, label]));
const AVAILABILITY_COPY = Object.fromEntries(
  AVAILABILITY_STATES.map(({ key, label, short }) => [key, { label, short }])
);
const AVAILABILITY_PRESENTATION = {
  available: {
    Icon: Check,
    badge: "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#86efac]",
    icon: "bg-[#4ade80] text-[#07120a] shadow-[0_0_14px_rgba(74,222,128,0.3)]",
  },
  limited: {
    Icon: Clock3,
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    icon: "bg-amber-400 text-[#181204] shadow-[0_0_14px_rgba(251,191,36,0.24)]",
  },
  busy: {
    Icon: X,
    badge: "border-red-400/30 bg-red-400/10 text-red-200",
    icon: "bg-red-400 text-[#190707] shadow-[0_0_14px_rgba(248,113,113,0.24)]",
  },
};
const TEAM_AVAILABILITY_OPTIONS = [
  { value: "all", label: "All availability" },
  { value: "available", label: "Available" },
  { value: "limited", label: "Limited capacity" },
  { value: "busy", label: "Not taking work" },
];
const TEAM_SORT_OPTIONS = [
  { value: "name", label: "Sort: Name" },
  { value: "availability", label: "Sort: Availability" },
  { value: "active-work", label: "Sort: Active work" },
  { value: "completed", label: "Sort: Completed" },
];

function readableProfileValue(value, labels = {}) {
  if (!value) return "";
  return (
    labels[value] ||
    String(value)
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function TeamFilterMenu({ label, value, options, onChange, icon: MenuIcon }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const selected = options.find((option) => option.value === value) || options[0];
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === selected.value),
    0
  );
  const menuId = `team-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

  function openAndFocus(index) {
    setOpen(true);
    requestAnimationFrame(() => optionRefs.current[index]?.focus());
  }

  function handleTriggerKeyDown(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") openAndFocus(0);
    else if (event.key === "End") openAndFocus(options.length - 1);
    else if (event.key === "ArrowUp") {
      openAndFocus(selectedIndex > 0 ? selectedIndex - 1 : options.length - 1);
    } else {
      openAndFocus(selectedIndex < options.length - 1 ? selectedIndex + 1 : 0);
    }
  }

  function handleOptionKeyDown(event, index) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") optionRefs.current[0]?.focus();
    else if (event.key === "End") optionRefs.current[options.length - 1]?.focus();
    else if (event.key === "ArrowUp") {
      optionRefs.current[index > 0 ? index - 1 : options.length - 1]?.focus();
    } else {
      optionRefs.current[index < options.length - 1 ? index + 1 : 0]?.focus();
    }
  }

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsidePress(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="team-filter-menu relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={`team-filter-trigger flex w-full items-center gap-2.5 rounded-2xl border bg-black/25 px-3.5 py-2.5 text-left text-sm font-medium outline-none ${
          open
            ? "border-[#4ade80]/55 bg-[#4ade80]/[0.055] text-white shadow-[0_0_0_4px_rgba(74,222,128,0.08)]"
            : "border-white/10 text-gray-200 hover:border-white/20"
        }`}
      >
        {MenuIcon && <MenuIcon size={15} aria-hidden="true" className="shrink-0 text-gray-500" />}
        <span className="min-w-0 flex-1 truncate">{selected.label}</span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`shrink-0 text-gray-500 transition-transform duration-300 ${
            open ? "rotate-180 text-[#4ade80]" : ""
          }`}
        />
      </button>
      <div
        id={menuId}
        role="listbox"
        aria-label={label}
        data-open={open ? "true" : "false"}
        className="team-filter-options absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-white/10 bg-[#171a18]/95 p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              tabIndex={open ? 0 : -1}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={`team-filter-option flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${
                active
                  ? "bg-[#4ade80]/12 font-semibold text-[#86efac]"
                  : "text-gray-300 hover:bg-white/[0.055] hover:text-white"
              }`}
            >
              <span className="flex-1">{option.label}</span>
              <Check
                size={14}
                aria-hidden="true"
                className={`text-[#4ade80] transition-all duration-200 ${
                  active ? "scale-100 opacity-100" : "scale-75 opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const router = useRouter();
  const [studio, setStudio] = useState(null);
  const [members, setMembers] = useState([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [invitedBuilderIds, setInvitedBuilderIds] = useState(() => new Set());
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [invitationActionId, setInvitationActionId] = useState(null);
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
  const [memberQuery, setMemberQuery] = useState("");
  const [memberAvailabilityFilter, setMemberAvailabilityFilter] = useState("all");
  const [memberSort, setMemberSort] = useState("name");
  const [assignmentOrder, setAssignmentOrder] = useState(null);
  const [assignmentTarget, setAssignmentTarget] = useState(null);
  const [assigningBuilder, setAssigningBuilder] = useState(false);
  const [ratesEditing, setRatesEditing] = useState(false);
  const [portfolioEditing, setPortfolioEditing] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [aboutEditing, setAboutEditing] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState("idle");
  const availabilityTimer = useRef(null);
  const candidateSearchTimer = useRef(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeConfirmation, setRemoveConfirmation] = useState("");
  const [removingMember, setRemovingMember] = useState(false);

  const canRemoveMember = removeConfirmation.trim().toUpperCase() === "REMOVE";

  function openRemoveConfirmation(member) {
    setRemoveTarget(member);
    setRemoveConfirmation("");
    setError(null);
  }

  function closeRemoveConfirmation() {
    if (!removingMember) setRemoveTarget(null);
  }

  async function confirmRemoveMember() {
    if (!removeTarget || !canRemoveMember || removingMember) return;
    setRemovingMember(true);
    const result = await removeStudioEmployee(removeTarget.builder_id, removeConfirmation);
    setRemovingMember(false);
    if (result.error) {
      setError(result.error.message || "Couldn't remove this builder.");
      return;
    }
    setRemoveTarget(null);
    setNotice(`${removeTarget.builder?.display_name || "Builder"} was removed from the studio.`);
    load();
  }

  const openOrder = useCallback((orderId) => {
    router.push(withBase(`/orders/?id=${encodeURIComponent(orderId)}`));
  }, [router]);

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
  useEffect(() => () => clearTimeout(candidateSearchTimer.current), []);

  useEffect(() => {
    if (section !== "team" || candidateQuery.trim().length < 2) {
      setCandidates([]);
      return undefined;
    }
    clearTimeout(candidateSearchTimer.current);
    candidateSearchTimer.current = setTimeout(async () => {
      setCandidateBusy(true);
      const result = await searchIndependentBuilders(candidateQuery);
      setCandidateBusy(false);
      if (result.error) setError(result.error.message || "Couldn't search builders.");
      else setCandidates(result.builders || []);
    }, 250);
    return () => clearTimeout(candidateSearchTimer.current);
  }, [candidateQuery, section]);

  const availableMembers = useMemo(
    () =>
      members.filter(
        (member) => member.status === "active" && member.availability_status === "available"
      ),
    [members]
  );
  const teamMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    const active = members
      .filter((member) => member.status === "active")
      .map((member) => {
        const profile = member.builder?.builder_profile || {};
        const memberOrders = orders.filter(
          (order) => order.assigned_builder_id === member.builder_id
        );
        const earnings = employeeEarnings.filter(
          (row) => row.builder_id === member.builder_id
        );
        return {
          ...member,
          profile,
          trackedEarnings: earnings.reduce(
            (sum, row) => sum + Number(row.amount_kopecks || 0),
            0
          ),
          completedProjects: memberOrders.filter((order) => order.status === "completed").length,
          activeAssignments: memberOrders.filter(
            (order) => !["completed", "cancelled"].includes(order.status)
          ).length,
        };
      })
      .filter((member) => {
        if (
          memberAvailabilityFilter !== "all" &&
          member.availability_status !== memberAvailabilityFilter
        ) {
          return false;
        }
        if (!query) return true;
        return [
          member.builder?.display_name,
          member.builder?.username,
          member.builder?.bio,
          ...(member.profile.tools || []),
          ...(member.profile.specialties || []),
          ...(member.profile.project_types || []),
        ].some((value) => String(value || "").toLowerCase().includes(query));
      });

    return active.sort((a, b) => {
      if (memberSort === "active-work") return b.activeAssignments - a.activeAssignments;
      if (memberSort === "completed") return b.completedProjects - a.completedProjects;
      if (memberSort === "availability") {
        const priority = { available: 0, limited: 1, busy: 2 };
        const difference =
          (priority[a.availability_status] ?? 3) - (priority[b.availability_status] ?? 3);
        if (difference) return difference;
      }
      return String(a.builder?.display_name || a.builder?.username || "").localeCompare(
        String(b.builder?.display_name || b.builder?.username || "")
      );
    });
  }, [
    employeeEarnings,
    memberAvailabilityFilter,
    memberQuery,
    memberSort,
    members,
    orders,
  ]);
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

  function closeAssignmentDialog() {
    if (assigningBuilder) return;
    setAssignmentOrder(null);
    setAssignmentTarget(null);
  }

  async function confirmAssignment() {
    if (!assignmentOrder || !assignmentTarget || assigningBuilder) return;
    setAssigningBuilder(true);
    setError(null);
    const result = await assignStudioOrder(
      assignmentOrder.id,
      assignmentTarget.builder_id
    );
    setAssigningBuilder(false);
    if (result.error) {
      setError(result.error.message || "Couldn't assign the order.");
      return;
    }
    const builderName =
      assignmentTarget.builder?.display_name ||
      assignmentTarget.builder?.username ||
      "Builder";
    setAssignmentOrder(null);
    setAssignmentTarget(null);
    setNotice(`${builderName} was assigned to the order.`);
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
        <section className="detail-fade-up glass studio-profile-hero rounded-3xl p-6 lg:p-8">
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
            <>
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
            <div className="mt-7 pt-5 border-t border-white/[0.08] grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-extrabold">{studio.completed_projects || 0}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Projects</p>
              </div>
              <div>
                <p className="text-xl font-extrabold">{Number(studio.avg_rating || 0).toFixed(2)}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Avg. rating</p>
              </div>
              <div>
                <p className="text-xl font-extrabold">{availableMembers.length}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Available builders</p>
              </div>
            </div>
            </>
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
        <div className="studio-availability-switch relative grid grid-cols-2 p-1 rounded-full bg-white/[0.04] border border-white/10">
          <span
            aria-hidden="true"
            className={`studio-availability-indicator absolute inset-y-1 left-1 rounded-full transition-[transform,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
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
              aria-pressed={accepting === option.value}
              className={`relative z-10 flex items-center justify-center gap-2 py-2.5 px-2 rounded-full text-xs sm:text-sm font-semibold transition-[color,transform] duration-300 ${
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
        <div className="rounded-2xl border border-[#4ade80]/15 bg-[#4ade80]/[0.04] p-4 sm:p-5 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Invite an existing builder</h3>
              <p className="text-xs text-gray-500 mt-1">Search independent builders by handle or display name. Their profile data stays intact if they accept.</p>
            </div>
            <Users size={17} className="text-[#4ade80]" />
          </div>
          <input
            className={INPUT}
            value={candidateQuery}
            onChange={(event) => setCandidateQuery(event.target.value)}
            placeholder="Search @handle or builder name"
          />
          {candidateQuery.trim().length > 0 && candidateQuery.trim().length < 2 && (
            <p className="text-xs text-gray-500 mt-2">Type at least two characters.</p>
          )}
          {candidateBusy && <p className="text-xs text-gray-500 mt-3">Searching builders…</p>}
          {!candidateBusy && candidates.length > 0 && (
            <div className="mt-3 grid gap-2">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 transition-[transform,background-color,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-[#4ade80]/25 hover:bg-[#4ade80]/[0.04] hover:shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
                  <Avatar src={candidate.avatar_url} name={candidate.display_name || candidate.username || "Builder"} className="w-9 h-9 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold truncate">{candidate.display_name || "Builder"}</p>
                      {candidate.builder_profile?.rank && (
                        <span className="rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-2 py-0.5 text-[10px] font-semibold text-[#86efac]">
                          {(RANKS[candidate.builder_profile.rank] || RANKS.rookie).label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">@{candidate.username}</p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      ★ {Number(candidate.builder_profile?.avg_rating || 0).toFixed(2)} · {Number(candidate.builder_profile?.reviews_count || 0)} reviews · {Number(candidate.builder_profile?.completed_orders || 0)} projects
                    </p>
                  </div>
                  <Link
                    href={`/builders/profile?u=${encodeURIComponent(candidate.username)}`}
                    className="team-action-button inline-flex rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-[#4ade80]/50 hover:bg-white/[0.04] hover:text-[#4ade80]"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    disabled={invitationActionId === candidate.id || Boolean(candidate.pending_invitation_id) || invitedBuilderIds.has(candidate.id)}
                    onClick={async () => {
                      setInvitationActionId(candidate.id);
                      const result = await createStudioBuilderInvitation(candidate.id);
                      setInvitationActionId(null);
                      if (result.error) setError(result.error.message || "Couldn't send the invitation.");
                      else {
                        setNotice("Studio invitation sent.");
                        setInvitedBuilderIds((current) => {
                          const next = new Set(current);
                          next.add(candidate.id);
                          return next;
                        });
                        setCandidates((current) => current.map((item) => item.id === candidate.id
                          ? { ...item, pending_invitation_id: result.invitationId, pending_invitation_status: "pending" }
                          : item
                        ));
                      }
                    }}
                    className={`team-action-button px-3 py-2 rounded-xl text-xs font-bold transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-300 ease-out disabled:cursor-not-allowed ${candidate.pending_invitation_id || invitedBuilderIds.has(candidate.id)
                      ? "border border-white/10 bg-white/10 text-gray-500 opacity-100"
                      : "bg-[#4ade80] text-black disabled:opacity-50 hover:-translate-y-0.5 hover:bg-[#86efac] hover:shadow-[0_8px_20px_rgba(74,222,128,0.22)]"}`}
                  >
                    {invitationActionId === candidate.id ? "Sending…" : candidate.pending_invitation_id || invitedBuilderIds.has(candidate.id) ? "Invited" : "Invite"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!candidateBusy && candidateQuery.trim().length >= 2 && candidates.length === 0 && (
            <p className="text-xs text-gray-500 mt-3">No eligible independent builders found.</p>
          )}
        </div>
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
            className="team-action-button h-[46px] px-5 rounded-2xl bg-[#4ade80] text-black text-sm font-bold transition-all hover:bg-[#22c55e] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(74,222,128,0.24)] disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
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
                    className="team-member-card rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5 transition-colors hover:border-white/20"
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
                          className="team-action-button inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-[#4ade80]/30 hover:bg-[#4ade80]/10 hover:text-[#4ade80]"
                        >
                          {copiedCodeId === codeRow.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedCodeId === codeRow.id ? "Copied" : "Copy"}
                        </button>
                        {!expired && (
                          <button
                            type="button"
                            onClick={() => toggleCode(codeRow)}
                            disabled={actionBusy}
                            className="team-action-button rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                          >
                            {codeRow.status === "active" ? "Disable" : "Enable"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCode(codeRow)}
                          disabled={actionBusy}
                          className="team-action-button inline-flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400/40 hover:bg-red-400/10 disabled:opacity-50"
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
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_190px]">
            <label className="relative">
              <span className="sr-only">Search team members</span>
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="search"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="Search name, handle, tool, or specialty"
                className={`${INPUT} py-2.5 pl-10`}
              />
            </label>
            <TeamFilterMenu
              label="Filter by availability"
              value={memberAvailabilityFilter}
              options={TEAM_AVAILABILITY_OPTIONS}
              onChange={setMemberAvailabilityFilter}
              icon={SlidersHorizontal}
            />
            <TeamFilterMenu
              label="Sort team members"
              value={memberSort}
              options={TEAM_SORT_OPTIONS}
              onChange={setMemberSort}
            />
          </div>
          <p className="mt-3 text-xs text-gray-500" aria-live="polite">
            Showing {teamMembers.length} of {members.filter((member) => member.status === "active").length} builders
          </p>
        </div>

        {teamMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
            <p className="font-semibold text-gray-200">No builders match these filters</p>
            <p className="mt-1 text-sm text-gray-500">Try another search or availability setting.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {teamMembers.map((member) => {
              const availability = AVAILABILITY_COPY[member.availability_status] || {
                short: "Status unavailable",
                label: "The builder has not set an availability preference.",
              };
              const availabilityPresentation =
                AVAILABILITY_PRESENTATION[member.availability_status] || {
                  Icon: ShieldCheck,
                  badge: "border-white/15 bg-white/[0.05] text-gray-300",
                  icon: "bg-gray-500 text-white",
                };
              const AvailabilityIcon = availabilityPresentation.Icon;
              const tools = member.profile.tools || [];
              const specialties = member.profile.specialties || [];

              return (
                <article key={member.id} className="team-member-card overflow-hidden rounded-3xl border border-white/10 bg-black/[0.12] p-5 sm:p-6">
                  <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-center gap-4">
                      <Avatar
                        src={member.builder?.avatar_url}
                        name={member.builder?.display_name || "Builder"}
                        className="h-14 w-14 rounded-2xl ring-2 ring-[#4ade80]/25 text-lg"
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-bold text-white">{member.builder?.display_name || "Builder"}</h3>
                        <p className="truncate text-sm text-gray-400">@{member.builder?.username || "unknown"}</p>
                      </div>
                    </div>
                    <div className="sm:ml-auto sm:max-w-[290px]">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-bold ${availabilityPresentation.badge}`}
                      >
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${availabilityPresentation.icon}`}
                        >
                          <AvailabilityIcon size={13} strokeWidth={3} aria-hidden="true" />
                        </span>
                        {availability.short}
                      </span>
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                        {availability.label}
                      </p>
                    </div>
                  </header>

                  <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {[
                      ["Tracked earnings", formatPrice(member.trackedEarnings), true],
                      ["Completed projects", member.completedProjects, false],
                      ["Active assignments", member.activeAssignments, false],
                    ].map(([label, value, accent]) => (
                      <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
                        <p className="text-xs font-medium text-gray-400">{label}</p>
                        <p className={`mt-1 text-xl font-extrabold ${accent ? "text-[#4ade80]" : "text-white"}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.75fr)]">
                    <div className="min-w-0 space-y-4">
                      {tools.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Proficient tools</p>
                          <div className="flex flex-wrap gap-2">
                            {tools.map((tool) => (
                              <span key={tool} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-gray-200">
                                {readableProfileValue(tool, TOOL_LABELS)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {specialties.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Build specialties</p>
                          <div className="flex flex-wrap gap-2">
                            {specialties.map((specialty) => (
                              <span key={specialty} className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/[0.06] px-3 py-1.5 text-xs font-medium text-[#86efac]">
                                {readableProfileValue(specialty)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                        About
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-gray-300">
                        {member.builder?.bio || "This builder has not added an introduction yet."}
                      </p>
                    </div>
                  </div>

                  <footer className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4 sm:justify-end">
                      <Link
                        href={`/chats?to=${encodeURIComponent(member.builder?.username || "")}`}
                        className="team-action-button group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#4ade80]/30 bg-[#4ade80]/10 px-4 py-2.5 text-sm font-bold text-[#86efac] shadow-[0_8px_24px_rgba(74,222,128,0.08)] hover:border-[#4ade80]/60 hover:bg-[#4ade80] hover:text-black hover:shadow-[0_12px_28px_rgba(74,222,128,0.2)]"
                      >
                        <MessageCircle size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:scale-110" />
                        Message
                      </Link>
                      <button
                        type="button"
                        onClick={() => openRemoveConfirmation(member)}
                        className="team-action-button group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.04] px-4 py-2.5 text-sm font-semibold text-red-300 hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-200 hover:shadow-[0_12px_28px_rgba(248,113,113,0.12)]"
                      >
                        <UserMinus size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-x-0.5" />
                        Remove
                      </button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
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
          <div className="relative grid grid-cols-4 items-center rounded-2xl border border-white/10 bg-black/20 p-1" role="group" aria-label="Filter orders by status">
            <span
              aria-hidden="true"
              className="absolute inset-y-1 left-1 rounded-xl bg-[#4ade80] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{
                width: "calc((100% - 0.5rem) / 4)",
                transform: `translateX(${["active", "completed", "cancelled", "all"].indexOf(orderStatusFilter) * 100}%)`,
              }}
            />
            {[['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={orderStatusFilter === value} onClick={() => setOrderStatusFilter(value)} className={`relative z-10 rounded-xl px-3 py-2 text-xs font-semibold transition-colors duration-300 ${orderStatusFilter === value ? "text-black" : "text-gray-400 hover:text-white"}`}>
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
          {visibleOrders.map((order, orderIndex) => {
            const assignedMember = members.find(
              (member) => member.builder_id === order.assigned_builder_id
            );
            const canAssign = ["paid", "in_progress"].includes(order.status);
            const createdDate = order.created_at
              ? new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(order.created_at))
              : null;

            return (
              <article
                key={order.id}
                className="studio-order-row rounded-3xl border border-white/10 bg-black/[0.08] p-5 hover:border-white/[0.17] hover:bg-white/[0.018] sm:p-6"
                style={{ "--order-index": orderIndex }}
              >
                <div className="flex flex-col gap-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                        Order #{String(order.id).slice(0, 8)}
                      </p>
                      <span className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#86efac]">
                        {String(order.status || "new").replaceAll("_", " ")}
                      </span>
                    </div>
                    {createdDate && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <CalendarDays size={13} />
                        Placed {createdDate}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-5 md:flex-row md:items-end">
                    <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                          Client nickname
                        </dt>
                        <dd className="mt-1.5 truncate text-base font-semibold text-gray-100">
                          @{order.buyer?.username || order.buyer?.display_name || "buyer"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                          Build style
                        </dt>
                        <dd className="mt-1.5 truncate text-base font-semibold text-gray-100">
                          {order.style || "Custom"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                          Project size
                        </dt>
                        <dd className="mt-1.5 truncate text-base font-semibold text-gray-100">
                          {order.size_label || order.building_size || "Custom"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                          Order value
                        </dt>
                        <dd className="mt-1.5 text-base font-bold text-[#4ade80]">
                          {formatPrice(order.price_kopecks)}
                        </dd>
                      </div>
                    </dl>

                    <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:min-w-[250px]">
                      {canAssign && (
                        <button
                          type="button"
                          onClick={() => {
                            setAssignmentOrder(order);
                            setAssignmentTarget(null);
                          }}
                          className="studio-pressable inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#4ade80] px-4 py-3 text-xs font-bold text-black hover:bg-[#5ee88c]"
                        >
                          <UserRoundCheck size={14} />
                          {order.assigned_builder_id ? "Change builder" : "Assign builder"}
                        </button>
                      )}
                      <Link
                        href={withBase(`/orders/?id=${encodeURIComponent(order.id)}`)}
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          event.preventDefault();
                          openOrder(order.id);
                        }}
                        className={`studio-pressable ${canAssign ? "" : "col-span-2"} inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.035] px-4 py-3 text-xs font-semibold text-gray-200 hover:border-white/25 hover:bg-white/[0.06]`}
                      >
                        Open order <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>

                  {assignedMember && (
                    <p className="border-t border-white/[0.06] pt-3 text-xs text-gray-500">
                      Assigned to{" "}
                      <span className="font-semibold text-gray-300">
                        @{assignedMember.builder?.username ||
                          assignedMember.builder?.display_name ||
                          "builder"}
                      </span>
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Card>}

      {assignmentOrder && (
        <OrderAssignmentDialog
          order={assignmentOrder}
          members={members}
          confirmingMember={assignmentTarget}
          assigning={assigningBuilder}
          onChoose={setAssignmentTarget}
          onConfirm={confirmAssignment}
          onClose={closeAssignmentDialog}
        />
      )}

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
      {removeTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-builder-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-md"
            onClick={closeRemoveConfirmation}
            aria-label="Close remove builder confirmation"
          />
          <div className="relative w-full max-w-md rounded-3xl border border-red-400/25 bg-[#181a19] p-6 shadow-2xl">
            <h3 id="remove-builder-title" className="text-xl font-bold text-red-100">Remove builder?</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              This removes <strong className="text-gray-200">{removeTarget.builder?.display_name || "this builder"}</strong> from your studio. They will lose access to studio work and return to an independent profile.
            </p>
            <label htmlFor="confirm-remove-builder" className="onb-label mt-5 block mb-2">
              Type <span className="font-bold text-red-200">REMOVE</span> to confirm
            </label>
            <input
              id="confirm-remove-builder"
              type="text"
              className="onb-input"
              value={removeConfirmation}
              onChange={(event) => setRemoveConfirmation(event.target.value)}
              placeholder="REMOVE"
              autoComplete="off"
              autoFocus
            />
            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={closeRemoveConfirmation} disabled={removingMember} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={confirmRemoveMember} disabled={removingMember || !canRemoveMember} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                {removingMember && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {removingMember ? "Removing…" : "Remove builder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderAssignmentDialog({
  order,
  members,
  confirmingMember,
  assigning,
  onChoose,
  onConfirm,
  onClose,
}) {
  const dialogRef = useRef(null);
  const sortedMembers = useMemo(
    () =>
      members
        .filter((member) => member.status === "active")
        .sort((a, b) => {
          const availabilityDifference =
            Number(b.availability_status === "available") -
            Number(a.availability_status === "available");
          if (availabilityDifference) return availabilityDifference;
          return (a.builder?.display_name || a.builder?.username || "").localeCompare(
            b.builder?.display_name || b.builder?.username || ""
          );
        }),
    [members]
  );
  const availableCount = sortedMembers.filter(
    (member) => member.availability_status === "available"
  ).length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape" && !assigning) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [assigning, onClose]);

  if (!order) return null;

  return (
    <div
      className="studio-assignment-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !assigning) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-dialog-title"
        tabIndex={-1}
        className="studio-assignment-dialog relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-[#171b18] shadow-[0_30px_100px_rgba(0,0,0,0.65)] outline-none sm:rounded-[1.75rem]"
      >
        <div className="relative border-b border-white/[0.08] px-5 py-5 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(74,222,128,0.12),transparent_48%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#4ade80]">
                Order assignment
              </p>
              <h2 id="assignment-dialog-title" className="mt-1.5 text-xl font-bold sm:text-2xl">
                Choose the right builder
              </h2>
              <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-gray-400 sm:text-sm">
                {order.style || "Custom"} · {order.size_label || order.building_size} ·{" "}
                {formatPrice(order.price_kopecks)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={assigning}
              aria-label="Close builder selection"
              className="studio-pressable rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-gray-400 hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-2.5 py-1 text-[#86efac]">
              {availableCount} available now
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-gray-400">
              {sortedMembers.length} team members
            </span>
          </div>
        </div>

        <div className="studio-builder-list overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {sortedMembers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
              <Users className="mx-auto text-gray-500" size={25} />
              <p className="mt-3 text-sm font-semibold">No active builders yet</p>
              <p className="mt-1 text-xs text-gray-500">
                Add builders from the Team section before assigning this order.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedMembers.map((member, index) => {
                const profile = member.builder?.builder_profile || {};
                const available = member.availability_status === "available";
                const assigned = member.builder_id === order.assigned_builder_id;
                const styles = profile.specialties || [];
                const builderName =
                  member.builder?.display_name || member.builder?.username || "Builder";

                return (
                  <article
                    key={member.builder_id}
                    className={`studio-builder-option rounded-2xl border p-4 sm:p-5 ${
                      available
                        ? "border-white/10 bg-white/[0.025] hover:border-white/[0.18] hover:bg-white/[0.04]"
                        : "border-white/[0.06] bg-black/15 opacity-65"
                    }`}
                    style={{ "--builder-index": index }}
                  >
                    <div className="grid gap-4 sm:grid-cols-[minmax(145px,0.75fr)_minmax(245px,1.45fr)_auto] sm:items-center sm:gap-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <Avatar
                            src={member.builder?.avatar_url}
                            name={builderName}
                            className="h-12 w-12 rounded-2xl text-lg ring-1 ring-white/10 sm:h-14 sm:w-14"
                          />
                          <span
                            className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-[#171b18] ${
                              available ? "bg-[#4ade80]" : "bg-amber-400"
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-gray-100 sm:text-base">
                            {builderName}
                          </h3>
                          <p className="truncate text-xs text-gray-500">
                            @{member.builder?.username || "unknown"}
                          </p>
                        </div>
                      </div>

                      <div className="min-w-0 border-white/[0.06] sm:border-l sm:pl-5">
                        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-600">
                          Build styles
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {styles.length > 0 ? (
                            styles.slice(0, 4).map((style) => (
                              <span
                                key={style}
                                className={`rounded-full border px-2 py-1 text-[10px] ${
                                  style === order.style
                                    ? "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#86efac]"
                                    : "border-white/10 bg-white/[0.025] text-gray-400"
                                }`}
                              >
                                {style}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-gray-500">No styles listed</span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Star size={12} className="text-amber-300" />
                            {Number(profile.avg_rating || 0).toFixed(1)} rating
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <BriefcaseBusiness size={12} />
                            {Number(profile.completed_orders || 0)} completed
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={12} />
                            Responds in {profile.response_time_hours || "—"}h
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-stretch sm:justify-center">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wider ${
                            available
                              ? "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#4ade80]"
                              : "border-amber-400/20 bg-amber-400/[0.08] text-amber-300"
                          }`}
                        >
                          {assigned ? "Assigned" : available ? "Available" : "Busy"}
                        </span>
                        <button
                          type="button"
                          onClick={() => onChoose(member)}
                          disabled={!available || assigned || assigning}
                          className="studio-pressable min-w-[92px] rounded-xl bg-[#4ade80] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#5ee88c] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-gray-500 disabled:transform-none"
                        >
                          {assigned ? "Assigned" : available ? "Assign" : "Unavailable"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {confirmingMember && (
          <div className="studio-confirm-layer absolute inset-0 z-10 flex items-end justify-center bg-black/75 p-4 backdrop-blur-md sm:items-center sm:p-8">
            <div className="studio-confirm-card w-full max-w-md rounded-3xl border border-white/10 bg-[#1c211d] p-5 shadow-2xl sm:p-6">
              <div className="flex items-center gap-3">
                <Avatar
                  src={confirmingMember.builder?.avatar_url}
                  name={confirmingMember.builder?.display_name || "Builder"}
                  className="h-12 w-12 rounded-2xl text-lg ring-2 ring-[#4ade80]/25"
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4ade80]">
                    Confirm assignment
                  </p>
                  <h3 className="truncate text-lg font-bold">
                    {confirmingMember.builder?.display_name || "Builder"}
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-gray-400">
                Assign this {order.style || "custom"} order to{" "}
                <strong className="text-gray-100">
                  @{confirmingMember.builder?.username || "builder"}
                </strong>
                ? They’ll be notified immediately and marked busy.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onChoose(null)}
                  disabled={assigning}
                  className="studio-pressable rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-white/[0.05] disabled:opacity-40"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={assigning}
                  className="studio-pressable rounded-xl bg-[#4ade80] px-4 py-3 text-sm font-bold text-black hover:bg-[#5ee88c] disabled:cursor-wait disabled:opacity-60"
                >
                  {assigning ? "Assigning…" : "Confirm assignment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function EmployeeOrdersCard({
  assignedOrders,
  assignmentFilter,
  assignmentFilters,
  activeAssignmentFilter,
  onFilterChange,
  userId,
}) {
  const activeIndex = Math.max(
    0,
    assignmentFilters.findIndex((filter) => filter.key === assignmentFilter)
  );

  return (
    <Card
      title="Studio assignments"
      description="Track active work, completed builds, disputes, and your commission on every order."
      aside={
        <span className="hidden rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-semibold text-[#86efac] sm:inline-flex">
          {assignedOrders.length} total
        </span>
      }
    >
      <div
        className="relative mb-5 grid grid-cols-4 rounded-2xl border border-white/10 bg-white/[0.025] p-1"
        role="tablist"
        aria-label="Assignment status"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 rounded-xl bg-[#4ade80]/15 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: "calc((100% - 0.5rem) / 4)",
            transform: `translateX(calc(${activeIndex} * 100%))`,
            boxShadow:
              "0 0 0 1px rgba(74,222,128,0.45), 0 0 16px rgba(74,222,128,0.14)",
          }}
        />
        {assignmentFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={filter.key === assignmentFilter}
            onClick={() => onFilterChange(filter.key)}
            className={`relative z-10 inline-flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-semibold transition-colors sm:text-xs ${
              filter.key === assignmentFilter
                ? "text-white"
                : "text-gray-500 hover:text-gray-200"
            }`}
          >
            <span className="truncate">{filter.label}</span>
            {filter.rows.length > 0 && (
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                  filter.key === "disputed"
                    ? "bg-red-400/20 text-red-300"
                    : filter.key === assignmentFilter
                      ? "bg-[#4ade80]/25 text-[#86efac]"
                      : "bg-white/[0.07] text-gray-500"
                }`}
              >
                {filter.rows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {activeAssignmentFilter.rows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/15 bg-black/[0.08] px-6 py-10 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80]">
              <Inbox size={22} />
            </span>
            <p className="text-sm font-semibold">
              No {activeAssignmentFilter.label.toLowerCase()} assignments
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Orders in this stage will appear here automatically.
            </p>
          </div>
        )}
        {activeAssignmentFilter.rows.map((order, orderIndex) => {
          const assignment = order.assignments?.find(
            (row) => row.builder_id === userId
          );
          const commissionBps = Number(
            assignment?.employee_commission_bps ??
              order.employee_commission_bps_snapshot ??
              0
          );
          const createdDate = order.created_at
            ? new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(order.created_at))
            : null;
          const isCurrent = order.assigned_builder_id === userId;

          return (
            <article
              key={order.id}
              className="studio-order-row rounded-3xl border border-white/10 bg-black/[0.08] p-5 hover:border-[#4ade80]/25 hover:bg-white/[0.018] sm:p-6"
              style={{ "--order-index": orderIndex }}
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                      Order #{String(order.id).slice(0, 8)}
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${
                        order.status === "disputed"
                          ? "border-red-400/25 bg-red-400/10 text-red-300"
                          : order.status === "completed"
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                            : "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]"
                      }`}
                    >
                      {String(order.status || "new").replaceAll("_", " ")}
                    </span>
                    {!isCurrent && (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                        Historical
                      </span>
                    )}
                  </div>
                  {createdDate && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                      <CalendarDays size={13} />
                      Placed {createdDate}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
                  <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-5">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                        Client
                      </dt>
                      <dd className="mt-1.5 truncate text-sm font-semibold text-gray-100">
                        @{order.buyer?.username || order.buyer?.display_name || "buyer"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                        Build style
                      </dt>
                      <dd className="mt-1.5 truncate text-sm font-semibold capitalize text-gray-100">
                        {order.style || "Custom"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                        Project size
                      </dt>
                      <dd className="mt-1.5 truncate text-sm font-semibold text-gray-100">
                        {order.size_label || order.building_size || "Custom"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                        Order value
                      </dt>
                      <dd className="mt-1.5 text-sm font-bold text-[#4ade80]">
                        {formatPrice(order.price_kopecks)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
                        Your commission
                      </dt>
                      <dd className="mt-1.5 text-sm font-bold text-[#86efac]">
                        {(commissionBps / 100).toFixed(2)}%
                      </dd>
                    </div>
                  </dl>

                  <Link
                    href={withBase(`/orders/?id=${encodeURIComponent(order.id)}`)}
                    className="studio-pressable inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.035] px-5 py-3 text-xs font-semibold text-gray-200 hover:border-[#4ade80]/35 hover:bg-[#4ade80]/10 hover:text-[#86efac] lg:w-auto"
                  >
                    Open order <ArrowRight size={13} />
                  </Link>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-[11px] text-gray-500">
                  <span>{isCurrent ? "Current studio assignment" : "Archived studio assignment"}</span>
                  {assignment?.released_at && (
                    <span>
                      Released {new Date(assignment.released_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

export function StudioEmployeeDashboard({ builderProfile, section = "profile", onAvailabilitySaved }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(builderProfile?.availability_status || "available");
  const [earnings, setEarnings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [assignmentFilter, setAssignmentFilter] = useState("active");
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

  useEffect(() => {
    setStatus(builderProfile?.availability_status || "available");
  }, [builderProfile?.availability_status]);

  const total = earnings.reduce((sum, row) => sum + Number(row.amount_kopecks || 0), 0);
  const active = orders.find(
    (order) =>
      order.assigned_builder_id === user?.id &&
      ["paid", "in_progress", "delivered", "disputed"].includes(order.status)
  );
  const assignedOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assigned_builder_id === user?.id ||
          order.assignments?.some((assignment) => assignment.builder_id === user?.id)
      ),
    [orders, user?.id]
  );
  const assignmentFilters = useMemo(() => {
    const activeStatuses = new Set(["pending_payment", "paid", "in_progress", "delivered"]);
    const buckets = {
      active: assignedOrders.filter((order) => activeStatuses.has(order.status)),
      completed: assignedOrders.filter((order) => order.status === "completed"),
      disputed: assignedOrders.filter((order) => order.status === "disputed"),
      all: assignedOrders,
    };
    return [
      { key: "active", label: "Active", rows: buckets.active },
      { key: "completed", label: "Completed", rows: buckets.completed },
      { key: "disputed", label: "Disputed", rows: buckets.disputed },
      { key: "all", label: "All", rows: buckets.all },
    ];
  }, [assignedOrders]);
  const activeAssignmentFilter =
    assignmentFilters.find((filter) => filter.key === assignmentFilter) ||
    assignmentFilters[0];

  const employeeStatus = status === "busy" ? "busy" : "available";
  const statusOptions = [
    { key: "available", label: "Available", dot: "#4ade80" },
    { key: "busy", label: "Busy", dot: "#f87171" },
  ];
  const statusIndex = Math.max(0, statusOptions.findIndex((option) => option.key === employeeStatus));
  const activeStatus = statusOptions[statusIndex];

  return (
    <div className="space-y-6">
      {error && <div className="auth-banner auth-banner-error">{error}</div>}
      {section === "profile" && <Card title="Employment status">
        <p className="text-xs text-gray-500 mb-4">
          Let your studio know whether you can take on another assignment. Changes save instantly.
        </p>
        <div
          className="relative grid grid-cols-2 p-1 rounded-full bg-white/[0.04] border border-white/10"
          role="radiogroup"
          aria-label="Employment status"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 rounded-full transition-transform duration-300 ease-out"
            style={{
              width: "calc((100% - 0.5rem) / 2)",
              transform: `translateX(calc(${statusIndex} * 100%))`,
              backgroundColor: `${activeStatus.dot}29`,
              boxShadow: `0 0 0 1px ${activeStatus.dot}80, 0 0 14px ${activeStatus.dot}38`,
            }}
          />
          {statusOptions.map(({ key, label, dot }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={employeeStatus === key}
              disabled={Boolean(active)}
              onClick={async () => {
                if (key === employeeStatus) return;
                setError(null);
                const result = await setMyEmployeeAvailability(key);
                if (result.error) setError(result.error.message);
                else {
                  setStatus(key);
                  await onAvailabilitySaved?.();
                }
              }}
              className={`relative z-10 flex items-center justify-center gap-2 py-2.5 px-2 rounded-full text-xs sm:text-sm font-semibold transition-colors ${
                employeeStatus === key ? "text-white" : "text-gray-400 hover:text-gray-200"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: dot, boxShadow: employeeStatus === key ? `0 0 10px ${dot}` : "none" }}
              />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {active && <p className="mt-4 text-xs text-gray-500">Status is controlled by your active order.</p>}
      </Card>}
      {section === "orders" && (
        <EmployeeOrdersCard
          assignedOrders={assignedOrders}
          assignmentFilter={assignmentFilter}
          assignmentFilters={assignmentFilters}
          activeAssignmentFilter={activeAssignmentFilter}
          onFilterChange={setAssignmentFilter}
          userId={user?.id}
        />
      )}
      {section === "payouts" && <Card title="Payment balance" description="Your studio commission is already accounted for in every amount shown.">
        <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/[0.06] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86efac]">Earned through your studio</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#4ade80]">{formatPrice(total)}</p>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-gray-400">
            This is your tracked share after the studio&apos;s commission. Payments are not available in BuildEx yet, so your studio will settle this balance separately.
          </p>
        </div>
        <div className="mt-5 divide-y divide-white/[0.07]">
          {earnings.length === 0 && <p className="py-4 text-sm text-gray-500">Completed studio work will appear here once it earns a commission.</p>}
          {earnings.map((row) => (
            <div key={row.id} className="py-3 flex justify-between gap-3 text-sm">
              <span>{row.studio?.name || "Studio"} · {(Number(row.commission_bps) / 100).toFixed(2)}%</span>
              <span className="font-semibold">{formatPrice(row.amount_kopecks)}</span>
            </div>
          ))}
        </div>
      </Card>}
    </div>
  );
}
