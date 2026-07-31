"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CatalogNavbar from "../../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../../builders/components/CatalogMobileMenu";
import SiteFooter from "../../../home/components/SiteFooter";
import { useRequireAuth } from "../../../../lib/auth/useRequireAuth";
import { getPaymentOptions } from "../../../../lib/payments/api";
import { formatPrice } from "../../../../lib/pricing";
import {
  createReadyBuildInvoice,
  createReadyBuildPurchase,
  getReadyBuild,
} from "../../../../lib/readyBuilds/api";
import Avatar from "../../../../lib/ui/Avatar";
import { useGradientBackground } from "../../../../lib/ui/useGradientBackground";

function Chevron({ className = "h-4 w-4" }) {
  return <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7l3 3-3 3" /></svg>;
}

function LockIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function CheckIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>;
}

function PaymentOption({ option, selected, onSelect }) {
  const mark = String(option.symbol || option.code || "?").slice(0, 4).toUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative rounded-2xl border p-4 text-left transition-all duration-300 ${selected ? "-translate-y-0.5 border-[#4ade80] bg-[#4ade80]/10 shadow-[0_0_0_1px_rgba(74,222,128,.12),0_16px_35px_rgba(0,0,0,.22)]" : "border-white/10 bg-black/15 hover:-translate-y-0.5 hover:border-[#4ade80]/45 hover:bg-white/[.04]"}`}
    >
      <span className="flex items-center gap-3">
        <span className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-full border text-[10px] font-extrabold transition-colors ${selected ? "border-[#4ade80]/55 bg-[#4ade80]/20 text-[#4ade80]" : "border-white/10 bg-white/[.06] text-gray-200 group-hover:border-[#4ade80]/35"}`}>{mark}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold">{option.displayName}</span>
            {option.recommended && <span className="rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#4ade80]">Popular</span>}
          </span>
          <span className="mt-1 block truncate text-[11px] text-gray-500">{option.symbol} · {option.network}</span>
        </span>
        <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border transition-all ${selected ? "border-[#4ade80] bg-[#4ade80] text-black" : "border-white/15 text-transparent"}`}><CheckIcon /></span>
      </span>
    </button>
  );
}

export default function ReadyBuildCheckoutPage() {
  const { status } = useRequireAuth();
  const [listingId, setListingId] = useState(null);
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [paymentOptions, setPaymentOptions] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [theme, setTheme] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { gradientRef, edgeGlowRef } = useGradientBackground();
  const isLight = theme === "light";

  useEffect(() => {
    setListingId(new URLSearchParams(window.location.search).get("id"));
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.classList.toggle("light", isLight);
    document.documentElement.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  useEffect(() => {
    if (listingId == null) return;
    if (!listingId) {
      setLoadError("No build was selected.");
      setLoading(false);
      return;
    }
    let active = true;
    getReadyBuild(listingId).then(({ listing: row, error }) => {
      if (!active) return;
      setListing(row?.is_active ? row : null);
      setLoadError(error?.message || (!row?.is_active ? "This build is no longer available." : null));
      setLoading(false);
    });
    return () => { active = false; };
  }, [listingId]);

  useEffect(() => {
    if (!listing) return;
    let active = true;
    setPaymentLoading(true);
    setPaymentError(null);
    getPaymentOptions(listing.price_kopecks).then(({ options = [], message, error }) => {
      if (!active) return;
      const available = options.filter((option) => option.available !== false);
      setPaymentOptions(available);
      setSelectedCurrency(available.find((option) => option.recommended)?.code || available[0]?.code || "");
      setPaymentError(error?.message || message || (!available.length ? "No payment method is currently available for this total." : null));
      setPaymentLoading(false);
    });
    return () => { active = false; };
  }, [listing]);

  const photos = useMemo(() => [...(listing?.media || [])].sort((a, b) => a.position - b.position), [listing?.media]);
  const cover = photos[0];
  const builder = listing?.builder || {};
  const builderName = builder.display_name || builder.username || "BuildEx builder";

  const pay = async () => {
    if (!listing || !selectedCurrency || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const { purchaseId, error: purchaseError } = await createReadyBuildPurchase(listing.id);
    if (purchaseError || !purchaseId) {
      setSubmitError(purchaseError?.message || "Couldn't start your purchase.");
      setSubmitting(false);
      return;
    }
    const { checkoutUrl, error: invoiceError } = await createReadyBuildInvoice(purchaseId, selectedCurrency);
    if (invoiceError || !checkoutUrl) {
      setSubmitError(invoiceError?.message || "Checkout isn't available right now.");
      setSubmitting(false);
      return;
    }
    window.location.assign(checkoutUrl);
  };

  const contentLoading = loading || status === "loading";

  return (
    <div className={`builder-profile-root catalog-root ${isLight ? "light" : ""}`}>
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />
      <CatalogNavbar isLight={isLight} setTheme={setTheme} mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} onShowSoon={() => {}} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} onShowSoon={() => {}} />

      <main className="relative z-10 min-h-screen pb-24 pt-24 lg:pt-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          {contentLoading ? (
            <div className="flex min-h-[60vh] items-center justify-center"><div className="h-11 w-11 animate-spin rounded-full border-2 border-[#4ade80] border-t-transparent" /></div>
          ) : !listing ? (
            <div className="glass mx-auto mt-16 max-w-lg rounded-3xl p-8 text-center"><h1 className="text-xl font-bold">Build unavailable</h1><p className="mt-2 text-sm text-gray-400">{loadError}</p><Link href="/builders?mode=ready" className="mt-5 inline-flex rounded-full bg-[#4ade80] px-5 py-3 text-sm font-bold text-black">Browse ready-made builds</Link></div>
          ) : (
            <>
              <div className="detail-fade-up mb-6 flex items-center justify-between gap-4">
                <nav className="flex min-w-0 items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb"><Link href="/builders?mode=ready" className="hover:text-[#4ade80]">Ready-made builds</Link><Chevron className="h-3 w-3" /><span className="truncate">Checkout</span></nav>
                <Link href={`/build/?id=${encodeURIComponent(listing.id)}`} className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-[#4ade80]/45 hover:text-[#4ade80]"><Chevron className="h-3 w-3 rotate-180" />Back to build</Link>
              </div>

              <div className="mb-8 text-center detail-fade-up"><p className="text-xs font-semibold uppercase tracking-[.22em] text-[#4ade80]">Secure checkout</p><h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Complete your purchase</h1><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-400">Review the build and choose how you want to pay. You’ll receive download access after payment is confirmed.</p></div>

              <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
                <section className="glass rounded-3xl p-5 sm:p-7">
                  <div className="flex items-center justify-between gap-4 border-b border-white/[.08] pb-5"><div><p className="text-[10px] uppercase tracking-widest text-gray-500">Payment method</p><h2 className="mt-1 text-xl font-bold">Choose a network</h2></div><span className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-3 py-1.5 text-[10px] font-semibold text-[#4ade80]"><LockIcon />Protected</span></div>
                  <div className="mt-5">
                    {paymentLoading ? <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-5 text-sm text-gray-400"><div className="h-5 w-5 animate-spin rounded-full border-2 border-[#4ade80] border-t-transparent" />Checking live payment options…</div> : paymentOptions.length ? <div className="grid gap-3 sm:grid-cols-2">{paymentOptions.map((option) => <PaymentOption key={option.code} option={option} selected={selectedCurrency === option.code} onSelect={() => setSelectedCurrency(option.code)} />)}</div> : <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">{paymentError}</p>}
                  </div>
                  <div className="mt-6 rounded-2xl border border-white/[.08] bg-black/15 p-4 text-xs leading-relaxed text-gray-500"><p className="flex gap-2"><LockIcon /><span>BuildEx creates a protected checkout for the selected network. The displayed build price does not change when you switch payment methods.</span></p></div>
                  {submitError && <p className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-400">{submitError}</p>}
                  <button type="button" onClick={pay} disabled={submitting || paymentLoading || !selectedCurrency} className="mt-6 w-full rounded-full bg-[#4ade80] py-4 text-base font-bold text-black shadow-[0_0_28px_rgba(74,222,128,.25)] transition-all hover:-translate-y-0.5 hover:bg-[#86efac] disabled:cursor-wait disabled:opacity-45">{submitting ? "Opening secure checkout…" : `Pay ${formatPrice(listing.price_kopecks)}`}</button>
                </section>

                <aside className="glass overflow-hidden rounded-3xl lg:sticky lg:top-28">
                  <div className="aspect-[16/10] bg-black/25">{cover ? <img src={cover.url} alt={cover.alt || listing.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-gray-500">No preview image</div>}</div>
                  <div className="p-5">
                    <p className="text-[10px] uppercase tracking-widest text-[#4ade80]">You’re buying</p><h2 className="mt-1 text-xl font-bold">{listing.title}</h2><div className="mt-3 flex items-center gap-2.5"><Avatar src={builder.avatar_url} name={builderName} className="h-9 w-9 rounded-full text-xs" /><div className="min-w-0"><p className="truncate text-xs font-semibold">{builderName}</p>{builder.username && <p className="truncate text-[10px] text-gray-500">@{builder.username}</p>}</div></div>
                    <div className="mt-5 flex items-center justify-between border-t border-white/[.08] pt-5"><span className="text-sm text-gray-400">Total</span><span className="text-2xl font-extrabold text-[#4ade80]">{formatPrice(listing.price_kopecks)}</span></div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-gray-500"><span className="flex items-center gap-1.5"><CheckIcon /><span>Instant access</span></span><span className="flex items-center gap-1.5"><CheckIcon /><span>Source world</span></span></div>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
