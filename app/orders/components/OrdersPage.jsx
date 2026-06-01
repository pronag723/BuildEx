"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Orders dashboard + detail (Stage 4)
// One static route serving two modes:
//   /orders            → role-aware list (Incoming + My purchases)
//   /orders?id=<uuid>  → single-order detail with status timeline + actions
// All mutations route through the SECURITY DEFINER RPCs in
// supabase/migrations/0009_orders.sql, so this page is plain auth + UI.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import {
  fetchOrder,
  listMyOrders,
  builderStartWork,
  builderDeliver,
  buyerConfirmComplete,
  cancelOrder,
} from "../../../lib/orders/api";
import { formatPrice, SIZE_META } from "../../../lib/pricing";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";

// ─── Status display tables ──────────────────────────────────────────────────
// Re-used by list rows, detail header, and the timeline. Single source of
// truth so visual changes only need one edit.
const STATUS_META = {
  pending_payment: {
    label: "Awaiting payment",
    badgeClass: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  },
  paid: {
    label: "Paid · in escrow",
    badgeClass: "bg-[#4ade80]/15 text-[#4ade80] border-[#4ade80]/30",
  },
  in_progress: {
    label: "In progress",
    badgeClass: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  },
  delivered: {
    label: "Delivered",
    badgeClass: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  },
  completed: {
    label: "Completed",
    badgeClass: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-white/10 text-gray-400 border-white/10",
  },
  disputed: {
    label: "Disputed",
    badgeClass: "bg-red-400/15 text-red-300 border-red-400/30",
  },
};

const TIMELINE_STEPS = [
  { key: "created_at", label: "Order placed" },
  { key: "paid_at", label: "Payment received" },
  { key: "started_at", label: "Work started" },
  { key: "delivered_at", label: "Delivered" },
  { key: "completed_at", label: "Completed" },
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

function counterpart(order, meId) {
  // The order embeds both parties; return whichever isn't the caller.
  if (!order || !meId) return null;
  if (order.buyer_id === meId) return order.builder || null;
  if (order.builder_id === meId) return order.buyer || null;
  return null;
}

// ─── Root ───────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  useRequireAuth();
  const { user, profile, status } = useAuth();
  const meId = user?.id || null;

  // ── Theme + nav (mirrors the rest of the catalog) ─────────────────────────
  const [theme, setTheme] = useState(null);
  const isLight = theme === "light";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // ── Route mode (?id=...) ──────────────────────────────────────────────────
  const [orderId, setOrderId] = useState(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get("id"));
  }, []);

  const ready = status === "authenticated" && theme !== null;

  return (
    <>
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

      <main className="min-h-screen px-4 pt-28 pb-20">
        <div className="max-w-3xl mx-auto">
          {!ready ? (
            <Spinner />
          ) : orderId ? (
            <OrderDetail orderId={orderId} meId={meId} />
          ) : (
            <OrdersList meId={meId} profile={profile} />
          )}
        </div>
      </main>
    </>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
    </div>
  );
}

// ─── Dashboard list ─────────────────────────────────────────────────────────
function OrdersList({ meId, profile }) {
  const [orders, setOrders] = useState(null); // null = loading, [] = loaded empty
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setOrders(null);
    listMyOrders().then(({ orders: rows, error: e }) => {
      if (e) setError(e.message || "Failed to load orders");
      setOrders(rows);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Role split. Anyone can be a buyer; only builder/both sees the incoming
  // section. RLS already filtered to the caller's rows, so this is a cheap
  // client-side bucket.
  const isBuilderRole = profile?.role === "builder" || profile?.role === "both";
  const { incoming, purchases } = useMemo(() => {
    const list = orders || [];
    return {
      incoming: list.filter((o) => o.builder_id === meId),
      purchases: list.filter((o) => o.buyer_id === meId),
    };
  }, [orders, meId]);

  if (orders === null) return <Spinner />;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track your commissions — both sides of the platform.
          </p>
        </div>
        <Link
          href="/builders"
          className="px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black transition-all hidden sm:inline-flex items-center gap-2"
        >
          Browse builders
        </Link>
      </header>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {isBuilderRole && (
        <Section
          title="Incoming orders"
          subtitle="Commissions clients have placed with you."
          rows={incoming}
          meId={meId}
          emptyText="No incoming orders yet."
        />
      )}

      <Section
        title="My purchases"
        subtitle="Orders you've placed with builders."
        rows={purchases}
        meId={meId}
        emptyText="You haven't placed any orders yet."
      />
    </div>
  );
}

function Section({ title, subtitle, rows, meId, emptyText }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-bold text-base">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center text-sm text-gray-500">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((o) => (
            <OrderRow key={o.id} order={o} meId={meId} />
          ))}
        </div>
      )}
    </section>
  );
}

