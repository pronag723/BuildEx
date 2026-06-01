"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — /orders stub (Stage 3 placeholder)
// The buyer order-placement flow redirects here after a successful mock pay.
// Confirms the order landed in the DB and shows its current status; Stage 4
// replaces this page with role-aware dashboards and action buttons.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import { fetchOrder } from "../../../lib/orders/api";
import { formatPrice, SIZE_META } from "../../../lib/pricing";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";

const STATUS_LABEL = {
  pending_payment: "Awaiting payment",
  paid: "Paid · in escrow",
  in_progress: "Builder is working",
  delivered: "Delivered — awaiting your confirmation",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export default function OrdersStubPage() {
  useRequireAuth();

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

  const [orderId, setOrderId] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get("id"));
  }, []);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchOrder(orderId).then(({ order: o, error: e }) => {
      if (cancelled) return;
      if (e) setError(e.message || "Failed to load order");
      setOrder(o);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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
        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
            </div>
          ) : !orderId ? (
            <Card title="Your orders">
              <p className="text-sm text-gray-400">
                The order dashboard is on its way (Stage 4). Place an order from
                a builder's profile to see it here.
              </p>
              <div className="mt-4">
                <Link
                  href="/builders"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black transition-all"
                >
                  Browse builders
                </Link>
              </div>
            </Card>
          ) : error || !order ? (
            <Card title="Order not found">
              <p className="text-sm text-gray-400">
                {error || "We couldn't load this order. It may belong to another account."}
              </p>
            </Card>
          ) : (
            <Card title="Order placed">
              <p className="text-xs text-gray-500 uppercase tracking-widest">
                Status
              </p>
              <p className="text-base font-semibold text-[#4ade80]">
                {STATUS_LABEL[order.status] || order.status}
              </p>

              <div className="mt-5 space-y-2 text-sm">
                <Row label="Size">{SIZE_META[order.building_size]?.label || order.building_size}</Row>
                <Row label="Style" capitalize>
                  {order.style}
                </Row>
                <Row label="You paid">{formatPrice(order.price_kopecks)}</Row>
                <Row label="Builder earns">{formatPrice(order.builder_earnings_kopecks)}</Row>
                <Row label="Platform fee">{formatPrice(order.commission_kopecks)}</Row>
              </div>

              <div className="mt-5">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">Brief</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed p-3 rounded-2xl bg-black/30 border border-white/10 max-h-48 overflow-y-auto">
                  {order.brief}
                </p>
              </div>

              <p className="mt-6 text-xs text-gray-500">
                The full order dashboard with chat, deliver, and confirm actions
                ships in Stage 4.
              </p>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}

function Card({ title, children }) {
  return (
    <div className="glass rounded-3xl p-6 sm:p-8">
      <h1 className="font-bold text-xl mb-3">{title}</h1>
      {children}
    </div>
  );
}

function Row({ label, capitalize, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-500 uppercase tracking-widest">
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-gray-200 ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {children}
      </span>
    </div>
  );
}
