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
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import { useNotifications } from "../../../lib/notifications/NotificationsContext";
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
import { listMyPayouts } from "../../../lib/payouts/api";
import {
  formatPrice,
  SIZE_META,
  suggestedPreviewRadius,
  PREVIEW_RADIUS_MIN,
  PREVIEW_RADIUS_MAX,
} from "../../../lib/pricing";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import WorldPreview, { PreviewViewer } from "./WorldPreview";
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
            <OrdersList meId={meId} onOpen={navigate} />
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
function OrdersList({ meId, onOpen }) {
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

  // Status buckets across BOTH roles (RLS already scoped these to the caller).
  //   • Current   — anything still in flight: awaiting payment, paid/escrowed,
  //                 in progress, or delivered & awaiting the buyer's confirm.
  //   • Completed — confirmed-and-released or cancelled, i.e. closed orders.
  //   • Disputed  — open disputes under review.
  // Each row carries its own status badge + a Buying/Selling tag, so mixing the
  // two roles inside one section stays unambiguous.
  const { current, completed, disputed } = useMemo(() => {
    const list = orders || [];
    const current = [];
    const completed = [];
    const disputed = [];
    for (const o of list) {
      if (o.status === "disputed") disputed.push(o);
      else if (o.status === "completed" || o.status === "cancelled") completed.push(o);
      else current.push(o);
    }
    return { current, completed, disputed };
  }, [orders]);

  const [tab, setTab] = useState("current");

  // Auto-switch to disputed tab when there are disputes and user is on current
  // (only on initial load, not on every bucket change).
  const TABS = [
    {
      key: "current",
      label: "Current",
      rows: current,
      subtitle: "Orders still in flight — awaiting payment, work, delivery, or your confirmation.",
      emptyText: "No active orders right now.",
    },
    {
      key: "completed",
      label: "Completed",
      rows: completed,
      subtitle: "Confirmed-and-released or cancelled — your closed commissions.",
      emptyText: "No completed orders yet.",
    },
    {
      key: "disputed",
      label: "Disputed",
      rows: disputed,
      subtitle: "Under review by our team — we'll resolve these for both parties.",
      emptyText: "No disputed orders.",
    },
  ];

  const activeIdx = Math.max(0, TABS.findIndex((t) => t.key === tab));
  const activeTab = TABS[activeIdx] || TABS[0];

  if (orders === null) return <Spinner />;

  return (
    <div className="space-y-6">
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

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Tab toggle — sliding segmented control, mirrors the /profile page. */}
      <div
        className="relative grid grid-cols-3 p-1 rounded-full bg-white/[0.04] border border-white/10"
        role="tablist"
        aria-label="Order status"
      >
        {/* Sliding highlight */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 rounded-full bg-[#4ade80]/15 transition-transform duration-300 ease-out"
          style={{
            width: "calc((100% - 0.5rem) / 3)",
            transform: `translateX(calc(${activeIdx} * 100%))`,
            boxShadow:
              "0 0 0 1px rgba(74,222,128,0.5), 0 0 14px rgba(74,222,128,0.22)",
          }}
        />
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = t.rows.length;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`relative z-10 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-full text-xs sm:text-sm font-semibold transition-colors ${
                active ? "text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span
                  className={`text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center transition-colors ${
                    t.key === "disputed"
                      ? "bg-red-500/80 text-white"
                      : active
                      ? "bg-[#4ade80]/25 text-[#4ade80]"
                      : "bg-white/10 text-gray-300"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Section
        title={activeTab.label + " orders"}
        subtitle={activeTab.subtitle}
        rows={activeTab.rows}
        meId={meId}
        onOpen={onOpen}
        emptyText={activeTab.emptyText}
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
  const sizeLabel =
    order.size_label || SIZE_META[order.building_size]?.label || order.building_size;
  const iAmBuyer = order.buyer_id === meId;

  return (
    <a
      href={withBase(`/orders/?id=${encodeURIComponent(order.id)}`)}
      onClick={(e) => handleNavClick(e, () => onOpen(order.id))}
      className="glass rounded-2xl p-4 flex items-center gap-3 hover:border-[#4ade80]/40 hover:shadow-[0_0_18px_rgba(74,222,128,0.12)] transition-all"
    >
      <Avatar
        src={peer?.avatar_url}
        name={peer?.display_name}
        className="w-11 h-11 rounded-full ring-1 ring-white/10 flex-shrink-0 text-base"
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
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
              iAmBuyer
                ? "bg-white/5 text-gray-300 border-white/10"
                : "bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/25"
            }`}
          >
            {iAmBuyer ? "Buying" : "Selling"}
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
  const { markReadByLink } = useNotifications();
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

  // Confirmation step before the (irreversible) escrow release, and the
  // post-download "leave a review" prompt.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

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

  // Viewing an order clears any unread notifications that link to it — even when
  // the user arrived here while already signed in / on the page (bug: the bell
  // dot stuck because reading the order never marked its notification read).
  useEffect(() => {
    if (orderId) markReadByLink(`/orders/?id=${orderId}`);
  }, [orderId, markReadByLink]);

  const peer = order ? counterpart(order, meId) : null;
  const isBuyer = !!order && order.buyer_id === meId;
  const isBuilder = !!order && order.builder_id === meId;
  const sizeLabel = order
    ? order.size_label || SIZE_META[order.building_size]?.label || order.building_size
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
          <Avatar
            src={peer?.avatar_url}
            name={peer?.display_name}
            className="w-12 h-12 rounded-full ring-2 ring-[#4ade80]/30 flex-shrink-0 text-lg"
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
          {/* The buyer only ever sees what they paid. The platform fee /
              builder-earnings split is the builder's business, so it's shown
              to the builder only. */}
          {isBuyer ? (
            <Row label="Total paid">{formatPrice(order.price_kopecks)}</Row>
          ) : (
            <>
              <Row label="Buyer pays">{formatPrice(order.price_kopecks)}</Row>
              <Row label="Platform fee">
                {formatPrice(order.commission_kopecks)}
              </Row>
              <Row label="Builder earns">
                {formatPrice(order.builder_earnings_kopecks)}
              </Row>
              {order.status === "completed" && (
                <Row label="Payout">
                  <BuilderPayoutChip orderId={order.id} />
                </Row>
              )}
            </>
          )}
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
          review={review}
          onRequestReview={() => setReviewModalOpen(true)}
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
          onConfirm={() => setConfirmOpen(true)}
          onCancel={() => runAction(() => cancelOrder(order.id))}
          onDispute={() => setDisputeOpen(true)}
          onOpenChat={openChat}
        />
      </Card>

      {deliverOpen && (
        <DeliverModal
          orderId={order.id}
          buildingSize={order.building_size}
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

      {confirmOpen && (
        <ConfirmCompleteModal
          builderName={peer?.display_name || "the builder"}
          hasPreview={!!delivery?.preview_available}
          busy={busy}
          onClose={() => setConfirmOpen(false)}
          onConfirm={async () => {
            await runAction(() => buyerConfirmComplete(order.id));
            setConfirmOpen(false);
            // runAction only refetches the order; the delivery row (and its
            // `unlocked` flag the download button keys on) won't refresh
            // otherwise, so the file stayed "locked" until a manual reload.
            // Pull the full set so the download unlocks immediately.
            reload();
          }}
        />
      )}

      {reviewModalOpen && (
        <ReviewModal
          orderId={order.id}
          builderName={peer?.display_name || "the builder"}
          onClose={() => setReviewModalOpen(false)}
          onSubmitted={() => {
            setReviewModalOpen(false);
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

// ─── Builder payout chip ──────────────────────────────────────────────────────
// Shows the payout status for a completed order (builder's view only). Self-
// contained: loads the builder's own payouts (RLS-scoped) and looks this order up.
const PAYOUT_CHIP = {
  pending: { label: "Queued", cls: "bg-amber-400/10 border-amber-400/30 text-amber-300" },
  processing: { label: "Sending", cls: "bg-sky-400/10 border-sky-400/30 text-sky-300" },
  sent: { label: "Paid out", cls: "bg-emerald-400/15 border-emerald-400/30 text-emerald-300" },
  failed: { label: "Retrying", cls: "bg-red-400/10 border-red-400/30 text-red-300" },
  blocked: { label: "Add wallet", cls: "bg-gray-400/10 border-gray-400/30 text-gray-300" },
  fiat_card_pending: { label: "Card review", cls: "bg-violet-400/10 border-violet-400/30 text-violet-300" },
};

function BuilderPayoutChip({ orderId }) {
  const [status, setStatus] = useState(undefined); // undefined = loading, null = none

  useEffect(() => {
    let alive = true;
    listMyPayouts().then(({ byOrder }) => {
      if (alive) setStatus(byOrder?.[orderId]?.status || null);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (status === undefined) return <span className="text-gray-500">…</span>;
  if (status === null) return <span className="text-gray-500">—</span>;
  const meta = PAYOUT_CHIP[status] || PAYOUT_CHIP.pending;
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.cls}`}>
      {meta.label}
    </span>
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
  if (isBuyer && order.status === "pending_payment") {
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

// Shared rating form (stars + optional note + submit). Used both inline on a
// completed order (ReviewSection) and inside the post-download ReviewModal. The
// leave_review RPC enforces buyer-only / completed / once server-side; this is
// purely the input surface.
function ReviewForm({ orderId, builderName, onSubmitted, autoFocusNote = false }) {
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

  const active = hover || rating;

  return (
    <>
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
        autoFocus={autoFocusNote}
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
    </>
  );
}

// Buyer-side card on a completed order: either the submitted review or the
// rating form.
function ReviewSection({ orderId, builderName, review, onSubmitted }) {
  if (review) {
    return (
      <Card title="Your review">
        <ReviewDisplay review={review} />
      </Card>
    );
  }
  return (
    <Card title="Leave a review">
      <ReviewForm
        orderId={orderId}
        builderName={builderName}
        onSubmitted={onSubmitted}
      />
    </Card>
  );
}

// Task 9: shown after the buyer downloads the finished world, inviting a review.
// Dismissible (reviews stay optional) — closing just leaves the inline
// ReviewSection card in place for later.
function ReviewModal({ orderId, builderName, onClose, onSubmitted }) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="glass rounded-3xl p-6 sm:p-8 max-w-lg w-full">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-bold text-lg">Enjoying your world?</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-white text-xl leading-none -mt-1"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Your download has started. Take a moment to rate the build.
        </p>
        <ReviewForm
          orderId={orderId}
          builderName={builderName}
          onSubmitted={onSubmitted}
        />
      </div>
    </div>
  );
}

// Task 1: a deliberate confirmation step before the buyer releases escrow. The
// release is irreversible (it pays the builder and unlocks the file), so we ask
// the buyer to acknowledge they've reviewed the work — including the 3D preview
// when one is available — before going through.
function ConfirmCompleteModal({ builderName, hasPreview, busy, onClose, onConfirm }) {
  const [ack, setAck] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div className="glass rounded-3xl p-6 sm:p-8 max-w-lg w-full">
        <h2 className="font-bold text-lg mb-1">Confirm &amp; release payment?</h2>
        <p className="text-sm text-gray-400 mb-5">
          This releases the escrowed payment to{" "}
          <strong className="text-gray-200">{builderName}</strong> and unlocks the
          world file for download. It can&apos;t be undone — so make sure
          you&apos;re happy with the build first.
        </p>

        <label className="flex items-start gap-3 p-3 rounded-2xl bg-black/30 border border-white/10 cursor-pointer">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            disabled={busy}
            className="mt-0.5 w-4 h-4 accent-[#4ade80] cursor-pointer"
          />
          <span className="text-sm text-gray-300">
            {hasPreview ? (
              <>
                I&apos;ve reviewed the delivery, including the{" "}
                <span className="text-[#4ade80] font-semibold">3D preview</span>,
                and I&apos;m happy with the work.
              </>
            ) : (
              <>I&apos;ve reviewed the delivery and I&apos;m happy with the work.</>
            )}
          </span>
        </label>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/10 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !ack}
            className="px-5 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Releasing…" : "Confirm & release"}
          </button>
        </div>
      </div>
    </div>
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
        <Icon name="scale" size={14} className="mt-0.5 flex-shrink-0" />
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

function DeliveryCard({ delivery, order, isBuyer, isBuilder, review, onRequestReview }) {
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
    // Task 9: once the buyer has actually downloaded the finished world, nudge
    // them to leave a review (unless they already have). Builders never see this.
    if (isBuyer && !review) onRequestReview?.();
  }, [order.id, downloading, isBuyer, review, onRequestReview]);

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
          <span className="icon-tile icon-tile-sm text-[#4ade80] flex-shrink-0 mt-0.5">
            <Icon name="package" size={18} />
          </span>
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
                <Icon name="box" size={16} className="text-[#4ade80]" /> 3D preview available
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
            <Icon name="lock" size={14} className="mt-0.5 flex-shrink-0" />
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
              <Icon name="lock" size={14} /> Download locked
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

