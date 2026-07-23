"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRequireAuth } from "../../lib/auth/useRequireAuth";
import { useAuth } from "../../lib/auth/AuthContext";
import { getSupabaseClient } from "../../lib/supabase/client";
import {
  deleteOwnAccount,
  fetchOnboardingState,
  listPortfolioImages,
  saveBuilderAvailability,
  saveBuilderExpertise,
  saveBuilderIdentity,
  saveBuilderPayout,
  saveBuilderRates,
  saveBuilderStyles,
  saveClientProfile,
} from "../../lib/onboarding/api";
import {
  AVAILABILITY_STATES,
  BIO_MAX,
  BUILD_TYPES,
  BUILDER_TOOLS,
  CLIENT_INTEREST_STYLES,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  PROJECT_TYPES,
  RESPONSE_TIMES,
  SERVER_TYPES,
  STYLES,
} from "../../lib/onboarding/constants";
import { RANKS } from "../builders/data/builders";
import {
  commissionBpsForRank,
  formatCommissionRate,
  rankProgress,
} from "../../lib/ranks";
import { withBase } from "../home/utils";
import Avatar from "../../lib/ui/Avatar";
import { Icon } from "../../lib/icons";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import SiteFooter from "../home/components/SiteFooter";
import AvatarUploader from "../onboarding/components/AvatarUploader";
import ChipGrid from "../onboarding/components/ChipGrid";
import HandleInput from "../onboarding/components/HandleInput";
import PortfolioUploader from "../onboarding/components/PortfolioUploader";
import {
  RatesEditor,
  RatesPreview,
  mergeRates,
  normalizeRates,
  validateRates,
} from "../onboarding/components/RatesFields";
import Link from "next/link";
import { listMyOrders } from "../../lib/orders/api";
import { formatPrice, SIZE_META } from "../../lib/pricing";
import {
  cancelWithdrawal,
  getMyPayoutSummary,
  listMyPayoutHistory,
  requestWithdrawal,
} from "../../lib/payouts/api";
import {
  StudioEmployeeDashboard,
  StudioModeratorDashboard,
} from "./StudioAccountDashboard";

const TAGLINE_MAX = 80;

