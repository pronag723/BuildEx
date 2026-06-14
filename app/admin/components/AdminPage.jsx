"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Moderator console
// A dedicated operator surface for admins (profiles.is_admin). Lists rejected
// (disputed) orders — and optionally every order — and, per order, gives the
// moderator everything needed to act: the full brief + fee split, the read-only
// conversation, the delivered world file, the 3D preview, and the dispute
// resolve actions. All data comes through the admin-only RPCs + storage policies
// in migration 0023 (lib/admin/api.js); resolution still routes through
// resolve_dispute (0015), which re-checks is_admin server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import {
  listAdminOrders,
  getAdminMessages,
  getAdminDeliveryUrl,
  getAdminPreviewUrl,
} from "../../../lib/admin/api";
import { resolveDispute } from "../../../lib/disputes/api";
import { formatPrice, SIZE_META } from "../../../lib/pricing";
import { publicAsset } from "../../home/utils";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import { useGradientBackground } from "../../../lib/ui/useGradientBackground";
import WorldPreview from "../../orders/components/WorldPreview";

const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  in_progress: "In progress",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const TABS = [
  { key: "open_disputes", label: "Open disputes" },
  { key: "rejected", label: "All rejected" },
  { key: "all", label: "All orders" },
];

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

function clockTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanFileSize(bytes) {
  const b = Number(bytes);
  if (!b || b < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminPage() {
  useRequireAuth();
  const { profile, status } = useAuth();
  const isAdmin = profile?.is_admin === true;

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
        <div className="max-w-4xl mx-auto">
          {!ready ? (
            <Spinner />
          ) : !isAdmin ? (
            <NotAuthorized />
          ) : (
            <ModeratorConsole />
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

function ModeratorConsole() {
  const [tab, setTab] = useState("open_disputes");
  const [orders, setOrders] = useState(null); // null = loading
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setOrders(null);
    setError(null);
    listAdminOrders(tab).then(({ orders: rows, error: e }) => {
      if (e) setError(e.message || "Failed to load orders");
      setOrders(rows || []);
    });
  }, [tab]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80] text-[11px] font-bold uppercase tracking-widest mb-2">
            <span aria-hidden>🛡️</span> Moderator console
          </div>
          <h1 className="text-2xl font-extrabold">Order moderation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review rejected orders end-to-end — chat, delivered file, 3D preview —
            and resolve disputes by releasing escrow or refunding the buyer.
          </p>
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
              tab === t.key
                ? "border-[#4ade80] bg-[#4ade80]/15 text-[#4ade80]"
                : "border-white/10 text-gray-300 hover:border-[#4ade80]/40 hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {orders === null ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-gray-500">
          {tab === "open_disputes"
            ? "No open disputes. 🎉"
            : "No orders to show here."}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <OrderModerationCard key={o.order_id} order={o} onResolved={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderModerationCard({ order, onResolved }) {
  const [expanded, setExpanded] = useState(false);
  const sizeLabel =
    order.size_label || SIZE_META[order.building_size]?.label || order.building_size;
  const isOpenDispute = order.status === "disputed" && order.dispute_status === "open";

  return (
    <div className="glass rounded-3xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 uppercase tracking-widest">
            {sizeLabel} · <span className="capitalize">{order.style}</span> ·{" "}
            <span className="text-gray-400">{STATUS_LABEL[order.status] || order.status}</span>
          </p>
          <p className="text-sm text-gray-300 mt-0.5">
            <strong className="text-gray-100">
              {order.buyer_display_name || order.buyer_username || "Buyer"}
            </strong>{" "}
            vs{" "}
            <strong className="text-gray-100">
              {order.builder_display_name || order.builder_username || "Builder"}
            </strong>
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Created {formatDate(order.created_at)}
            {order.dispute_opened_at && ` · disputed ${formatDate(order.dispute_opened_at)}`}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-[#4ade80] text-sm">
            {formatPrice(order.price_kopecks)}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-semibold text-[#4ade80] hover:underline"
          >
            {expanded ? "Hide details" : "Open case"}
          </button>
        </div>
      </div>

      {order.dispute_reason && (
        <div className="p-3 rounded-2xl bg-red-400/[0.07] border border-red-400/20">
          <span className="text-[10px] text-red-300/80 uppercase tracking-widest block mb-1">
            Buyer's reason
          </span>
          <p className="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
            {order.dispute_reason}
          </p>
        </div>
      )}

      {expanded && <CaseDetails order={order} onResolved={onResolved} isOpenDispute={isOpenDispute} />}
    </div>
  );
}

function CaseDetails({ order, onResolved, isOpenDispute }) {
  return (
    <div className="space-y-4 pt-2 border-t border-white/[0.06]">
      {/* Fee split — moderators see the full breakdown. */}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <FeeStat label="Buyer paid" value={formatPrice(order.price_kopecks)} />
        <FeeStat label="Platform fee" value={formatPrice(order.commission_kopecks)} />
        <FeeStat label="Builder earns" value={formatPrice(order.builder_earnings_kopecks)} />
      </dl>

      <div>
        <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">
          Brief
        </span>
        <p className="bx-scroll text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed p-3 rounded-2xl bg-black/30 border border-white/10 max-h-48 overflow-y-auto">
          {order.brief}
        </p>
      </div>

      <DeliveryBlock order={order} />
      <ChatBlock orderId={order.order_id} />

      {isOpenDispute && <ResolveBlock orderId={order.order_id} onResolved={onResolved} />}
    </div>
  );
}

function FeeStat({ label, value }) {
  return (
    <div className="p-2.5 rounded-2xl bg-black/30 border border-white/10">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
      <p className="text-sm font-bold text-gray-200 mt-0.5">{value}</p>
    </div>
  );
}

function DeliveryBlock({ order }) {
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [err, setErr] = useState(null);

  const onDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setErr(null);
    const { url, error } = await getAdminDeliveryUrl(order.delivery_path, order.delivery_file_name);
    setDownloading(false);
    if (error || !url) {
      setErr(error?.message || "Could not generate a download link.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [order.delivery_path, order.delivery_file_name, downloading]);

  // Admin-side loader for the shared WorldPreview (bypasses participant RLS).
  const loadPreview = useCallback(async () => {
    const { url, error } = await getAdminPreviewUrl(order.preview_path);
    return { url, meta: order.preview_meta, error };
  }, [order.preview_path, order.preview_meta]);

  if (!order.delivery_path) {
    return (
      <div className="p-3 rounded-2xl bg-black/20 border border-white/10 text-sm text-gray-500">
        No world file has been delivered for this order.
      </div>
    );
  }

  return (
    <>
      <div className="p-3 rounded-2xl bg-black/30 border border-white/10 flex items-center gap-3 flex-wrap">
        <span aria-hidden className="text-2xl">📦</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{order.delivery_file_name}</p>
          <p className="text-[11px] text-gray-500">{humanFileSize(order.delivery_size)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {order.has_preview && (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="px-4 py-2 rounded-full text-xs font-semibold border border-white/15 text-gray-200 hover:bg-white/5 transition-all"
            >
              🧊 3D preview
            </button>
          )}
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="px-4 py-2 rounded-full text-xs font-bold bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all disabled:opacity-50"
          >
            {downloading ? "Preparing…" : "Download world file"}
          </button>
        </div>
      </div>
      {err && <p className="text-sm text-red-400 mt-2">{err}</p>}
      {previewOpen && (
        <WorldPreview
          orderId={order.order_id}
          loadPreview={loadPreview}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

function ChatBlock({ orderId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null); // null = not loaded yet
  const [error, setError] = useState(null);

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && messages === null) {
      getAdminMessages(orderId).then(({ messages: rows, error: e }) => {
        if (e) setError(e.message || "Failed to load chat");
        setMessages(rows || []);
      });
    }
  }, [open, messages, orderId]);

  return (
    <div className="rounded-2xl bg-black/20 border border-white/10">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-gray-200"
      >
        <span>💬 Conversation</span>
        <span className="text-gray-500 text-xs">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {messages === null ? (
            <div className="py-6 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-500 py-3">No messages in this conversation.</p>
          ) : (
            <ul className="bx-scroll max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {messages.map((m) => (
                <AdminMessage key={m.id} message={m} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AdminMessage({ message: m }) {
  const name = m.sender_display_name || m.sender_username || "User";
  const isImage = m.msg_type === "image" && m.meta?.url;
  const isEvent = m.msg_type === "order_event";

  return (
    <li className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full overflow-hidden bg-[#4ade80]/15 border border-[#4ade80]/30 flex items-center justify-center text-[#4ade80] text-xs font-semibold flex-shrink-0">
        {m.sender_avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicAsset(m.sender_avatar_url)} alt="" className="w-full h-full object-cover" />
        ) : (
          (name[0] || "?").toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-gray-500">
          <span className="text-gray-300 font-medium">{name}</span> · {clockTime(m.created_at)}
        </p>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicAsset(m.meta.url)}
            alt={m.body || "Photo"}
            className="mt-1 rounded-xl max-h-48 w-auto object-cover border border-white/10"
            loading="lazy"
          />
        ) : isEvent ? (
          <p className="text-[13px] text-gray-400 italic">{m.body || m.meta?.event || "Order update"}</p>
        ) : (
          <p className="text-[13px] text-gray-200 whitespace-pre-wrap break-words">{m.body}</p>
        )}
      </div>
    </li>
  );
}

function ResolveBlock({ orderId, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [note, setNote] = useState("");

  const resolve = useCallback(
    async (outcome) => {
      if (busy) return;
      setBusy(true);
      setErrMsg(null);
      const { error } = await resolveDispute({ orderId, outcome, note: note.trim() || null });
      if (error) {
        setBusy(false);
        setErrMsg(error.message || "Couldn't resolve the dispute.");
        return;
      }
      onResolved?.();
    },
    [busy, orderId, note, onResolved]
  );

  return (
    <div className="space-y-3 pt-1">
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
