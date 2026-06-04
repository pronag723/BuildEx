"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Orders dashboard + detail (Stage 4)
// One static route serving two modes:
//   /orders            → role-aware list (Incoming + My purchases)
//   /orders?id=<uuid>  → single-order detail with status timeline + actions
// All mutations route through the SECURITY DEFINER RPCs in
// supabase/migrations/0009_orders.sql, so this page is plain auth + UI.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withBase } from "../../home/utils";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import {
  fetchOrder,
  listMyOrders,
  builderStartWork,
  builderDeliver,
  buyerConfirmComplete,
  cancelOrder,
  uploadDeliverable,
  attachDelivery,
  fetchDelivery,
  getDeliveryDownloadUrl,
  uploadPreview,
} from "../../../lib/orders/api";
import { generatePreview } from "../../../lib/preview/client";
import { leaveReview, fetchOrderReview } from "../../../lib/reviews/api";
import { openDispute, fetchOrderDispute } from "../../../lib/disputes/api";
import { formatPrice, SIZE_META } from "../../../lib/pricing";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import WorldPreview from "./WorldPreview";
import { useGradientBackground } from "../../../lib/ui/useGradientBackground";

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

// Current ?id= straight from the address bar (client-only).
function readOrderId() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id");
}

// Let real anchors keep their native behaviour for new-tab / modified clicks,
// but intercept a plain left-click so we can switch view in place instead of
// triggering a same-route soft navigation that wouldn't re-run our effects.
function handleNavClick(e, fn) {
  if (e.defaultPrevented) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  fn();
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

  // ── Route mode (?id=...) ──────────────────────────────────────────────────
  // The list and the detail view share the single /orders route, switched by
  // the ?id= query param. We drive that switch off local state and keep the URL
  // in sync via the history API. This mirrors CatalogPage and deliberately
  // avoids useSearchParams() (it forces a Suspense boundary that hangs the
  // static export) — and, crucially, a plain <Link> to the same route is a soft
  // navigation that wouldn't re-run a mount-only effect, so the page would
  // appear stuck while the address bar changed.
  const [orderId, setOrderId] = useState(readOrderId);

  const navigate = useCallback((id) => {
    const url = id ? `/orders/?id=${encodeURIComponent(id)}` : "/orders/";
    window.history.pushState(window.history.state, "", withBase(url));
    setOrderId(id || null);
    window.scrollTo(0, 0);
  }, []);

  // Keep state in sync with the browser back/forward buttons.
  useEffect(() => {
    const onPop = () => setOrderId(readOrderId());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
        <div className="max-w-3xl mx-auto">
          {!ready ? (
            <Spinner />
          ) : orderId ? (
            <OrderDetail
              orderId={orderId}
              meId={meId}
              onBack={() => navigate(null)}
            />
          ) : (
            <OrdersList meId={meId} profile={profile} onOpen={navigate} />
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

// ─── Dashboard list ─────────────────────────────────────────────────────────
function OrdersList({ meId, profile, onOpen }) {
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
          onOpen={onOpen}
          emptyText="No incoming orders yet."
        />
      )}

      <Section
        title="My purchases"
        subtitle="Orders you've placed with builders."
        rows={purchases}
        meId={meId}
        onOpen={onOpen}
        emptyText="You haven't placed any orders yet."
      />
    </div>
  );
}

function Section({ title, subtitle, rows, meId, onOpen, emptyText }) {
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
            <OrderRow key={o.id} order={o} meId={meId} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function OrderRow({ order, meId, onOpen }) {
  const peer = counterpart(order, meId);
  const meta = STATUS_META[order.status] || STATUS_META.pending_payment;
  const sizeLabel = SIZE_META[order.building_size]?.label || order.building_size;

  return (
    <a
      href={withBase(`/orders/?id=${encodeURIComponent(order.id)}`)}
      onClick={(e) => handleNavClick(e, () => onOpen(order.id))}
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
    </a>
  );
}

// ─── Detail ─────────────────────────────────────────────────────────────────
function OrderDetail({ orderId, meId, onBack }) {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Stage 6: the optional file delivery attached to the order. Null = no
  // upload yet; non-null = the row from get_delivery_info (carries the
  // storage_path, file_name, size_bytes, note, and the `unlocked` flag the
  // download UI keys on).
  const [delivery, setDelivery] = useState(null);
  const [deliverOpen, setDeliverOpen] = useState(false);

  // Stage 8: the review attached to this order (buyer leaves exactly one once
  // the order is completed). Null = not reviewed yet.
  const [review, setReview] = useState(null);

  // Stage 10: the dispute attached to this order (buyer opens at most one on a
  // delivered order). Null = no dispute.
  const [dispute, setDispute] = useState(null);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetchOrder(orderId).then(({ order: o, error: e }) => {
      if (e) setError(e.message || "Failed to load order");
      setOrder(o);
      setLoading(false);
    });
    // Delivery is fetched alongside the order. It may legitimately be null
    // (pre-deliver) so we don't surface its errors at the top of the page.
    fetchDelivery(orderId).then(({ delivery: d }) => setDelivery(d));
    // The review is public; null until the buyer leaves one.
    fetchOrderReview(orderId).then(({ review: r }) => setReview(r));
    // The dispute; null until the buyer opens one.
    fetchOrderDispute(orderId).then(({ dispute: d }) => setDispute(d));
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
        <BackLink onBack={onBack} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <BackLink onBack={onBack} />

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
          <BriefBlock text={order.brief} />
        </div>
      </Card>

      {(delivery || order.status === "delivered" || order.status === "completed") && (
        <DeliveryCard
          delivery={delivery}
          order={order}
          isBuyer={isBuyer}
          isBuilder={isBuilder}
        />
      )}

      {dispute && (
        <DisputeCard dispute={dispute} isBuyer={isBuyer} />
      )}

      <Card title="Timeline">
        <Timeline order={order} />
      </Card>

      {order.status === "completed" && isBuyer && (
        <ReviewSection
          orderId={order.id}
          builderName={peer?.display_name || "the builder"}
          review={review}
          onSubmitted={reload}
        />
      )}

      {order.status === "completed" && isBuilder && review && (
        <Card title="Buyer's review">
          <ReviewDisplay review={review} />
        </Card>
      )}

      <Card title="Actions">
        {actionError && (
          <p className="mb-3 text-sm text-red-400">{actionError}</p>
        )}
        <ActionButtons
          order={order}
          isBuyer={isBuyer}
          isBuilder={isBuilder}
          hasDispute={!!dispute}
          busy={busy}
          onStart={() => runAction(() => builderStartWork(order.id))}
          onDeliver={() => setDeliverOpen(true)}
          onConfirm={() => runAction(() => buyerConfirmComplete(order.id))}
          onCancel={() => runAction(() => cancelOrder(order.id))}
          onDispute={() => setDisputeOpen(true)}
          onOpenChat={openChat}
        />
      </Card>

      {deliverOpen && (
        <DeliverModal
          orderId={order.id}
          onClose={() => setDeliverOpen(false)}
          onDelivered={() => {
            setDeliverOpen(false);
            reload();
          }}
        />
      )}

      {disputeOpen && (
        <DisputeModal
          orderId={order.id}
          onClose={() => setDisputeOpen(false)}
          onOpened={() => {
            setDisputeOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function BackLink({ onBack }) {
  return (
    <a
      href={withBase("/orders/")}
      onClick={(e) => handleNavClick(e, onBack)}
      className="inline-flex items-center gap-2 text-xs font-semibold text-[#4ade80] hover:underline"
    >
      ← All orders
    </a>
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

// ─── Brief block ──────────────────────────────────────────────────────────────
// The full client brief. Clamped to a fixed height by default so a long brief
// doesn't push the actions off-screen; if it overflows, an "Show full brief"
// button expands it completely (order page only — the chat card stays clamped).
function BriefBlock({ text }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Compare the rendered (clamped) height against the natural content height.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={`text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed p-3 rounded-2xl bg-black/30 border border-white/10 ${
          expanded ? "" : "line-clamp-6"
        }`}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-semibold text-[#4ade80] hover:underline"
        >
          {expanded ? "Show less" : "Show full brief"}
        </button>
      )}
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
  hasDispute,
  busy,
  onStart,
  onDeliver,
  onConfirm,
  onCancel,
  onDispute,
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
    // Stage 6: opens the upload modal that calls builder_attach_delivery.
    buttons.push(
      <Primary key="deliver" onClick={onDeliver} disabled={busy}>
        Deliver world
      </Primary>
    );
  }
  if (isBuyer && order.status === "delivered") {
    buttons.push(
      <Primary key="confirm" onClick={onConfirm} disabled={busy}>
        Confirm & release
      </Primary>
    );
    // Stage 10: the inverse of confirming — reject the delivery and open a
    // dispute for the team to resolve. Only offered before a dispute exists.
    if (!hasDispute) {
      buttons.push(
        <Secondary key="dispute" onClick={onDispute} disabled={busy}>
          Open a dispute
        </Secondary>
      );
    }
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

// ─── Reviews (Stage 8) ──────────────────────────────────────────────────────
function StarIcon({ filled, className = "w-5 h-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

// Read-only star row used in the submitted-review display.
function StarRow({ rating, className = "w-4 h-4" }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((s) => (
        <StarIcon
          key={s}
          filled={s <= rating}
          className={`${className} ${s <= rating ? "text-amber-400" : "text-gray-600"}`}
        />
      ))}
    </div>
  );
}

// Renders an already-submitted review (shown to both parties once it exists).
function ReviewDisplay({ review }) {
  return (
    <div className="space-y-2">
      <StarRow rating={review.rating} />
      {review.body && (
        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
          {review.body}
        </p>
      )}
      <p className="text-[11px] text-gray-500">
        Reviewed {formatDate(review.created_at)}
      </p>
    </div>
  );
}

// Buyer-side card on a completed order: either the submitted review or the
// rating form. The leave_review RPC enforces buyer-only / completed / once
// server-side; this is purely the input surface.
function ReviewSection({ orderId, builderName, review, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState(null);

  const onSubmit = useCallback(async () => {
    if (submitting || rating < 1) return;
    setSubmitting(true);
    setErrMsg(null);
    const { error } = await leaveReview({
      orderId,
      rating,
      body: body.trim() || null,
    });
    if (error) {
      setSubmitting(false);
      setErrMsg(error.message || "Couldn't submit your review.");
      return;
    }
    // Refetch so the form is replaced by the submitted review + the builder's
    // freshly recomputed aggregates are reflected elsewhere.
    onSubmitted?.();
  }, [submitting, rating, body, orderId, onSubmitted]);

  if (review) {
    return (
      <Card title="Your review">
        <ReviewDisplay review={review} />
      </Card>
    );
  }

  const active = hover || rating;

  return (
    <Card title="Leave a review">
      <p className="text-sm text-gray-400 mb-4">
        How was your experience with{" "}
        <strong className="text-gray-200">{builderName}</strong>? Your rating is
        public and helps other clients.
      </p>

      <div
        className="flex items-center gap-1 mb-4"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`${s} star${s > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(s)}
            onClick={() => setRating(s)}
            disabled={submitting}
            className="p-0.5 transition-transform hover:scale-110 disabled:cursor-wait"
          >
            <StarIcon
              filled={s <= active}
              className={`w-8 h-8 ${s <= active ? "text-amber-400" : "text-gray-600"}`}
            />
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={submitting}
        rows={4}
        maxLength={4000}
        placeholder="Share a few words about the build and the process (optional)."
        className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-[#4ade80]/60 focus:outline-none focus:ring-2 focus:ring-[#4ade80]/20 resize-y"
      />

      {errMsg && <p className="mt-3 text-sm text-red-400">{errMsg}</p>}

      <div className="mt-4 flex justify-end">
        <Primary onClick={onSubmit} disabled={submitting || rating < 1}>
          {submitting ? "Submitting…" : "Submit review"}
        </Primary>
      </div>
    </Card>
  );
}

// ─── Disputes (Stage 10) ────────────────────────────────────────────────────
// Status → friendly copy. The order is 'disputed' while a dispute is open; once
// an admin resolves it the order moves to completed (release) or cancelled
// (refund) and the dispute row carries the outcome.
const DISPUTE_STATUS_META = {
  open: {
    label: "Under review",
    badgeClass: "bg-red-400/15 text-red-300 border-red-400/30",
    note: "Our team is reviewing this delivery. We'll update both of you here once it's resolved.",
  },
  resolved_release: {
    label: "Resolved · released to builder",
    badgeClass: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    note: "The dispute was resolved in the builder's favour — the order was completed.",
  },
  resolved_refund: {
    label: "Resolved · refunded to buyer",
    badgeClass: "bg-white/10 text-gray-300 border-white/10",
    note: "The dispute was resolved in the buyer's favour — the order was cancelled and refunded.",
  },
};

function DisputeCard({ dispute, isBuyer }) {
  const meta = DISPUTE_STATUS_META[dispute.status] || DISPUTE_STATUS_META.open;
  return (
    <Card title="Dispute">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-gray-400">
          {isBuyer ? "You opened a dispute on this order." : "The buyer opened a dispute on this order."}
        </p>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${meta.badgeClass}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="p-3 rounded-2xl bg-black/30 border border-white/10">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">
          Reason
        </span>
        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
          {dispute.reason}
        </p>
      </div>

      {dispute.resolution_note && (
        <p className="mt-3 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed p-3 rounded-2xl bg-black/20 border border-white/10">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">
            Resolution note
          </span>
          {dispute.resolution_note}
        </p>
      )}

      <p className="mt-3 text-xs text-gray-500 flex items-start gap-2 leading-relaxed">
        <span aria-hidden>⚖️</span>
        <span>{meta.note}</span>
      </p>
    </Card>
  );
}

// Buyer-side modal: collect a reason and open the dispute. The open_dispute RPC
// enforces buyer-only / delivered / once server-side.
function DisputeModal({ orderId, onClose, onOpened }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState(null);

  const onSubmit = useCallback(async () => {
    const trimmed = reason.trim();
    if (submitting || !trimmed) return;
    setSubmitting(true);
    setErrMsg(null);
    const { error } = await openDispute({ orderId, reason: trimmed });
    if (error) {
      setSubmitting(false);
      setErrMsg(error.message || "Couldn't open the dispute.");
      return;
    }
    onOpened?.();
  }, [submitting, reason, orderId, onOpened]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div className="glass rounded-3xl p-6 sm:p-8 max-w-lg w-full">
        <h2 className="font-bold text-lg mb-1">Open a dispute</h2>
        <p className="text-xs text-gray-500 mb-5">
          Only do this if the delivery doesn't match what you agreed. The funds
          stay in escrow while our team reviews the order — they'll either
          release the payment to the builder or refund you.
        </p>

        <label className="block">
          <span className="text-[11px] text-gray-500 uppercase tracking-widest block mb-1.5">
            What's wrong?
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            rows={5}
            maxLength={4000}
            placeholder="Describe what's missing or doesn't match the brief, with as much detail as you can."
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-red-400/60 focus:outline-none focus:ring-2 focus:ring-red-400/20 resize-y"
          />
        </label>

        {errMsg && <p className="mt-4 text-sm text-red-400">{errMsg}</p>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/10 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !reason.trim()}
            className="px-5 py-2.5 rounded-full text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Opening…" : "Open dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delivery card (Stage 6) ────────────────────────────────────────────────
// Shown once an upload exists or the order is past `in_progress`.
//   • Builder: always sees a working "Download" (so they can re-fetch their
//     own upload).
//   • Buyer pre-completion: download is greyed with a "Confirm to unlock"
//     hint — the storage SELECT policy in migration 0011 is the actual
//     gatekeeper so this UI lock can't be bypassed by hand-crafting a URL.
//   • Buyer after completion: live download button.
function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function DeliveryCard({ delivery, order, isBuyer, isBuilder }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const onDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    const { url, locked, error } = await getDeliveryDownloadUrl(order.id);
    setDownloading(false);
    if (locked) {
      setDownloadError("Confirm the delivery first to unlock the download.");
      return;
    }
    if (error || !url) {
      setDownloadError(error?.message || "Could not generate a download link.");
      return;
    }
    // Open in a new tab so the buyer's chat / order page stay put.
    window.open(url, "_blank", "noopener,noreferrer");
  }, [order.id, downloading]);

  // Pre-upload state (builder has hit Mark delivered or the order is past
  // in_progress but the row hasn't loaded yet) — show a friendly placeholder.
  if (!delivery) {
    return (
      <Card title="Delivery">
        <p className="text-sm text-gray-400">
          {order.status === "delivered" || order.status === "completed"
            ? "The builder marked this as delivered but no file is attached yet."
            : "The builder hasn't uploaded the world file yet."}
        </p>
      </Card>
    );
  }

  const unlocked = !!delivery.unlocked;
  const showLockedHint = isBuyer && !unlocked;
  const hasPreview = !!delivery.preview_available;

  return (
    <>
    <Card title="Delivery">
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-2xl bg-black/30 border border-white/10">
          <span aria-hidden className="text-2xl mt-0.5">📦</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">
              {delivery.file_name}
            </p>
            <p className="text-[11px] text-gray-500">
              {humanFileSize(Number(delivery.size_bytes))} ·{" "}
              {new Date(delivery.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {delivery.note && (
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed p-3 rounded-2xl bg-black/20 border border-white/10">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">
              Builder's note
            </span>
            {delivery.note}
          </p>
        )}

        {hasPreview && (
          <div className="p-3 rounded-2xl bg-[#4ade80]/[0.06] border border-[#4ade80]/20 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold flex items-center gap-2">
                <span aria-hidden>🧊</span> 3D preview available
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isBuyer && !unlocked
                  ? "Review the build in 3D, then Confirm & release to unlock the file."
                  : "Rotate and zoom an automatic render of the delivered world."}
              </p>
            </div>
            <Secondary onClick={() => setPreviewOpen(true)}>
              View 3D preview
            </Secondary>
          </div>
        )}

        {showLockedHint && (
          <p className="text-xs text-gray-400 flex items-start gap-2 leading-relaxed">
            <span aria-hidden>🔒</span>
            <span>
              The download is locked while the file is in escrow. Tap{" "}
              <strong className="text-[#4ade80]">Confirm &amp; release</strong>{" "}
              below once you're happy with the build — that releases the
              payment and unlocks the file.
            </span>
          </p>
        )}

        {downloadError && (
          <p className="text-sm text-red-400">{downloadError}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {isBuilder ? (
            <Secondary onClick={onDownload} disabled={downloading}>
              {downloading ? "Preparing…" : "Download your upload"}
            </Secondary>
          ) : unlocked ? (
            <Primary onClick={onDownload} disabled={downloading}>
              {downloading ? "Preparing…" : "Download world file"}
            </Primary>
          ) : (
            <button
              type="button"
              disabled
              className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/10 text-gray-500 cursor-not-allowed inline-flex items-center gap-2"
            >
              <span aria-hidden>🔒</span> Download locked
            </button>
          )}
        </div>
      </div>
    </Card>
    {previewOpen && (
      <WorldPreview orderId={order.id} onClose={() => setPreviewOpen(false)} />
    )}
    </>
  );
}

// ─── Deliver modal (Stage 6) ────────────────────────────────────────────────
// Builder side. Takes a .zip + optional note, uploads to the private bucket,
// then calls builder_attach_delivery to record + transition the order.
const MAX_DELIVERY_BYTES = 200 * 1024 * 1024; // matches the bucket's file_size_limit

function DeliverModal({ orderId, onClose, onDelivered }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  // Stage 7: which step the progress bar reflects ("preview" | "upload"), plus
  // a soft note when the preview couldn't be generated (delivery still goes
  // through — the preview is best-effort).
  const [phase, setPhase] = useState(null);
  const [previewNote, setPreviewNote] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const onPick = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setErrMsg(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_DELIVERY_BYTES) {
      setFile(null);
      setErrMsg(
        `File is too large (${humanFileSize(f.size)}). Max ${humanFileSize(MAX_DELIVERY_BYTES)}.`
      );
      return;
    }
    setFile(f);
  }, []);

  const onSubmit = useCallback(async () => {
    if (submitting || !file) return;
    setSubmitting(true);
    setErrMsg(null);
    setPreviewNote(null);
    setProgress(0);

    // Step 1 (best-effort): build the 3D preview artifact in a Web Worker. The
    // builder already holds the file, so the conversion happens here — no
    // server. On any failure (too large / unsupported / empty) we deliver
    // WITHOUT a preview rather than blocking the core escrow flow.
    setPhase("preview");
    let previewPath = null;
    let previewMeta = null;
    try {
      const { bytes, meta } = await generatePreview(file, setProgress);
      const { path: pPath, error: pErr } = await uploadPreview(orderId, bytes);
      if (pErr || !pPath) throw pErr || new Error("preview upload failed");
      previewPath = pPath;
      previewMeta = meta;
    } catch (e) {
      // Soft-fail: keep going, note it for the builder.
      setPreviewNote(
        "Couldn't generate a 3D preview for this world — delivering the file without one."
      );
    }

    // Step 2: upload the locked world file (unchanged Stage 6 escrow path).
    setPhase("upload");
    setProgress(0);
    const { path, error: upErr } = await uploadDeliverable(
      orderId,
      file,
      setProgress
    );
    if (upErr || !path) {
      setSubmitting(false);
      setPhase(null);
      setProgress(0);
      setErrMsg(upErr?.message || "Upload failed.");
      return;
    }

    const { error: attachErr } = await attachDelivery({
      orderId,
      path,
      fileName: file.name,
      size: file.size,
      note: note.trim() || null,
      previewPath,
      previewMeta,
    });
    setSubmitting(false);
    setPhase(null);
    if (attachErr) {
      setErrMsg(
        attachErr.message ||
          "Upload succeeded but the order couldn't be marked as delivered."
      );
      return;
    }
    onDelivered?.();
  }, [submitting, file, orderId, note, onDelivered]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div className="glass rounded-3xl p-6 sm:p-8 max-w-lg w-full">
        <h2 className="font-bold text-lg mb-1">Deliver the world</h2>
        <p className="text-xs text-gray-500 mb-5">
          Upload the finished build as a <code>.zip</code>. The buyer can
          preview the order but won't be able to download the file until they
          confirm completion — that's the escrow lock.
        </p>

        <label className="block">
          <span className="text-[11px] text-gray-500 uppercase tracking-widest block mb-1.5">
            World file
          </span>
          <input
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={onPick}
            disabled={submitting}
            className="block w-full text-xs text-gray-300 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#4ade80]/15 file:text-[#4ade80] hover:file:bg-[#4ade80]/25 file:cursor-pointer cursor-pointer"
          />
          <p className="text-[11px] text-gray-500 mt-1.5">
            Up to {humanFileSize(MAX_DELIVERY_BYTES)}.
            {file && (
              <>
                {" "}Selected: <strong className="text-gray-300">{file.name}</strong>{" "}
                ({humanFileSize(file.size)}).
              </>
            )}
          </p>
        </label>

        <label className="block mt-4">
          <span className="text-[11px] text-gray-500 uppercase tracking-widest block mb-1.5">
            Note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            rows={4}
            maxLength={1000}
            placeholder="Anything the buyer should know before they open the world."
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-[#4ade80]/60 focus:outline-none focus:ring-2 focus:ring-[#4ade80]/20 resize-y"
          />
        </label>

        {submitting && (
          <div className="mt-4">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#4ade80] transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              {phase === "preview"
                ? "Generating 3D preview…"
                : "Uploading world file…"}{" "}
              {Math.round(progress * 100)}%
            </p>
          </div>
        )}

        {previewNote && (
          <p className="mt-4 text-xs text-amber-300/90">{previewNote}</p>
        )}

        {errMsg && (
          <p className="mt-4 text-sm text-red-400">{errMsg}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/10 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !file}
            className="px-5 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Delivering…" : "Upload & deliver"}
          </button>
        </div>
      </div>
    </div>
  );
}