// #rrggbb → rgba(), used for the availability slider's tinted highlight.
function hexToRgba(hex, alpha = 1) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return `rgba(74,222,128,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function responseLabel(hours) {
  if (hours == null) return null;
  return (RESPONSE_TIMES.find((r) => r.hours >= hours) || RESPONSE_TIMES.at(-1))?.label || null;
}

function IconPencil({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconClockSmall({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionHeader({ title, editing, onEdit, onCancel, onSave, saving, canSave = true }) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 className="font-bold text-xl">{title}</h2>
      {editing ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-full text-xs font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {saving && (
              <span className="w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />
            )}
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
        >
          <IconPencil className="w-3.5 h-3.5" />
          Edit
        </button>
      )}
    </div>
  );
}

// ─── Active orders (both roles) ──────────────────────────────────────────────
// The "Orders" tab on the account page: every commission currently in flight,
// whether the user is the builder (incoming work) or the buyer (a purchase).
// A peek at the next few + a link to the full dashboard at /orders.
const ACTIVE_STATUSES = new Set(["paid", "in_progress", "delivered"]);

function ActiveOrdersSection({ userId }) {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listMyOrders().then(({ orders: rows }) => {
      if (cancelled) return;
      // Both sides: rows where the user is the builder OR the buyer. RLS has
      // already scoped the result to this user, so the status filter is all
      // that's left.
      setOrders((rows || []).filter((o) => ACTIVE_STATUSES.has(o.status)));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-xl">Active orders</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Commissions in flight — work you&apos;re building and orders
            you&apos;ve placed.
          </p>
        </div>
        <Link
          href="/orders"
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
        >
          Full dashboard →
        </Link>
      </div>

      {orders === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-500">
          No active orders right now. New commissions appear here the moment
          they&apos;re paid.
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.slice(0, 6).map((o) => {
            // Show the other party + which side of the deal the user is on.
            const asBuilder = o.builder_id === userId;
            const peer = (asBuilder ? o.buyer : o.builder) || {};
            const sizeLabel =
              SIZE_META[o.building_size]?.label || o.building_size;
            return (
              <li key={o.id}>
                {/* A real anchor (not next/link): a full navigation reliably
                    deep-links to the order. A next/link soft navigation doesn't
                    surface ?id= to the orders page's mount-time readOrderId(),
                    so it would land on the list instead. Mirrors NotificationsBell. */}
                <a
                  href={withBase(`/orders/?id=${encodeURIComponent(o.id)}`)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 hover:border-[#4ade80]/40 hover:bg-white/5 transition-all"
                >
                  <Avatar
                    src={peer.avatar_url}
                    name={peer.display_name}
                    className="w-9 h-9 rounded-full ring-1 ring-white/10 flex-shrink-0 text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">
                        {peer.display_name || "Unknown user"}
                      </p>
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide border border-white/10 text-gray-400 flex-shrink-0">
                        {asBuilder ? "Selling" : "Buying"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate capitalize">
                      {sizeLabel} · {o.style} · {o.status.replace("_", " ")}
                    </p>
                  </div>
                  <span className="font-bold text-[#4ade80] text-sm flex-shrink-0">
                    {formatPrice(o.price_kopecks)}
                  </span>
                </a>
              </li>
            );
          })}
          {orders.length > 6 && (
            <li className="text-xs text-gray-500 text-center pt-1">
              +{orders.length - 6} more on the dashboard
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

// ─── Section switcher ────────────────────────────────────────────────────────
// The three top-level views of the account page. A segmented control sits above
// the avatar and toggles which group of cards is shown, so the page no longer
// stacks everything in one long scroll.
const BASE_ACCOUNT_SECTIONS = [
  { key: "profile", label: "Profile", short: "Profile" },
  { key: "orders", label: "Active orders", short: "Orders" },
  { key: "danger", label: "Account", short: "Account" },
];

const STUDIO_ACCOUNT_SECTIONS = [
  { key: "profile", label: "Storefront", short: "Profile" },
  { key: "team", label: "Team", short: "Team" },
  { key: "orders", label: "Orders", short: "Orders" },
  { key: "payouts", label: "Payouts", short: "Payouts" },
  { key: "danger", label: "Account", short: "Account" },
];

function SectionTabs({ section, setSection, isBuilder, isStudio = false }) {
  const sections = isStudio
    ? STUDIO_ACCOUNT_SECTIONS
    : isBuilder
      ? [
        BASE_ACCOUNT_SECTIONS[0],
        { key: "payouts", label: "Payouts", short: "Payouts" },
        ...BASE_ACCOUNT_SECTIONS.slice(1),
      ]
      : BASE_ACCOUNT_SECTIONS;
  const idx = Math.max(0, sections.findIndex((s) => s.key === section));
  return (
    <div
      className="relative grid p-1 rounded-full bg-white/[0.04] border border-white/10 mb-8 detail-fade-up"
      style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label="Account sections"
    >
      {/* Sliding highlight */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-[#4ade80]/15 transition-transform duration-300 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${sections.length})`,
          transform: `translateX(calc(${idx} * 100%))`,
          boxShadow: "0 0 0 1px rgba(74,222,128,0.5), 0 0 14px rgba(74,222,128,0.22)",
        }}
      />
      {sections.map((s) => {
        const isActive = s.key === section;
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setSection(s.key)}
            className={`relative z-10 py-2.5 px-2 rounded-full text-xs sm:text-sm font-semibold transition-colors ${
              isActive ? "text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <span className="sm:hidden">{s.short}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Availability (builders) ─────────────────────────────────────────────────
// A 3-state segmented slider that saves the moment a state is picked — no
// separate edit/confirm step.
// What each availability state means for the builder, in plain terms: whether
// the profile shows up in the /builders feed and whether clients can place an
// order. Keyed to AVAILABILITY_STATES so the copy stays in sync with the slider.
const AVAILABILITY_HELP = {
  available: {
    visible: true,
    orderable: true,
    text: "Your profile is shown in the builders feed and clients can place orders.",
  },
  limited: {
    visible: true,
    orderable: false,
    text: "Your profile stays visible in the builders feed, but clients can't place new orders — they can still message you.",
  },
  busy: {
    visible: false,
    orderable: false,
    text: "Your profile is hidden from the builders feed and clients can't place orders — they can still message you.",
  },
};

function AvailabilitySection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const saved = builderProfile?.availability_status || "available";
  const [value, setValue] = useState(saved);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const statusTimer = useRef(null);

  // Re-sync if the profile is refreshed elsewhere.
  useEffect(() => {
    setValue(saved);
  }, [saved]);

  useEffect(() => () => clearTimeout(statusTimer.current), []);

  const idx = Math.max(0, AVAILABILITY_STATES.findIndex((a) => a.key === value));
  const active = AVAILABILITY_STATES[idx] || AVAILABILITY_STATES[0];

  async function choose(key) {
    if (key === value && status !== "error") return;
    const prev = value;
    setValue(key); // optimistic
    setStatus("saving");
    clearTimeout(statusTimer.current);

    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) {
      setValue(prev);
      setStatus("error");
      return;
    }
    const { error } = await saveBuilderAvailability(supabase, user.id, key);
    if (error) {
      setValue(prev);
      setStatus("error");
      return;
    }
    setStatus("saved");
    statusTimer.current = setTimeout(() => setStatus("idle"), 1800);
    onSaved?.();
  }

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-bold text-xl">Availability</h2>
        <span
          className={`text-xs font-medium transition-opacity duration-300 inline-flex items-center gap-1.5 ${
            status === "idle" ? "opacity-0" : "opacity-100"
          } ${status === "error" ? "text-red-300" : "text-[#4ade80]"}`}
        >
          {status === "saving" && (
            <span className="w-3 h-3 rounded-full border-2 border-[#4ade80]/40 border-t-[#4ade80] animate-spin" />
          )}
          {status === "saving" && "Saving…"}
          {status === "saved" && (
            <span className="inline-flex items-center gap-1">
              <Icon name="check" size={13} strokeWidth={2.5} /> Saved
            </span>
          )}
          {status === "error" && "Couldn't save — try again"}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Let clients know whether you&apos;re taking on new commissions. Changes save instantly.
      </p>

      <div
        className="relative grid grid-cols-3 p-1 rounded-full bg-white/[0.04] border border-white/10"
        role="radiogroup"
        aria-label="Availability"
      >
        {/* Sliding highlight */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 rounded-full transition-transform duration-300 ease-out"
          style={{
            width: "calc((100% - 0.5rem) / 3)",
            transform: `translateX(calc(${idx} * 100%))`,
            backgroundColor: hexToRgba(active.dot, 0.16),
            boxShadow: `0 0 0 1px ${hexToRgba(active.dot, 0.5)}, 0 0 14px ${hexToRgba(active.dot, 0.22)}`,
          }}
        />
        {AVAILABILITY_STATES.map((opt) => {
          const isActive = opt.key === value;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => choose(opt.key)}
              className={`relative z-10 flex items-center justify-center gap-2 py-2.5 px-2 rounded-full text-xs sm:text-sm font-semibold transition-colors ${
                isActive ? "text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: opt.dot, boxShadow: isActive ? `0 0 10px ${opt.dot}` : "none" }}
              />
              <span className="truncate">{opt.short || opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Explanation for the currently selected status only — so builders see
          how this choice affects their feed visibility and whether clients can
          order, without the other states cluttering the view. */}
      {(() => {
        const help = AVAILABILITY_HELP[active.key];
        if (!help) return null;
        return (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-white/20 bg-white/[0.05] p-3">
            <span
              className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: active.dot, boxShadow: `0 0 10px ${active.dot}` }}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {active.short || active.label}
                </span>
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-white/10 text-gray-400">
                  {help.visible ? "Visible in feed" : "Hidden from feed"}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                    help.orderable
                      ? "border-[#4ade80]/30 text-[#4ade80]"
                      : "border-white/10 text-gray-400"
                  }`}
                >
                  {help.orderable ? "Orders open" : "Orders paused"}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mt-1">{help.text}</p>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

// ─── About / bio (shared) ────────────────────────────────────────────────────
function AboutSection({ profile, builderProfile, isBuilder, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(profile?.bio || "");
  const [tagline, setTagline] = useState(builderProfile?.tagline || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setBio(profile?.bio || "");
    setTagline(builderProfile?.tagline || "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    setError(null);
    const payload = {
      avatarUrl: profile?.avatar_url ?? null,
      bannerUrl: profile?.banner_url ?? null,
      bio: bio.trim() || null,
    };
    const { error: err } = isBuilder
      ? await saveBuilderIdentity(supabase, user.id, {
          ...payload,
          tagline: tagline.trim() || null,
        })
      : await saveClientProfile(supabase, user.id, {
          ...payload,
          interests: profile?.interests || [],
          serverType: profile?.preferred_server_type ?? null,
        });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="About"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
      />

      {editing ? (
        <div className="space-y-4">
          {isBuilder && (
            <div>
              <label htmlFor="acc-tagline" className="onb-label block mb-2">Tagline</label>
              <input
                id="acc-tagline"
                type="text"
                className="onb-input"
                placeholder="Master spawn builder — medieval & fantasy specialist"
                value={tagline}
                onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX))}
                maxLength={TAGLINE_MAX}
              />
              <p className="mt-2 text-xs text-gray-500">{tagline.length}/{TAGLINE_MAX}</p>
            </div>
          )}
          <div>
            <label htmlFor="acc-bio" className="onb-label block mb-2">Bio</label>
            <textarea
              id="acc-bio"
              className="onb-input onb-textarea"
              placeholder={
                isBuilder
                  ? "Share your story, what you love building, the kind of projects you take on…"
                  : "Tell builders what kind of work you're hiring for."
              }
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
            />
            <p className="mt-2 text-xs text-gray-500">{bio.length}/{BIO_MAX}</p>
          </div>
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {isBuilder && builderProfile?.tagline && (
            <p className="text-sm text-[#4ade80] font-semibold break-words">{builderProfile.tagline}</p>
          )}
          {profile?.bio ? (
            <p className="text-gray-400 leading-relaxed break-words whitespace-pre-wrap">{profile.bio}</p>
          ) : (
            <p className="text-gray-500 text-sm italic">
              No bio yet. Click <strong>Edit</strong> to add one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Payout (builders) ───────────────────────────────────────────────────────
const PAYOUT_NETWORKS = [
  {
    key: "usdt_trc20",
    label: "TRC-20",
    badge: "USDT · TRC-20",
    hint: "Tron network · lower fees · address starts with T",
    placeholder: "T… (34 characters)",
    regex: /^T[A-HJ-NP-Za-km-z1-9]{33}$/,
    formatError: "Invalid TRC-20 address — must start with T and be exactly 34 characters.",
  },
  {
    key: "usdt_erc20",
    label: "ERC-20",
    badge: "USDT · ERC-20",
    hint: "Ethereum network · higher fees · address starts with 0x",
    placeholder: "0x… (42 characters)",
    regex: /^0x[0-9a-fA-F]{40}$/i,
    formatError: "Invalid ERC-20 address — must start with 0x and be exactly 42 characters.",
  },
];

const PAYOUT_METHODS = [
  ...PAYOUT_NETWORKS,
  {
    key: "sepa_eur",
    label: "EUR SEPA",
    badge: "EUR SEPA bank transfer",
    hint: "Unavailable until NOWPayments approves marketplace-beneficiary payouts for BuildEx.",
    disabled: true,
  },
];

async function verifyWalletOnChain(networkKey, address) {
  try {
    if (networkKey === "usdt_trc20") {
      const r = await fetch(
        `https://apilist.tronscan.org/api/account?address=${encodeURIComponent(address)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!r.ok) return { state: "error", msg: "Couldn't reach Tron network to verify." };
      const data = await r.json();
      if (!data?.address || data.address !== address) {
        return { state: "warn", msg: "Address not found on-chain yet — confirm it's yours before saving." };
      }
      return { state: "ok", msg: null };
    }
    if (networkKey === "usdt_erc20") {
      const r = await fetch("https://cloudflare-eth.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
      });
      if (!r.ok) return { state: "error", msg: "Couldn't reach Ethereum network to verify." };
      const data = await r.json();
      if (data?.error || !("result" in data)) return { state: "error", msg: "Couldn't verify this address." };
      if (parseInt(data.result, 16) === 0) {
        return { state: "warn", msg: "No on-chain activity detected — confirm it's your address before saving." };
      }
      return { state: "ok", msg: null };
    }
    return { state: "error", msg: "Unknown network." };
  } catch {
    return { state: "error", msg: "Couldn't reach verification service — double-check the address manually." };
  }
}

function PayoutSection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [network, setNetwork] = useState(null);
  const [address, setAddress] = useState("");
  const [addrError, setAddrError] = useState(null);
  const [verify, setVerify] = useState({ state: "idle", msg: null });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function resolveNetwork(method) {
    if (method === "usdt_trc20" || method === "usdt_erc20" || method === "sepa_eur") return method;
    if (method === "crypto") return "usdt_trc20"; // legacy
    return null;
  }

  function startEdit() {
    setNetwork(resolveNetwork(builderProfile?.payout_method));
    setAddress(builderProfile?.payout_details || "");
    setAddrError(null);
    setVerify({ state: "idle", msg: null });
    setError(null);
    setEditing(true);
  }

  function pickNetwork(key) {
    setNetwork(key);
    setAddress("");
    setAddrError(null);
    setVerify({ state: "idle", msg: null });
  }

  function validateFormat(net, addr) {
    if (!addr) return null;
    if (net === "sepa_eur") return "EUR SEPA withdrawals are not enabled yet.";
    const meta = PAYOUT_NETWORKS.find((n) => n.key === net);
    return meta && !meta.regex.test(addr) ? meta.formatError : null;
  }

  function onAddressChange(val) {
    setAddress(val);
    setAddrError(validateFormat(network, val.trim()));
    setVerify({ state: "idle", msg: null });
  }

  async function onAddressBlur() {
    const trimmed = address.trim();
    if (!trimmed || addrError || !network) return;
    if (network === "sepa_eur") return;
    setVerify({ state: "checking", msg: null });
    const result = await verifyWalletOnChain(network, trimmed);
    setVerify(result);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    if (!network) { setError("Select a payout method first."); return; }
    const trimmed = address.trim();
    if (!trimmed) { setError("Enter your USDT wallet address."); return; }
    const fmtErr = validateFormat(network, trimmed);
    if (fmtErr) { setAddrError(fmtErr); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await saveBuilderPayout(supabase, user.id, { method: network, details: trimmed });
    setSaving(false);
    if (err) { setError(err.message || "Couldn't save."); return; }
    setEditing(false);
    await onSaved?.();
  }

  const activeMeta = PAYOUT_METHODS.find((n) => n.key === network);
  const canSave = !!network && !!address.trim() && !addrError;
  const savedNetMeta = PAYOUT_METHODS.find((n) => n.key === resolveNetwork(builderProfile?.payout_method));
  const savedWallet = builderProfile?.payout_details || null;

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Payout"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
        canSave={canSave}
      />

      {editing ? (
        <div className="space-y-5">
          {/* Step 1: pick method */}
          <div>
            <div className="onb-label mb-3">Payout method</div>
            <div className="flex gap-2 flex-wrap">
              {PAYOUT_METHODS.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => pickNetwork(n.key)}
                  disabled={n.disabled}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                    n.disabled
                      ? "border-white/10 text-gray-600 cursor-not-allowed"
                      : network === n.key
                      ? "bg-[#4ade80]/10 border-[#4ade80]/60 text-[#4ade80]"
                      : "border-white/15 text-gray-400 hover:border-white/30 hover:text-gray-200"
                  }`}
                >
                  {n.key === "sepa_eur" ? `${n.label} · unavailable` : `USDT - ${n.label}`}
                </button>
              ))}
            </div>
            {activeMeta && (
              <p className="mt-2 text-xs text-gray-500">{activeMeta.hint}</p>
            )}
          </div>

          {/* Step 2: enter address (appears only after network is chosen) */}
          {network && network !== "sepa_eur" && (
            <div>
              <label htmlFor="acc-payout-address" className="onb-label block mb-2">
                Wallet address
              </label>
              <div className="relative">
                <input
                  id="acc-payout-address"
                  type="text"
                  className={`onb-input font-mono text-sm ${addrError ? "is-error" : verify.state === "ok" ? "is-success" : ""}`}
                  style={{ paddingRight: "2.5rem" }}
                  placeholder={activeMeta?.placeholder || ""}
                  value={address}
                  onChange={(e) => onAddressChange(e.target.value)}
                  onBlur={onAddressBlur}
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {verify.state === "checking" && (
                    <span className="block w-4 h-4 rounded-full border-2 border-[#4ade80]/40 border-t-[#4ade80] animate-spin" />
                  )}
                  {verify.state === "ok" && (
                    <Icon name="check" size={16} strokeWidth={2.5} className="text-[#4ade80]" />
                  )}
                  {(verify.state === "warn" || verify.state === "error") && (
                    <Icon name="alert-triangle" size={16} className="text-amber-400" />
                  )}
                </span>
              </div>
              {addrError ? (
                <p className="mt-1.5 text-xs text-red-400">{addrError}</p>
              ) : verify.msg ? (
                <p className={`mt-1.5 text-xs ${verify.state === "ok" ? "text-[#4ade80]" : "text-amber-400"}`}>
                  {verify.msg}
                </p>
              ) : (
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  Your earnings are paid in USDT to this wallet once an order completes.
                  Double-check it — crypto transfers can&apos;t be reversed.
                </p>
              )}
            </div>
          )}

          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {savedWallet ? (
            <>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80]">
                  {savedNetMeta?.badge || "Crypto (USDT)"}
                </span>
              </div>
              <p className="text-xs text-gray-400 break-all font-mono">{savedWallet}</p>
            </>
          ) : (
            <p className="text-gray-500 text-sm italic">
              No payout method set yet. Click <strong>Edit</strong> to add one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Specialties (builders) ─────────────────────────────────────────────────
const WITHDRAWAL_STATUS = {
  requested: ["Awaiting review", "text-amber-300"],
  approved: ["Approved", "text-sky-300"],
  processing: ["Processing", "text-sky-300"],
  sent: ["Sent", "text-[#4ade80]"],
  rejected: ["Rejected", "text-red-300"],
  failed: ["Failed", "text-red-300"],
  cancelled: ["Cancelled", "text-gray-400"],
};

function BuilderPayoutsDashboard({ builderProfile, onSaved }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async () => {
    const [{ summary: totals, error: totalsError }, { payouts, error: historyError }] =
      await Promise.all([getMyPayoutSummary(), listMyPayoutHistory()]);
    setSummary(totals);
    setHistory(payouts);
    setError(totalsError?.message || historyError?.message || null);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const amountCents = Math.round(Number(amount || 0) * 100);
  const available = Number(summary?.available_cents) || 0;
  const minimum = Number(summary?.minimum_cents) || 2000;
  const hasDestination =
    ["usdt_trc20", "usdt_erc20"].includes(builderProfile?.payout_method) &&
    !!builderProfile?.payout_details;
  const canWithdraw =
    hasDestination && amountCents >= minimum && amountCents <= available && !busy;

  async function submitWithdrawal() {
    if (!canWithdraw) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: requestError } = await requestWithdrawal(amountCents);
    setBusy(false);
    if (requestError) {
      setError(requestError.message || "Could not request withdrawal.");
      return;
    }
    setAmount("");
    setNotice("Withdrawal requested. Your balance is reserved pending admin review.");
    await reload();
  }

  async function cancel(id) {
    setBusy(true);
    setError(null);
    const { error: cancelError } = await cancelWithdrawal(id);
    setBusy(false);
    if (cancelError) {
      setError(cancelError.message || "Could not cancel withdrawal.");
      return;
    }
    setNotice("Withdrawal cancelled and funds returned to your available balance.");
    await reload();
  }

  return (
    <div className="space-y-8">
      <section className="reveal glass rounded-3xl p-6 lg:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4ade80]/80">
              Builder wallet
            </p>
            <h2 className="font-bold text-2xl mt-1">Balance</h2>
          </div>
          <span className="text-xs text-gray-500">Balances are shown in USD.</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            ["Available", summary?.available_cents, "text-[#4ade80]"],
            ["Pending", summary?.pending_cents, "text-amber-300"],
            ["Lifetime paid", summary?.paid_cents, "text-white"],
          ].map(([label, cents, cls]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-extrabold mt-1 ${cls}`}>
                {summary ? formatPrice(Number(cents) || 0) : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <PayoutSection builderProfile={builderProfile} onSaved={async () => {
        await onSaved?.();
        await reload();
      }} />

      <section className="reveal glass rounded-3xl p-6 lg:p-8">
        <h2 className="font-bold text-xl">Withdraw funds</h2>
        <p className="text-xs text-gray-500 mt-1 mb-5">
          Minimum {formatPrice(minimum)}. Admin-set wallet or exchange fees are
          deducted from the requested amount, so the amount received may be lower.
        </p>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              min={minimum / 100}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="onb-input"
              style={{ paddingLeft: "2rem" }}
              placeholder={(minimum / 100).toFixed(2)}
            />
          </div>
          <button type="button" onClick={() => setAmount((available / 100).toFixed(2))}
            disabled={!available || busy}
            className="px-4 py-2 rounded-full text-xs font-semibold border border-white/15 text-gray-300 disabled:opacity-40">
            Max
          </button>
          <button type="button" onClick={submitWithdrawal} disabled={!canWithdraw}
            className="px-6 py-2 rounded-full text-sm font-bold bg-[#4ade80] text-black disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? "Submitting…" : "Request withdrawal"}
          </button>
        </div>
        {!hasDestination && (
          <p className="text-xs text-amber-300 mt-3">
            Save a USDT payout destination above before requesting a withdrawal.
          </p>
        )}
        {amountCents > available && (
          <p className="text-xs text-red-400 mt-3">Amount exceeds your available balance.</p>
        )}
        {error && <div role="alert" className="auth-banner auth-banner-error mt-4">{error}</div>}
        {notice && <div className="auth-banner mt-4 text-[#4ade80]">{notice}</div>}
      </section>

      <section className="reveal glass rounded-3xl p-6 lg:p-8">
        <h2 className="font-bold text-xl mb-4">Withdrawal history</h2>
        {history === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">No withdrawals yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((p) => {
              const meta = WITHDRAWAL_STATUS[p.status] || [p.status, "text-gray-300"];
              return (
                <div key={p.id} className="rounded-2xl border border-white/10 p-4 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-semibold">
                      {p.payout_method === "usdt_erc20" ? "USDT · ERC-20" : "USDT · TRC-20"}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {new Date(p.created_at).toLocaleString()}
                    </p>
                    {p.payout_reference && (
                      <p className="text-[11px] text-sky-300 mt-1 break-all">
                        Reference: {p.payout_reference}
                      </p>
                    )}
                    {p.admin_note && (
                      <p className="text-[11px] text-gray-400 mt-1">{p.admin_note}</p>
                    )}
                    {p.rejection_reason && <p className="text-[11px] text-red-300 mt-1">{p.rejection_reason}</p>}
                  </div>
                  <span className="font-bold">{formatPrice(p.amount_cents)}</span>
                  {p.fee_amount_cents != null && (
                    <span className="text-[11px] text-gray-500">
                      Net {formatPrice(p.net_amount_cents ?? p.amount_cents)}
                    </span>
                  )}
                  <span className={`text-xs font-semibold ${meta[1]}`}>{meta[0]}</span>
                  {p.status === "requested" && (
                    <button type="button" onClick={() => cancel(p.id)} disabled={busy}
                      className="px-3 py-1.5 rounded-full text-[11px] border border-white/15 text-gray-300">
                      Cancel
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SpecialtiesSection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [specialties, setSpecialties] = useState(builderProfile?.specialties || []);
  const [buildTypes, setBuildTypes] = useState(builderProfile?.build_types || []);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setSpecialties(builderProfile?.specialties || []);
    setBuildTypes(builderProfile?.build_types || []);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const { error: err } = await saveBuilderStyles(supabase, user.id, {
      specialties,
      buildTypes,
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const canSave = specialties.length >= 1 && buildTypes.length >= 1;
  const savedSpecs = builderProfile?.specialties || [];
  const savedTypes = builderProfile?.build_types || [];

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Specialties"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
        canSave={canSave}
      />

      {editing ? (
        <div className="space-y-6">
          <div>
            <div className="onb-label mb-3">Building styles</div>
            <ChipGrid
              options={STYLES}
              value={specialties}
              onChange={setSpecialties}
              multi
              ariaLabel="Building styles"
            />
          </div>
          <div>
            <div className="onb-label mb-3">Build types</div>
            <ChipGrid
              options={BUILD_TYPES}
              value={buildTypes}
              onChange={setBuildTypes}
              multi
              ariaLabel="Build types"
            />
          </div>
          {!canSave && (
            <p className="text-xs text-gray-500">
              Pick at least one style and one build type.
            </p>
          )}
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Styles</p>
            {savedSpecs.length === 0 ? (
              <p className="text-gray-500 text-sm italic">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedSpecs.map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Build types</p>
            {savedTypes.length === 0 ? (
              <p className="text-gray-500 text-sm italic">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedTypes.map((t) => (
                  <span key={t} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Expertise (builders) ───────────────────────────────────────────────────
function ExpertiseSection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);

  function pickResponse(hours) {
    if (hours == null) return null;
    return (RESPONSE_TIMES.find((r) => r.hours >= hours) || RESPONSE_TIMES.at(-1))?.key || null;
  }

  const [tools, setTools] = useState(builderProfile?.tools || []);
  const [projectTypes, setProjectTypes] = useState(builderProfile?.project_types || []);
  const [responseKey, setResponseKey] = useState(pickResponse(builderProfile?.response_time_hours));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setTools(builderProfile?.tools || []);
    setProjectTypes(builderProfile?.project_types || []);
    setResponseKey(pickResponse(builderProfile?.response_time_hours));
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const responseTimeHours = RESPONSE_TIMES.find((r) => r.key === responseKey)?.hours ?? null;
    const { error: err } = await saveBuilderExpertise(supabase, user.id, {
      tools,
      projectTypes,
      responseTimeHours,
      // Availability is managed by its own section now — preserve the saved
      // value so saving tools/response doesn't reset it.
      availabilityStatus: builderProfile?.availability_status || "available",
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const savedTools = builderProfile?.tools || [];
  const respLabel = RESPONSE_TIMES.find(
    (r) => r.key === pickResponse(builderProfile?.response_time_hours)
  )?.label;

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Tools & response"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
        canSave={tools.length >= 1 && !!responseKey}
      />

      {editing ? (
        <div className="space-y-6">
          <div>
            <div className="onb-label mb-3">Tools used</div>
            <ChipGrid
              options={BUILDER_TOOLS}
              value={tools}
              onChange={setTools}
              multi
            />
          </div>
          <div>
            <div className="onb-label mb-3">Project types</div>
            <ChipGrid
              options={PROJECT_TYPES}
              value={projectTypes}
              onChange={setProjectTypes}
              multi
            />
          </div>
          <div>
            <div className="onb-label mb-3">Response time</div>
            <ChipGrid
              options={RESPONSE_TIMES}
              value={responseKey}
              onChange={setResponseKey}
              multi={false}
            />
          </div>
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Tools used</p>
            {savedTools.length === 0 ? (
              <p className="text-sm text-gray-500 italic">None selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedTools.map((k) => {
                  const meta = BUILDER_TOOLS.find((t) => t.key === k);
                  return (
                    <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300">
                      {meta?.icon && <Icon name={meta.icon} size={13} className="text-gray-400" />}
                      {meta?.label || k}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Response time</p>
            <p className="text-sm text-gray-200">{respLabel || "Not set"}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Open to</p>
            {(builderProfile?.project_types || []).length === 0 ? (
              <p className="text-sm text-gray-500 italic">Nothing selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(builderProfile?.project_types || []).map((k) => {
                  const meta = PROJECT_TYPES.find((p) => p.key === k);
                  return (
                    <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300">
                      {meta?.icon && <Icon name={meta.icon} size={13} className="text-gray-400" />}
                      {meta?.label || k}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Portfolio (builders) ───────────────────────────────────────────────────
function PortfolioSection({ portfolioCount, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadImages = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    const { images: rows } = await listPortfolioImages(supabase, user.id);
    setImages(rows || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadImages();
  }, [loadImages, portfolioCount]);

  return (
    <section className="reveal">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-xl">Portfolio</h2>
          <p className="text-xs text-gray-500 mt-1">
            Drag in your best builds. The first image becomes your cover.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
        >
          <IconPencil className="w-3.5 h-3.5" />
          {editing ? "Done editing" : "Manage portfolio"}
        </button>
      </div>

      {editing ? (
        <div className="glass rounded-3xl p-6 lg:p-8">
          <PortfolioUploader
            userId={user?.id}
            onCountChange={() => {
              loadImages();
              onSaved?.();
            }}
            onError={setError}
          />
          {error && (
            <div role="alert" className="auth-banner auth-banner-error mt-6">
              {error}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="glass rounded-3xl p-12 text-center text-gray-500 text-sm">Loading…</div>
      ) : images.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center text-gray-500 text-sm">
          No builds in your portfolio yet. Click <strong>Manage portfolio</strong> to add some.
        </div>
      ) : (
        <div className="portfolio-scroll-wrapper fade-edges -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          {/* pt-3/pb-3: a horizontal scroller forces its vertical axis to `auto`
              overflow, which would otherwise clip a card's hover lift
              (related-card translateY) and crowd the image against the
              scrollbar. The vertical padding gives the lift, glow and scrollbar
              room so nothing is cut off — on mobile especially. */}
          <div className="portfolio-scroll flex gap-4 overflow-x-auto pt-3 pb-3 snap-x snap-mandatory">
            {images.map((img) => (
              <div key={img.id} className="snap-start portfolio-card related-card glass rounded-2xl overflow-hidden flex-shrink-0">
                <div className="relative aspect-[16/10] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt || ""} className="w-full h-full object-cover" loading="lazy" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Rates (builders) ───────────────────────────────────────────────────────
// ─── Rank & commission (Stage 9) ────────────────────────────────────────────
// Read-only: rank is earned from real metrics (completed orders + rating), not
// edited. Shows the builder their current rank, the commission rate it earns,
// and progress toward the next rank. Numbers come from lib/ranks.js, the same
// source the SQL mirrors, so this matches what place_order will charge.
function RankSection({ builderProfile }) {
  const rankKey = builderProfile?.rank || "rookie";
  const rankMeta = RANKS[rankKey] || RANKS.rookie;
  const commissionBps = commissionBpsForRank(rankKey);
  const completedOrders = Number(builderProfile?.completed_orders) || 0;
  const avgRating = Number(builderProfile?.avg_rating) || 0;
  const reviewsCount = Number(builderProfile?.reviews_count) || 0;

  // Studio promo (migration 0026): a referred builder pays a flat reduced
  // commission for their first 4 months, which overrides the rank rate. Show
  // that as the effective rate while the window is open.
  const promoBps = Number(builderProfile?.studio_promo_bps);
  const promoEnds = builderProfile?.studio_promo_ends_at
    ? new Date(builderProfile.studio_promo_ends_at)
    : null;
  const promoActive =
    !!promoEnds && promoEnds.getTime() > Date.now() && Number.isFinite(promoBps) && promoBps > 0;
  const promoEndsLabel = promoEnds
    ? promoEnds.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const progress = rankProgress({ rank: rankKey, completedOrders, avgRating });
  const nextMeta = progress ? RANKS[progress.next] : null;

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <h3 className="text-lg font-bold mb-1">Rank &amp; Commission</h3>
      <p className="text-xs text-gray-500 mb-5">
        Your rank is earned from completed orders and your average rating. A
        higher rank lowers the platform commission on every order.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${rankMeta.bgClass} ${rankMeta.textClass} ${rankMeta.borderClass}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: rankMeta.dotColor }}
          />
          {rankMeta.label}
        </span>
        <span className="text-sm text-gray-400">
          Platform commission{" "}
          <strong className="text-[#4ade80]">
            {formatCommissionRate(promoActive ? promoBps : commissionBps)}
          </strong>{" "}
          per order
        </span>
        {promoActive && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
            <Icon name="handshake" size={12} />
            Studio promo
          </span>
        )}
      </div>

      {promoActive && (
        <p className="-mt-2 mb-5 text-xs text-emerald-300/80 leading-relaxed">
          Reduced studio rate until {promoEndsLabel} — then{" "}
          {formatCommissionRate(commissionBps)} ({rankMeta.label} rank rate).
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl border border-white/10 px-4 py-3">
          <div className="text-2xl font-extrabold">{completedOrders}</div>
          <div className="text-xs text-gray-500">Completed orders</div>
        </div>
        <div className="rounded-2xl border border-white/10 px-4 py-3">
          <div className="text-2xl font-extrabold">
            {reviewsCount > 0 ? avgRating.toFixed(2) : "—"}
            <span className="text-base text-amber-400"> ★</span>
          </div>
          <div className="text-xs text-gray-500">
            Average rating{reviewsCount > 0 ? ` (${reviewsCount})` : ""}
          </div>
        </div>
      </div>

      {progress ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-4">
          <p className="text-sm font-semibold mb-3">
            Next rank:{" "}
            <span className={nextMeta?.textClass}>{nextMeta?.label}</span>{" "}
            <span className="text-gray-500 font-normal">
              ({formatCommissionRate(commissionBpsForRank(progress.next))} commission)
            </span>
          </p>

          {/* Completed-orders progress */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-gray-400">
                Completed orders
                {progress.ordersMet && <Icon name="check" size={13} strokeWidth={2.5} className="inline-block ml-1 text-[#4ade80] align-text-bottom" />}
              </span>
              <span className="text-gray-500">
                {progress.ordersHave} / {progress.ordersNeed}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4ade80] transition-all"
                style={{ width: `${Math.round(progress.ordersPct * 100)}%` }}
              />
            </div>
          </div>

          {/* Average-rating progress */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-gray-400">
                Average rating
                {progress.ratingMet && <Icon name="check" size={13} strokeWidth={2.5} className="inline-block ml-1 text-[#4ade80] align-text-bottom" />}
              </span>
              <span className="text-gray-500">
                {progress.ratingHave.toFixed(1)} / above {progress.ratingNeed.toFixed(1)}★
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4ade80] transition-all"
                style={{ width: `${Math.round(progress.ratingPct * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-amber-400/30 p-4 text-center">
          <p className="text-sm text-amber-400 font-semibold inline-flex items-center gap-1.5">
            You&apos;ve reached the top rank — Master.
            <Icon name="trophy" size={15} />
          </p>
          <p className="text-xs text-gray-500 mt-1">
            You pay the lowest commission on BuildEx.
          </p>
        </div>
      )}
    </section>
  );
}

function RatesSection({ builderProfile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [rates, setRates] = useState(() => mergeRates(builderProfile?.rates));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const hasRates = !!builderProfile?.rates && Object.keys(builderProfile.rates).length > 0;
  const savedRates = mergeRates(builderProfile?.rates);

  function startEdit() {
    setRates(mergeRates(builderProfile?.rates));
    setError(null);
    setEditing(true);
  }

  async function save() {
    const msg = validateRates(rates);
    if (msg) {
      setError(msg);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const { error: err } = await saveBuilderRates(supabase, user.id, normalizeRates(rates));
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Rates & Project Scale"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
        canSave={!validateRates(rates)}
      />
      <p className="text-xs text-gray-500 -mt-2 mb-5">
        Set an exact price for each build scale. Toggle off any sizes you don&apos;t currently offer.
      </p>

      {editing ? (
        <div className="space-y-4">
          <RatesEditor rates={rates} onChange={setRates} />
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : hasRates ? (
        <RatesPreview rates={savedRates} />
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-gray-400 text-sm">You haven&apos;t set your rates yet.</p>
          <p className="text-gray-500 text-xs mt-1">
            Click <strong>Edit</strong> to add an exact price for each build scale.
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Client preferences ─────────────────────────────────────────────────────
function ClientPreferencesSection({ profile, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [interests, setInterests] = useState(profile?.interests || []);
  const [serverType, setServerType] = useState(profile?.preferred_server_type || null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setInterests(profile?.interests || []);
    setServerType(profile?.preferred_server_type || null);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    const { error: err } = await saveClientProfile(supabase, user.id, {
      avatarUrl: profile?.avatar_url ?? null,
      bannerUrl: profile?.banner_url ?? null,
      bio: profile?.bio ?? null,
      interests,
      serverType,
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't save.");
      return;
    }
    setEditing(false);
    await onSaved?.();
  }

  const savedServer = SERVER_TYPES.find((s) => s.key === profile?.preferred_server_type);

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <SectionHeader
        title="Preferences"
        editing={editing}
        onEdit={startEdit}
        onCancel={() => setEditing(false)}
        onSave={save}
        saving={saving}
      />

      {editing ? (
        <div className="space-y-6">
          <div>
            <div className="onb-label mb-3">Favorite styles</div>
            <ChipGrid options={CLIENT_INTEREST_STYLES} value={interests} onChange={setInterests} multi />
          </div>
          <div>
            <div className="onb-label mb-3">Preferred server type</div>
            <ChipGrid options={SERVER_TYPES} value={serverType} onChange={setServerType} multi={false} />
          </div>
          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Favorite styles</p>
            {(profile?.interests || []).length === 0 ? (
              <p className="text-gray-500 text-sm italic">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(profile?.interests || []).map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Server type</p>
            {savedServer ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-gray-200">
                {savedServer.icon && <Icon name={savedServer.icon} size={14} className="text-gray-400" />}
                {savedServer.label}
              </p>
            ) : (
              <p className="text-gray-500 text-sm italic">Not set.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Account actions + danger zone ───────────────────────────────────────────
function AccountActionsSection() {
  const { user, profile, signOut } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const canDelete = confirmText.trim().toUpperCase() === "DELETE";
  const isStudioAccount = profile?.role === "studio";

  function openConfirm() {
    setConfirmText("");
    setError(null);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (deleting) return;
    setConfirmOpen(false);
  }

  async function handleDelete() {
    if (!canDelete || deleting) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setDeleting(true);
    setError(null);
    const { error: err } = await deleteOwnAccount(supabase);
    if (err) {
      setDeleting(false);
      const missingFn =
        err.code === "PGRST202" ||
        /could not find the function|delete_own_account/i.test(err.message || "");
      setError(
        missingFn
          ? "Account deletion isn't enabled on the database yet. Run Supabase migration 0006 (delete_own_account), then try again."
          : err.message || "Couldn't delete your account. Please try again."
      );
      return;
    }
    // The account row is gone — sign out clears the session and sends home.
    await signOut("/");
  }

  // Close on Escape
  useEffect(() => {
    if (!confirmOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") closeConfirm();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen, deleting]);

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8">
      <h2 className="font-bold text-xl mb-1">Account</h2>
      <p className="text-xs text-gray-500 mb-5">Quick links and account controls.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a
          href={withBase("/builders")}
          className="py-3 px-4 text-sm font-medium rounded-2xl border border-white/15 hover:border-white/40 transition-all ghost-btn text-center"
        >
          Browse builders
        </a>
        <a
          href={withBase("/")}
          className="py-3 px-4 text-sm font-medium rounded-2xl border border-white/15 hover:border-white/40 transition-all ghost-btn text-center"
        >
          Back to home
        </a>
        <button
          type="button"
          onClick={() => signOut()}
          className="py-3 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-2xl border border-white/15 text-gray-200 hover:border-white/40 hover:bg-white/5 transition-all"
        >
          <Icon name="logout" size={16} />
          Log out
        </button>
      </div>

      {/* Danger zone */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-red-400/25 bg-red-500/[0.06] p-5">
          <div className="min-w-0">
            <h3 className="font-semibold text-red-200 text-sm">
              Delete {isStudioAccount ? "studio " : ""}account
            </h3>
            <p className="text-xs text-gray-400 mt-1 max-w-md leading-relaxed">
              {isStudioAccount
                ? "Permanently remove your login and release the suspended studio for administrative recovery."
                : "Permanently remove your account and everything tied to it — profile, availability, portfolio and rates."}{" "}
              This can&apos;t be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={openConfirm}
            className="flex-shrink-0 py-2.5 px-5 text-sm font-semibold rounded-full bg-red-500/15 text-red-200 border border-red-400/40 hover:bg-red-500/25 hover:border-red-400/60 transition-all"
          >
            Delete account
          </button>
        </div>
      </div>

      {/* Confirmation modal — portaled to <body> so it escapes the .glass
          ancestor (whose backdrop-filter would otherwise become the containing
          block for this fixed overlay, breaking full-screen centering/dimming). */}
      {confirmOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={closeConfirm}
          />
          <div className="relative glass rounded-3xl p-6 sm:p-8 w-full max-w-md detail-fade-up shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-400/30 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 id="delete-account-title" className="text-xl font-bold mb-2">
              Delete your {isStudioAccount ? "studio " : ""}account?
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-5">
              {isStudioAccount
                ? "This permanently deletes your BuildEx login. The studio is suspended, stops accepting orders, and can only be recovered by an administrator."
                : "This permanently deletes your BuildEx account and all associated data — profile, availability, portfolio images and rates."}{" "}
              <strong className="text-red-200">This action cannot be undone.</strong>
            </p>
            <label htmlFor="confirm-delete" className="onb-label block mb-2">
              Type <span className="text-red-200 font-bold">DELETE</span> to confirm
            </label>
            <input
              id="confirm-delete"
              type="text"
              className="onb-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              autoFocus
            />
            {error && (
              <div role="alert" className="auth-banner auth-banner-error mt-4">
                {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={deleting}
                className="px-4 py-2 rounded-full text-sm font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || !canDelete}
                className="px-5 py-2 rounded-full text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {deleting && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

// ─── Hero header (avatar + identity) ─────────────────────────────────────────
// Mirrors the public builder profile hero (no banner) so what the builder edits
// reads like what clients will eventually see.
function AccountHeader({ profile, builderProfile, onSaved }) {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState(profile?.username || "");
  const [handleValid, setHandleValid] = useState(Boolean(profile?.username));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const role = profile?.role;
  const isStudio = role === "studio";
  const isEmployee = builderProfile?.profile_type === "studio_employee";
  const isBuilder = (role === "builder" || role === "both") && !isEmployee;

  const trimmedName = displayName.trim();
  const nameValid =
    trimmedName.length >= DISPLAY_NAME_MIN && trimmedName.length <= DISPLAY_NAME_MAX;
  const canSave = nameValid && handleValid && !!handle;
  // Builders carry a rank (rookie → master); show it instead of a bare "builder".
  const rankMeta = isBuilder ? RANKS[builderProfile?.rank] || RANKS.rookie : null;

  const availability = AVAILABILITY_STATES.find(
    (a) => a.key === (builderProfile?.availability_status || "available")
  );
  const respLabel = responseLabel(builderProfile?.response_time_hours);
  const specialties = builderProfile?.specialties || [];

  function startEdit() {
    setAvatarUrl(profile?.avatar_url || null);
    setDisplayName(profile?.display_name || "");
    setHandle(profile?.username || "");
    setHandleValid(Boolean(profile?.username));
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!canSave) return;
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setSaving(true);
    setError(null);
    const payload = {
      displayName: trimmedName,
      handle,
      avatarUrl,
      // Banner is no longer editable; preserve whatever's stored so we don't
      // wipe it with a destructive write.
      bannerUrl: profile?.banner_url ?? null,
      bio: profile?.bio ?? null,
    };
    const { error: err } = isBuilder
      ? await saveBuilderIdentity(supabase, user.id, payload)
      : await saveClientProfile(supabase, user.id, {
          ...payload,
          interests: profile?.interests || [],
          serverType: profile?.preferred_server_type ?? null,
        });
    setSaving(false);
    if (err) {
      if (err.code === "23505" || /duplicate|unique/i.test(err.message || "")) {
        setError("That handle was just taken. Try another one.");
        setHandleValid(false);
      } else {
        setError(err.message || "Couldn't save.");
      }
      return;
    }
    // Push the new identity into AuthContext right away so the navbar avatar
    // and name update immediately instead of waiting on the background re-fetch.
    updateProfile?.({
      avatar_url: avatarUrl ?? null,
      display_name: trimmedName,
      username: handle,
    });
    setEditing(false);
    await onSaved?.();
  }

  return (
    <header className="glass rounded-3xl p-6 sm:p-8 mb-8 detail-fade-up">
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Avatar */}
        <div className="relative flex-shrink-0 mx-auto sm:mx-0">
          {editing ? (
            <AvatarUploader
              userId={user?.id}
              value={avatarUrl}
              onChange={setAvatarUrl}
              onError={setError}
              fallbackInitial={(profile?.display_name || "B").charAt(0).toUpperCase()}
              size={112}
            />
          ) : (
            <>
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || ""}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover ring-2 ring-[#4ade80]/30 shadow-xl"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-[#4ade80]/15 border border-[#4ade80]/40 ring-2 ring-[#4ade80]/30 flex items-center justify-center text-[#4ade80] font-bold text-4xl">
                  {(profile?.display_name || "B").charAt(0).toUpperCase()}
                </div>
              )}
              {isBuilder && availability && (
                <span
                  className="absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-[#1a1a1a]"
                  style={{ background: availability.dot, boxShadow: `0 0 10px ${availability.dot}` }}
                  title={availability.label}
                />
              )}
            </>
          )}
        </div>

        {/* Identity */}
        <div className="w-full sm:w-auto sm:flex-1 min-w-0 text-center sm:text-left">
          {editing ? (
            <div className="space-y-4 text-left">
              <div>
                <label htmlFor="acc-display-name" className="onb-label block mb-2">
                  Your name
                </label>
                <input
                  id="acc-display-name"
                  type="text"
                  className={`onb-input ${
                    displayName && !nameValid ? "is-error" : nameValid ? "is-success" : ""
                  }`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
                  maxLength={DISPLAY_NAME_MAX}
                  placeholder="Your name"
                  autoComplete="off"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  Shown big on your profile. {trimmedName.length}/{DISPLAY_NAME_MAX}
                </p>
              </div>
              <HandleInput
                value={handle}
                onChange={setHandle}
                currentUserId={user?.id}
                onValidityChange={setHandleValid}
                label="Your @nickname"
                hint="Unique to you — used in your profile URL, mentions and DMs."
              />
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1.5 mb-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight break-words min-w-0">
              {profile?.display_name || "Your name"}
            </h2>
            {rankMeta && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${rankMeta.bgClass} ${rankMeta.textClass} ${rankMeta.borderClass}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: rankMeta.dotColor }} />
                {rankMeta.label} {role === "both" ? "Builder & Client" : "Builder"}
              </span>
            )}
          </div>

          {profile?.username && (
            <p className="text-sm text-gray-500 mb-3 break-all">@{profile.username}</p>
          )}

          {!rankMeta && role && (
            <div className="flex justify-center sm:justify-start mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80] capitalize">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] flex-shrink-0" />
                {role}
              </span>
            </div>
          )}

          {isBuilder && (
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-gray-400 mb-4">
              {availability && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: availability.dot, boxShadow: `0 0 8px ${availability.dot}` }} />
                  {availability.label}
                </span>
              )}
              {respLabel && (
                <span className="flex items-center gap-1.5">
                  <IconClockSmall className="w-3.5 h-3.5" />
                  Replies {respLabel.toLowerCase()}
                </span>
              )}
            </div>
          )}

          {isBuilder && specialties.length > 0 && (
            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              {specialties.map((s) => (
                <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400 capitalize">
                  {s}
                </span>
              ))}
            </div>
          )}
            </>
          )}
        </div>

        {/* Edit identity control */}
        <div className="flex items-center gap-2 self-center sm:self-start mx-auto sm:mx-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold border border-white/15 text-gray-300 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !canSave}
                className="px-4 py-2 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {saving && (
                  <span className="w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />
                )}
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="px-3 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all inline-flex items-center gap-1.5"
            >
              <IconPencil className="w-3.5 h-3.5" />
              Edit profile
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="auth-banner auth-banner-error mt-4">
          {error}
        </div>
      )}
    </header>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        </main>
      }
    >
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  useRequireAuth();
  const {
    status,
    user,
    profile: authProfile,
    profileLoaded,
    refresh: refreshAuthProfile,
  } = useAuth();

  const [theme, setTheme] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // Top-level account view: "profile" (visuals/identity), "orders" (active
  // orders), or "danger" (account controls + delete). Toggled by SectionTabs.
  const [section, setSection] = useState("profile");
  // AuthContext owns the profile row (hydrated from localStorage on mount,
  // refreshed from Supabase in the background). The page reads it directly
  // from there instead of re-fetching, which was the source of the duplicate
  // profiles query that timed out on slow Supabase.
  const profile = authProfile;
  const [builderProfile, setBuilderProfile] = useState(null);
  const [portfolioCount, setPortfolioCount] = useState(0);
  const [builderLoaded, setBuilderLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);
  const isLight = theme === "light";

  // True once the main content (which mounts the gradient divs) is rendered.
  // Flips false→true a single time, so the gradient effect below starts only
  // after its target divs exist — and doesn't restart on later profile swaps.
  const contentReady = status !== "loading" && !!profile;

  // `refresh` reads the latest profile only as a prefetch hint. We keep it in a
  // ref so `refresh`'s identity does NOT change when AuthContext swaps in a new
  // profile object — otherwise refresh→refreshAuthProfile→setProfile→new
  // authProfile ref→refresh recreated→effect reruns→refresh again would loop
  // forever, flooding Supabase until every query times out.
  const authProfileRef = useRef(authProfile);
  authProfileRef.current = authProfile;

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) return;
    setLoadError(null);
    // Refresh AuthContext's profile (background — don't gate render on it).
    refreshAuthProfile?.();
    // Builder profile + portfolio count: single attempt, no retry. If they
    // fail (TIMEOUT etc.) we still render the page with whatever profile
    // AuthContext has — the user can hit Edit and re-save to retry.
    const { builderProfile: bp, portfolioCount: pc } = await fetchOnboardingState(
      supabase,
      user.id,
      { prefetchedProfile: authProfileRef.current || undefined }
    );
    setBuilderProfile(bp);
    setPortfolioCount(pc || 0);
    setBuilderLoaded(true);
  }, [user?.id, refreshAuthProfile]);

  useEffect(() => {
    if (status === "authenticated" && user?.id) refresh();
  }, [status, user?.id, refresh]);

  const showSoon = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!theme) return;
    const html = document.documentElement;
    html.classList.toggle("light", isLight);
    html.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  // Animated gradient background (matches the rest of the site)
  useEffect(() => {
    const gradientBg = gradientRef.current;
    const edgeGlow = edgeGlowRef.current;
    if (!gradientBg || !edgeGlow) return;

    const cfg = {
      edgeOffset: 12, speed: 1, smoothing: 0.08,
      idleDrift: 0.00003, swayAmp: 0.015, swaySpeed: 0.0004,
    };
    let cp1 = 0, cp2 = 0.5, tp1 = 0, tp2 = 0.5;
    let lastScroll = window.pageYOffset;
    let raf = 0;
    function periToXY(p, off) {
      const pp = ((p % 1) + 1) % 1;
      const seg = pp * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0:  return { x: off + sp * (100 - off * 2), y: off };
        case 1:  return { x: 100 - off, y: off + sp * (100 - off * 2) };
        case 2:  return { x: 100 - off - sp * (100 - off * 2), y: 100 - off };
        default: return { x: off, y: 100 - off - sp * (100 - off * 2) };
      }
    }
    function tick(ts) {
      const sy = window.pageYOffset;
      const delta = sy - lastScroll;
      if (Math.abs(delta) > 0) {
        tp1 += delta * 0.0008 * cfg.speed;
        tp2 -= delta * 0.0006 * cfg.speed;
      }
      tp1 += cfg.idleDrift;
      tp2 -= cfg.idleDrift * 0.7;
      lastScroll = sy;
      tp1 = ((tp1 % 1) + 1) % 1;
      tp2 = ((tp2 % 1) + 1) % 1;
      let d1 = tp1 - cp1; if (d1 > 0.5) d1 -= 1; if (d1 < -0.5) d1 += 1;
      let d2 = tp2 - cp2; if (d2 > 0.5) d2 -= 1; if (d2 < -0.5) d2 += 1;
      cp1 += d1 * cfg.smoothing;
      cp2 += d2 * cfg.smoothing;
      const sw1 = Math.sin(ts * cfg.swaySpeed) * cfg.swayAmp;
      const sw2 = Math.cos(ts * cfg.swaySpeed * 1.3) * cfg.swayAmp * 0.8;
      const p1 = periToXY(cp1 + sw1, cfg.edgeOffset);
      const p2 = periToXY(cp2 + sw2, cfg.edgeOffset + 3);
      gradientBg.style.setProperty("--gradient-x", `${p1.x}%`);
      gradientBg.style.setProperty("--gradient-y", `${p1.y}%`);
      gradientBg.style.setProperty("--gradient-x2", `${p2.x}%`);
      gradientBg.style.setProperty("--gradient-y2", `${p2.y}%`);
      const breathe = 1 + Math.sin(ts * 0.0003) * 0.12;
      edgeGlow.style.opacity = `${0.45 + breathe * 0.2}`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [contentReady]);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); obs.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [profile, builderProfile, section]);

  // Render the spinner only when we have NOTHING to show. As soon as either
  // the cached profile from AuthContext or a fresh fetch lands, paint the
  // page — that gives us a near-instant reload on the cached path. Builder
  // data fills in once `refresh()` resolves.
  if (status === "loading" || (!profile && !profileLoaded)) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-3xl p-8 sm:p-10 border border-red-400/30 text-center max-w-md">
          <div className="w-12 h-12 mx-auto mb-5 rounded-2xl bg-red-500/15 border border-red-400/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-xl font-semibold mb-2">Couldn&apos;t load your profile</div>
          <p className="text-gray-400 text-sm mb-6">
            {loadError || "We hit a snag fetching your account. Please try again."}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="inline-block px-6 py-3 bg-[#4ade80] text-black font-semibold rounded-full green-glow hover:scale-105 transition-all"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const role = profile.role;
  const isStudio = role === "studio";
  const isEmployee = builderProfile?.profile_type === "studio_employee";
  const isBuilder = (role === "builder" || role === "both") && !isEmployee;
  const isClient = role === "client" || role === "both";

  return (
    <div className={`builder-profile-root ${isLight ? "light" : ""} catalog-root min-h-screen flex flex-col`}>
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

      <CatalogNavbar
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showSoon}
      />
      <CatalogMobileMenu
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={showSoon}
      />

      <div
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-none transition-all duration-500 ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="glass catalog-toast rounded-2xl px-5 py-3 text-sm font-medium text-[#4ade80] flex items-center gap-2 shadow-2xl max-w-sm text-center">
          <span className="text-[#4ade80] flex-shrink-0">✦</span>
          <span>{toast}</span>
        </div>
      </div>

      <main className="relative z-10 pt-24 lg:pt-28 pb-20 flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page intro */}
          <div className="mb-6 detail-fade-up">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4ade80]/80 mb-1.5">
              {isStudio ? "Studio settings" : "Profile settings"}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight logo-font">
              {isStudio ? "Your studio" : "Your profile"}
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              {isStudio
                ? "Manage your storefront, team, orders and payouts in focused sections."
                : isBuilder
                ? "Manage how you appear to clients across BuildEx — your identity, availability, portfolio and rates."
                : "Manage your account details and building preferences."}
            </p>
          </div>

          {/* Section switcher — sits above the avatar and picks which group
              of cards is shown, so the page is no longer one long stack. */}
          {isStudio ? (
            <>
              <SectionTabs
                section={section}
                setSection={setSection}
                isBuilder={false}
                isStudio
              />
              {section === "danger" ? (
                <div className="space-y-8">
                  <AccountActionsSection />
                </div>
              ) : (
                <StudioModeratorDashboard section={section} />
              )}
            </>
          ) : isEmployee ? (
            <StudioEmployeeDashboard builderProfile={builderProfile} />
          ) : (
            <>
          <SectionTabs section={section} setSection={setSection} isBuilder={isBuilder} />

          {section === "profile" && (
            <>
              <AccountHeader
                profile={profile}
                builderProfile={builderProfile}
                onSaved={refresh}
              />

              <div className="space-y-8">
                {isBuilder && (
                  <AvailabilitySection builderProfile={builderProfile} onSaved={refresh} />
                )}

                <AboutSection
                  profile={profile}
                  builderProfile={builderProfile}
                  isBuilder={isBuilder}
                  onSaved={refresh}
                />

                {isBuilder && (
                  <>
                    <RankSection builderProfile={builderProfile} />
                    <PortfolioSection portfolioCount={portfolioCount} onSaved={refresh} />
                    <RatesSection builderProfile={builderProfile} onSaved={refresh} />
                    <SpecialtiesSection builderProfile={builderProfile} onSaved={refresh} />
                    <ExpertiseSection builderProfile={builderProfile} onSaved={refresh} />
                  </>
                )}

                {isClient && !isBuilder && (
                  <ClientPreferencesSection profile={profile} onSaved={refresh} />
                )}
              </div>
            </>
          )}

          {section === "orders" && (
            <div className="space-y-8">
              <ActiveOrdersSection userId={user?.id} />
            </div>
          )}

          {section === "payouts" && isBuilder && (
            <BuilderPayoutsDashboard builderProfile={builderProfile} onSaved={refresh} />
          )}

          {section === "danger" && (
            <div className="space-y-8">
              <AccountActionsSection />
            </div>
          )}
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