function OrderRow({ order, meId }) {
  const peer = counterpart(order, meId);
  const meta = STATUS_META[order.status] || STATUS_META.pending_payment;
  const sizeLabel = SIZE_META[order.building_size]?.label || order.building_size;

  return (
    <Link
      href={`/orders/?id=${encodeURIComponent(order.id)}`}
      className="glass rounded-2xl p-4 flex items-center gap-3 hover:border-[#4ade80]/40 hover:shadow-[0_0_18px_rgba(74,222,128,0.12)] transition-all"
    >
      <img
        src={peer?.avatar_url || "/avatar-placeholder.png"}
        alt={peer?.display_name || "?"}
        className="w-11 h-11 rounded-full object-cover ring-1 ring-white/10 flex-shrink-0"
        loading="lazy"
        decoding="async"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">
            {peer?.display_name || "Unknown user"}
          </p>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 truncate capitalize">
          {sizeLabel} · {order.style} ·{" "}
          {new Date(order.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-[#4ade80] text-sm">
          {formatPrice(order.price_kopecks)}
        </p>
      </div>
    </Link>
  );
}

// ─── Detail ─────────────────────────────────────────────────────────────────
function OrderDetail({ orderId, meId }) {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetchOrder(orderId).then(({ order: o, error: e }) => {
      if (e) setError(e.message || "Failed to load order");
      setOrder(o);
      setLoading(false);
    });
  }, [orderId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const peer = order ? counterpart(order, meId) : null;
  const isBuyer = !!order && order.buyer_id === meId;
  const isBuilder = !!order && order.builder_id === meId;
  const sizeLabel = order
    ? SIZE_META[order.building_size]?.label || order.building_size
    : "";
  const meta = order ? STATUS_META[order.status] || STATUS_META.pending_payment : null;

  // Wrap each RPC call so the row reloads on success and the error surfaces.
  const runAction = useCallback(
    async (fn) => {
      if (busy) return;
      setBusy(true);
      setActionError(null);
      const { error: e } = await fn();
      if (e) {
        setActionError(e.message || "Action failed");
        setBusy(false);
        return;
      }
      // Reload to pick up the new status + timestamp.
      const { order: o } = await fetchOrder(orderId);
      setOrder(o);
      setBusy(false);
    },
    [busy, orderId]
  );

  const openChat = useCallback(() => {
    if (!peer?.username) return;
    router.push(`/chats/?to=${encodeURIComponent(peer.username)}`);
  }, [peer, router]);

  if (loading) return <Spinner />;
  if (error || !order)
    return (
      <Card title="Order not found">
        <p className="text-sm text-gray-400">
          {error || "We couldn't load this order. It may belong to another account."}
        </p>
        <BackLink />
      </Card>
    );

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <div className="flex items-start gap-3 mb-4">
          <img
            src={peer?.avatar_url || "/avatar-placeholder.png"}
            alt={peer?.display_name || "?"}
            className="w-12 h-12 rounded-full object-cover ring-2 ring-[#4ade80]/30 flex-shrink-0"
            loading="lazy"
            decoding="async"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest">
              {isBuyer ? "Builder" : "Buyer"}
            </p>
            <p className="font-bold text-lg leading-tight truncate">
              {peer?.display_name || "Unknown user"}
            </p>
            {peer?.username && (
              <p className="text-xs text-gray-400">@{peer.username}</p>
            )}
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
        </div>

        <dl className="space-y-2 text-sm pt-4 border-t border-white/[0.06]">
          <Row label="Size">{sizeLabel}</Row>
          <Row label="Style" capitalize>
            {order.style}
          </Row>
          <Row label="Buyer pays">{formatPrice(order.price_kopecks)}</Row>
          <Row label="Platform fee">
            {formatPrice(order.commission_kopecks)}
          </Row>
          <Row label="Builder earns">
            {formatPrice(order.builder_earnings_kopecks)}
          </Row>
        </dl>

        <div className="mt-5">
          <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">
            Brief
          </p>
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed p-3 rounded-2xl bg-black/30 border border-white/10 max-h-72 overflow-y-auto">
            {order.brief}
          </p>
        </div>
      </Card>

      <Card title="Timeline">
        <Timeline order={order} />
      </Card>

      <Card title="Actions">
        {actionError && (
          <p className="mb-3 text-sm text-red-400">{actionError}</p>
        )}
        <ActionButtons
          order={order}
          isBuyer={isBuyer}
          isBuilder={isBuilder}
          busy={busy}
          onStart={() => runAction(() => builderStartWork(order.id))}
          onDeliver={() => runAction(() => builderDeliver(order.id))}
          onConfirm={() => runAction(() => buyerConfirmComplete(order.id))}
          onCancel={() => runAction(() => cancelOrder(order.id))}
          onOpenChat={openChat}
        />
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/orders"
      className="inline-flex items-center gap-2 text-xs font-semibold text-[#4ade80] hover:underline"
    >
      ← All orders
    </Link>
  );
}

function Card({ title, children }) {
  return (
    <div className="glass rounded-3xl p-6 sm:p-8">
      {title && <h2 className="font-bold text-base mb-4">{title}</h2>}
      {children}
    </div>
  );
}

function Row({ label, capitalize, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] text-gray-500 uppercase tracking-widest">
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold text-gray-200 text-right ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

// ─── Timeline ───────────────────────────────────────────────────────────────
function Timeline({ order }) {
  // Cancelled/disputed orders short-circuit the happy path — show whatever
  // history exists plus a terminal marker.
  return (
    <ol className="relative space-y-4">
      {TIMELINE_STEPS.map((step, i) => {
        const ts = order[step.key];
        const done = !!ts;
        return (
          <li key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
              <span
                className={`w-3 h-3 rounded-full border-2 ${
                  done
                    ? "bg-[#4ade80] border-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.6)]"
                    : "bg-transparent border-white/20"
                }`}
              />
              {i < TIMELINE_STEPS.length - 1 && (
                <span
                  className={`w-px flex-1 mt-1 ${
                    done ? "bg-[#4ade80]/40" : "bg-white/10"
                  }`}
                  style={{ minHeight: "1.25rem" }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p
                className={`text-sm font-semibold ${
                  done ? "text-gray-200" : "text-gray-500"
                }`}
              >
                {step.label}
              </p>
              {done && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {formatDate(ts)}
                </p>
              )}
            </div>
          </li>
        );
      })}
      {order.cancelled_at && (
        <li className="flex items-start gap-3">
          <div className="w-3 h-3 rounded-full bg-white/40 border-2 border-white/40 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-300">Cancelled</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {formatDate(order.cancelled_at)}
            </p>
          </div>
        </li>
      )}
    </ol>
  );
}

// ─── Action buttons ─────────────────────────────────────────────────────────
// Server-side RPCs already enforce role + status; the UI just hides or
// disables buttons that wouldn't apply so the user has the right primary
// action without a wall of greyed-out options.
function ActionButtons({
  order,
  isBuyer,
  isBuilder,
  busy,
  onStart,
  onDeliver,
  onConfirm,
  onCancel,
  onOpenChat,
}) {
  const buttons = [];

  if (isBuilder && order.status === "paid") {
    buttons.push(
      <Primary key="start" onClick={onStart} disabled={busy}>
        Start work
      </Primary>
    );
  }
  if (isBuilder && order.status === "in_progress") {
    // Stage 6 swaps this for an actual upload + builder_attach_delivery.
    buttons.push(
      <Primary key="deliver" onClick={onDeliver} disabled={busy}>
        Mark delivered
      </Primary>
    );
  }
  if (isBuyer && order.status === "delivered") {
    buttons.push(
      <Primary key="confirm" onClick={onConfirm} disabled={busy}>
        Confirm & release
      </Primary>
    );
  }
  if (isBuyer && (order.status === "pending_payment" || order.status === "paid")) {
    buttons.push(
      <Secondary key="cancel" onClick={onCancel} disabled={busy}>
        Cancel order
      </Secondary>
    );
  }

  // Open chat is always available — even on a completed/cancelled order, both
  // parties may want to keep talking.
  buttons.push(
    <Secondary key="chat" onClick={onOpenChat} disabled={busy}>
      Open chat
    </Secondary>
  );

  return <div className="flex flex-wrap gap-2">{buttons}</div>;
}

function Primary({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-5 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-wait"
    >
      {children}
    </button>
  );
}

function Secondary({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-5 py-2.5 rounded-full text-sm font-semibold border border-[#4ade80]/40 text-[#4ade80] hover:bg-[#4ade80]/10 hover:border-[#4ade80] transition-all disabled:opacity-50 disabled:cursor-wait"
    >
      {children}
    </button>
  );
}