// ─── Deliver modal (Stage 6 + 7) ────────────────────────────────────────────
// Builder side. Takes a .zip, generates a REQUIRED 3D preview (task 7 — no
// delivery without one), uploads both to the private buckets, then calls
// builder_attach_delivery to record + transition the order.
const MAX_DELIVERY_BYTES = 200 * 1024 * 1024; // matches the bucket's file_size_limit

// PreviewError codes that mean the upload simply isn't a readable Minecraft
// world (wrong format/folder, or truly empty). These are fatal — re-pick a file.
const FATAL_WORLD_CODES = new Set(["parse_failed", "no_regions", "empty"]);
// Codes that mean "we couldn't auto-locate the build" — recoverable by entering
// the build coordinates and regenerating.
const COORD_PROMPT_CODES = new Set(["needs_coords", "too_large"]);

// Coordinate + capture-area form, shared by the auto-detect-failed prompt and
// the post-success "Adjust area" panel. The radius is pre-filled from the
// order size and shown read-only; the builder can opt in to a slider to widen
// or narrow the captured cube before (re)generating.
function CoordForm({
  coords,
  setCoords,
  radius,
  setRadius,
  baseRadius,
  buildingSize,
  editRadius,
  setEditRadius,
  busy,
  generating,
  onGenerate,
  tone, // "warn" | "neutral"
  intro,
  submitLabel,
}) {
  const sizeLabel = SIZE_META[buildingSize]?.label || buildingSize || "this";
  const span = radius * 2;
  const box =
    tone === "warn"
      ? "bg-amber-400/[0.06] border-amber-400/20"
      : "bg-white/[0.03] border-white/10";

  return (
    <div className={`mt-4 p-3 rounded-2xl border ${box}`}>
      {intro}
      <div className="grid grid-cols-3 gap-2">
        {["x", "y", "z"].map((axis) => (
          <label key={axis} className="block">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">
              {axis.toUpperCase()}
              {axis === "y" && " (opt.)"}
            </span>
            <input
              // type="text" (not "number") + a non-digit-only keyboard: the
              // iOS/Android numeric keypads hide the minus key, so a digit-only
              // input makes negative Minecraft coordinates impossible to enter.
              // We sanitise to an optional leading "-" plus digits instead.
              type="text"
              inputMode="text"
              pattern="-?[0-9]*"
              value={coords[axis]}
              onChange={(e) =>
                setCoords((c) => ({
                  ...c,
                  [axis]: e.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, ""),
                }))
              }
              disabled={busy}
              placeholder={axis === "y" ? "—" : "0"}
              className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-600 focus:border-[#4ade80]/60 focus:outline-none"
            />
          </label>
        ))}
      </div>

      {/* Capture area — auto-derived from the order size, with an opt-in slider. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">
          Capture area: <strong className="text-gray-200">~{span}×{span} blocks</strong>
          {!editRadius && <> · from {sizeLabel} order</>}
        </p>
        <button
          type="button"
          onClick={() => {
            if (editRadius) setRadius(baseRadius); // reset to suggested on collapse
            setEditRadius((v) => !v);
          }}
          disabled={busy}
          className="text-[11px] font-semibold text-[#4ade80] hover:underline disabled:opacity-50"
        >
          {editRadius ? "Use suggested" : "Edit area size"}
        </button>
      </div>
      {editRadius && (
        <div className="mt-2">
          <input
            type="range"
            min={PREVIEW_RADIUS_MIN}
            max={PREVIEW_RADIUS_MAX}
            step={8}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            disabled={busy}
            className="w-full accent-[#4ade80]"
          />
          <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
            <span>{PREVIEW_RADIUS_MIN * 2}×{PREVIEW_RADIUS_MIN * 2}</span>
            <span>{PREVIEW_RADIUS_MAX * 2}×{PREVIEW_RADIUS_MAX * 2} blocks</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="mt-3 w-full px-4 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? "Generating…" : submitLabel}
      </button>
    </div>
  );
}

function DeliverModal({ orderId, buildingSize, onClose, onDelivered }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const fileInputRef = useRef(null);

  // Preview lifecycle: idle → generating → ready | needs_coords | error.
  const [previewState, setPreviewState] = useState("idle");
  const [previewBytes, setPreviewBytes] = useState(null);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [genId, setGenId] = useState(0); // bumps per successful render → remounts viewer
  const [coords, setCoords] = useState({ x: "", y: "", z: "" });

  // Capture radius (clip half-width). Pre-filled from the order's size; the
  // builder can reveal a slider to adjust it.
  const baseRadius = useMemo(() => suggestedPreviewRadius(buildingSize), [buildingSize]);
  const [radius, setRadius] = useState(baseRadius);
  const [editRadius, setEditRadius] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false); // "Adjust area" panel on a ready preview

  const [delivering, setDelivering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(null); // "preview" | "upload"
  const [errMsg, setErrMsg] = useState(null);

  const busy = previewState === "generating" || delivering;

  // Run the (required) preview generation. `center` scopes an infinite/terrain
  // world to the build's coordinates; null lets the encoder auto-detect first.
  // `r` is the clip half-width used when scoped.
  const runPreview = useCallback(
    async (theFile, center, r) => {
      if (!theFile) return;
      setPreviewState("generating");
      setErrMsg(null);
      setProgress(0);
      try {
        const opts = center ? { center, radius: r } : {};
        const { bytes, meta } = await generatePreview(theFile, setProgress, opts);
        setPreviewBytes(bytes);
        setPreviewMeta(meta);
        setGenId((n) => n + 1);
        setAdjustOpen(false);
        setPreviewState("ready");
      } catch (e) {
        if (e?.name === "PreviewError" && COORD_PROMPT_CODES.has(e.code)) {
          setPreviewState("needs_coords");
          setErrMsg(e.message || "Enter the approximate build coordinates to continue.");
          return;
        }
        if (e?.name === "PreviewError" && FATAL_WORLD_CODES.has(e.code)) {
          setPreviewState("error");
          setErrMsg(
            (e.message || "We couldn't read this as a Minecraft world.") +
              " Make sure you're uploading a .zip of the world folder (the one" +
              " containing level.dat and a region/ folder of .mca files), then" +
              " pick the file again."
          );
          return;
        }
        setPreviewState("error");
        setErrMsg("Couldn't generate the 3D preview. Please try again.");
      }
    },
    []
  );

  const onPick = useCallback(
    (e) => {
      const f = e.target.files?.[0] || null;
      setErrMsg(null);
      setPreviewState("idle");
      setPreviewBytes(null);
      setPreviewMeta(null);
      setCoords({ x: "", y: "", z: "" });
      setRadius(baseRadius);
      setEditRadius(false);
      setAdjustOpen(false);
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
      // Kick off auto-detect immediately.
      runPreview(f, null);
    },
    [runPreview, baseRadius]
  );

  const onGenerateWithCoords = useCallback(() => {
    const x = Number(coords.x);
    const z = Number(coords.z);
    const yRaw = coords.y === "" ? null : Number(coords.y);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      setErrMsg("Enter at least the X and Z coordinates (whole numbers from F3).");
      return;
    }
    if (yRaw !== null && !Number.isFinite(yRaw)) {
      setErrMsg("Y must be a number, or leave it blank.");
      return;
    }
    runPreview(file, { x, z, ...(yRaw === null ? {} : { y: yRaw }) }, radius || baseRadius);
  }, [coords, file, radius, baseRadius, runPreview]);

  // Final step: upload the (already generated) preview + the locked world file,
  // then record the delivery. Gated on previewState === "ready".
  const onDeliver = useCallback(async () => {
    if (delivering || previewState !== "ready" || !file || !previewBytes) return;
    setDelivering(true);
    setErrMsg(null);

    setPhase("preview");
    setProgress(0);
    const { path: previewPath, error: pErr } = await uploadPreview(orderId, previewBytes);
    if (pErr || !previewPath) {
      setDelivering(false);
      setPhase(null);
      setErrMsg(pErr?.message || "Couldn't upload the 3D preview. Please try again.");
      return;
    }

    setPhase("upload");
    setProgress(0);
    const { path, error: upErr } = await uploadDeliverable(orderId, file, setProgress);
    if (upErr || !path) {
      setDelivering(false);
      setPhase(null);
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
    setDelivering(false);
    setPhase(null);
    if (attachErr) {
      setErrMsg(
        attachErr.message ||
          "Upload succeeded but the order couldn't be marked as delivered."
      );
      return;
    }
    onDelivered?.();
  }, [delivering, previewState, file, previewBytes, orderId, note, previewMeta, onDelivered]);

  const showCoords = previewState === "needs_coords";

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div className="glass rounded-3xl p-6 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg mb-1">Deliver the world</h2>
        <p className="text-xs text-gray-500 mb-5">
          Upload the finished build as a <code>.zip</code>. We generate a 3D
          preview for the buyer before you can deliver — the buyer reviews that,
          then confirms to unlock the file (the escrow lock).
        </p>

        {/* Not a <label>: a label would forward clicks to the hidden input,
            double-firing the file dialog alongside the button's own onClick. */}
        <div className="block">
          <span className="text-[11px] text-gray-500 uppercase tracking-widest block mb-1.5">
            World file
          </span>
          {/* Hidden native input + custom trigger: a bare <input type=file>
              renders its button label in the browser's OS locale (not English),
              so we hide it and drive it from our own button. Mirrors the chat
              photo / avatar uploaders. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={onPick}
            disabled={busy}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="px-4 py-2 rounded-full text-xs font-bold bg-[#4ade80]/15 text-[#4ade80] hover:bg-[#4ade80]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {file ? "Change file" : "Choose file"}
          </button>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Up to {humanFileSize(MAX_DELIVERY_BYTES)}.
            {file && (
              <>
                {" "}Selected: <strong className="text-gray-300">{file.name}</strong>{" "}
                ({humanFileSize(file.size)}).
              </>
            )}
          </p>
        </div>

        <label className="block mt-4">
          <span className="text-[11px] text-gray-500 uppercase tracking-widest block mb-1.5">
            Note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            rows={4}
            maxLength={1000}
            placeholder="Anything the buyer should know before they open the world."
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-[#4ade80]/60 focus:outline-none focus:ring-2 focus:ring-[#4ade80]/20 resize-y"
          />
        </label>

        {/* Coordinate prompt — shown when auto-detect couldn't isolate the build
            (infinite / terrain worlds). The builder reads X/Y/Z off F3, and the
            capture radius is pre-filled from the order size. */}
        {showCoords && (
          <CoordForm
            coords={coords}
            setCoords={setCoords}
            radius={radius}
            setRadius={setRadius}
            baseRadius={baseRadius}
            buildingSize={buildingSize}
            editRadius={editRadius}
            setEditRadius={setEditRadius}
            busy={busy}
            generating={previewState === "generating"}
            onGenerate={onGenerateWithCoords}
            tone="warn"
            submitLabel="Generate preview"
            intro={
              <p className="text-[11px] text-amber-200/90 mb-2 leading-relaxed">
                We couldn't find the build automatically. Enter its approximate
                coordinates (press <kbd className="px-1 rounded bg-black/40">F3</kbd>{" "}
                in-game and read the XYZ at the build) and we'll preview just that area.
              </p>
            }
          />
        )}

        {/* Progress bar (generating or uploading). */}
        {busy && (
          <div className="mt-4">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#4ade80] transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              {delivering
                ? phase === "preview"
                  ? "Uploading 3D preview…"
                  : "Uploading world file…"
                : "Generating 3D preview…"}{" "}
              {Math.round(progress * 100)}%
            </p>
          </div>
        )}

        {/* Inline review — the builder sees exactly what the buyer will, and can
            re-center / resize the capture before delivering. */}
        {previewState === "ready" && !delivering && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-[#4ade80] flex items-center gap-1.5">
                <Icon name="check" size={14} strokeWidth={2.5} /> 3D preview ready
                {previewMeta?.voxelCount
                  ? ` — ${previewMeta.voxelCount.toLocaleString()} surface blocks`
                  : ""}
                .
              </p>
              <button
                type="button"
                onClick={() => setAdjustOpen((v) => !v)}
                className="text-[11px] font-semibold text-gray-300 hover:text-white hover:underline"
              >
                {adjustOpen ? "Hide adjust" : "Adjust area"}
              </button>
            </div>
            <PreviewViewer
              key={genId}
              source={{ bytes: previewBytes }}
              className="w-full h-[320px]"
            />
            <p className="text-[10px] text-gray-500 mt-1.5">
              Drag to rotate, scroll to zoom. This is the render the buyer reviews.
            </p>
            {adjustOpen && (
              <CoordForm
                coords={coords}
                setCoords={setCoords}
                radius={radius}
                setRadius={setRadius}
                baseRadius={baseRadius}
                buildingSize={buildingSize}
                editRadius={editRadius}
                setEditRadius={setEditRadius}
                busy={busy}
                generating={previewState === "generating"}
                onGenerate={onGenerateWithCoords}
                tone="neutral"
                submitLabel="Regenerate preview"
                intro={
                  <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
                    Re-center the capture on the build (read X/Y/Z off{" "}
                    <kbd className="px-1 rounded bg-black/40">F3</kbd> in-game) and
                    regenerate. Adjust the area size if the build is cut off.
                  </p>
                }
              />
            )}
          </div>
        )}

        {errMsg && <p className="mt-4 text-sm text-red-400">{errMsg}</p>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/10 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDeliver}
            disabled={busy || previewState !== "ready"}
            className="px-5 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={previewState !== "ready" ? "A 3D preview is required before delivery" : undefined}
          >
            {delivering ? "Delivering…" : "Upload & deliver"}
          </button>
        </div>
      </div>
    </div>
  );
}
