"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import CatalogNavbar from "../../components/CatalogNavbar";
import CatalogMobileMenu from "../../components/CatalogMobileMenu";
import SiteFooter from "../../../home/components/SiteFooter";
import { withBase } from "../../../home/utils";
import { useAuthGate } from "../../../../lib/auth/useAuthGate";
import {
  RANKS,
  BUILDER_PROFILES,
  OFFER_DETAILS,
  FEATURES_BY_TYPE,
} from "../../data/offers";
import { getBuilderReviews as getOfferReviews, getBuilderRatingBreakdown as getOfferRatingBreakdown } from "../../data/reviews";

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconStar({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}
function IconClock({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}
function IconRefresh({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}
function IconCheck({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconChevron({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 7l3 3-3 3" />
    </svg>
  );
}
function IconArrow({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 10h10M11 6l4 4-4 4" />
    </svg>
  );
}
function IconChat({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
function IconShield({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

// ─── Reveal hook ─────────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("active"); obs.unobserve(el); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ─── Gallery ─────────────────────────────────────────────────────────────────
function OfferGallery({ images, title }) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);
  const ref = useReveal();

  const go = useCallback((idx) => {
    if (idx === active) return;
    setVisible(false);
    setTimeout(() => { setActive(idx); setVisible(true); }, 200);
  }, [active]);

  const prev = () => go((active - 1 + images.length) % images.length);
  const next = () => go((active + 1) % images.length);

  return (
    <section ref={ref} className="reveal gallery-container glass rounded-3xl overflow-hidden">
      {/* Main image */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
        <img
          key={active}
          src={images[active]}
          alt={`${title} — view ${active + 1}`}
          className="w-full h-full object-cover"
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.2s ease" }}
          loading={active === 0 ? "eager" : "lazy"}
          decoding="async"
        />

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

        {/* Counter badge */}
        <div className="absolute bottom-3 right-3 glass px-3 py-1 rounded-full text-xs text-white/80 font-medium select-none">
          {active + 1} / {images.length}
        </div>

        {/* Prev / Next (appear on gallery hover) */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous image"
              className="gallery-arrow absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 glass rounded-full flex items-center justify-center text-white/80 hover:text-white hover:border-[#4ade80]/50 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 10H5M9 14l-4-4 4-4" />
              </svg>
            </button>
            <button
              onClick={next}
              aria-label="Next image"
              className="gallery-arrow absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 glass rounded-full flex items-center justify-center text-white/80 hover:text-white hover:border-[#4ade80]/50 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 10h10M11 6l4 4-4 4" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 p-3 overflow-x-auto scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`View image ${i + 1}`}
              className="flex-shrink-0 w-20 h-14 rounded-xl overflow-hidden border-2 transition-all duration-200"
              style={{ borderColor: i === active ? "#4ade80" : "rgba(255,255,255,0.1)" }}
            >
              <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── About section ────────────────────────────────────────────────────────────
function AboutSection({ offer }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="reveal glass rounded-3xl p-6 lg:p-8">
      <h2 className="font-bold text-xl mb-4">About This Offer</h2>
      <p className="text-gray-400 leading-relaxed mb-5">{offer.description}</p>
      <div className="flex flex-wrap gap-2">
        {offer.tags.map((tag) => (
          <span key={tag} className="px-3 py-1.5 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400 capitalize">
            #{tag}
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Features section ─────────────────────────────────────────────────────────
function FeaturesSection({ features }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="reveal glass rounded-3xl p-6 lg:p-8">
      <h2 className="font-bold text-xl mb-5">What&apos;s Included</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {features.map((feat, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[#4ade80]/15 border border-[#4ade80]/30 flex items-center justify-center text-[#4ade80]">
              <IconCheck className="w-2.5 h-2.5" />
            </span>
            <span className="text-sm text-gray-300">{feat}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Builder card ─────────────────────────────────────────────────────────────
function BuilderCard({ builder, profile, rank }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="reveal glass rounded-3xl p-6 lg:p-8">
      <h2 className="font-bold text-xl mb-6">About the Builder</h2>

      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <div className="relative flex-shrink-0">
          <img
            src={builder.avatar}
            alt={builder.display_name}
            className="w-16 h-16 rounded-full object-cover ring-2 ring-[#4ade80]/30"
            loading="lazy"
            decoding="async"
          />
          {profile.online && (
            <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[#4ade80] border-2 border-[#1a1a1a] online-dot" aria-label="Online" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-lg leading-tight">{builder.display_name}</h3>
          <p className="text-sm text-gray-400">@{builder.username}</p>
          <span className={`inline-block mt-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border ${rank.bgClass} ${rank.textClass} ${rank.borderClass}`}>
            {rank.label} Builder
          </span>
        </div>
        <div className="ml-auto flex-shrink-0 hidden sm:block">
          {profile.online ? (
            <span className="flex items-center gap-1.5 text-xs text-[#4ade80] font-medium">
              <span className="w-2 h-2 rounded-full bg-[#4ade80] online-dot" />
              Online now
            </span>
          ) : (
            <span className="text-xs text-gray-500">Offline</span>
          )}
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <p className="text-sm text-gray-400 leading-relaxed mb-6">{profile.bio}</p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: "⭐", value: builder.avg_rating.toFixed(2), label: "Avg. Rating" },
          { icon: "📦", value: profile.completed_projects ?? (builder.avg_rating > 4.9 ? "99+" : "50+"), label: "Orders Done" },
          { icon: "⏱️", value: profile.response_time ?? "~3 hrs", label: "Response" },
          { icon: "📅", value: profile.member_since ? new Date(profile.member_since).getFullYear() : "2022", label: "Member Since" },
        ].map(({ icon, value, label }) => (
          <div key={label} className="glass rounded-2xl p-3.5 text-center">
            <p className="text-xl mb-0.5">{icon}</p>
            <p className="font-bold text-sm">{value}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Specialties */}
      {profile.specialties && (
        <div className="flex flex-wrap gap-2">
          {profile.specialties.map((s) => (
            <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400">
              {s}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Reviews section ──────────────────────────────────────────────────────────
function ReviewsSection({ reviews, offer }) {
  const ref = useReveal();
  const breakdown = getOfferRatingBreakdown(offer.id);
  const total = reviews.length;

  function RatingBar({ stars }) {
    const count = breakdown[stars] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400 w-4 text-right">{stars}</span>
        <IconStar className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="rating-bar-fill h-full rounded-full bg-[#4ade80]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-gray-500 w-6 text-left">{count}</span>
      </div>
    );
  }

  return (
    <section ref={ref} className="reveal glass rounded-3xl p-6 lg:p-8" id="reviews">
      <h2 className="font-bold text-xl mb-6">Reviews</h2>

      {total === 0 ? (
        <p className="text-gray-500 text-sm">No reviews yet for this offer.</p>
      ) : (
        <>
          {/* Summary */}
          <div className="flex flex-col sm:flex-row gap-6 mb-8 pb-8 border-b border-white/[0.08]">
            <div className="text-center flex-shrink-0">
              <p className="text-5xl font-extrabold text-[#4ade80]">{offer.rating.toFixed(1)}</p>
              <div className="flex items-center justify-center gap-0.5 mt-2 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <IconStar key={s} className={`w-4 h-4 ${s <= Math.round(offer.rating) ? "text-amber-400" : "text-gray-600"}`} />
                ))}
              </div>
              <p className="text-xs text-gray-500">{total} review{total !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 space-y-2">
              {[5, 4, 3, 2, 1].map((s) => <RatingBar key={s} stars={s} />)}
            </div>
          </div>

          {/* Individual reviews */}
          <div className="space-y-5">
            {reviews.map((rev) => (
              <article key={rev.id} className="flex gap-3 group">
                <img
                  src={rev.reviewer.avatar}
                  alt={rev.reviewer.display_name}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5 ring-1 ring-white/10"
                  loading="lazy"
                  decoding="async"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{rev.reviewer.display_name}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <IconStar key={s} className={`w-3 h-3 ${s <= rev.rating ? "text-amber-400" : "text-gray-600"}`} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(rev.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">{rev.comment}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Order sidebar ────────────────────────────────────────────────────────────
function OrderSidebar({ offer, rank, profile, onShowSoon }) {
  const fee = Math.round(offer.starting_price * 0.05);
  const total = offer.starting_price + fee;

  return (
    <div className="glass rounded-3xl p-6 builder-sidebar-sticky space-y-5">
      {/* Price */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Starting price</p>
        <p className="text-4xl font-extrabold text-[#4ade80] leading-none">
          ${offer.starting_price.toLocaleString()}
        </p>
      </div>

      {/* Breakdown */}
      <div className="space-y-2.5 py-4 border-y border-white/[0.08]">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">Builder price</span>
          <span className="font-medium">${offer.starting_price.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400 flex items-center gap-1.5">
            <IconShield className="w-3.5 h-3.5 text-[#4ade80]" />
            BuildEx fee (5%)
          </span>
          <span className="font-medium">${fee.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center pt-1.5 border-t border-white/[0.06]">
          <span className="font-semibold">You pay</span>
          <span className="font-bold text-[#4ade80] text-lg">${total.toLocaleString()}</span>
        </div>
      </div>

      {/* Delivery + Revisions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-3.5 text-center">
          <p className="text-2xl font-extrabold">{offer.delivery_days}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Day Delivery</p>
        </div>
        <div className="glass rounded-2xl p-3.5 text-center">
          <p className="text-2xl font-extrabold">{offer.revisions}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Revisions</p>
        </div>
      </div>

      {/* CTAs */}
      <button
        type="button"
        onClick={() => onShowSoon("Checkout flow coming soon!")}
        className="w-full py-4 rounded-full bg-[#4ade80] text-black font-bold text-base green-glow hover:bg-[#22c55e] transition-all flex items-center justify-center gap-2"
      >
        Place Order
        <IconArrow className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => onShowSoon("Messaging system coming soon — real-time chat powered by Supabase Realtime.")}
        className="w-full py-3.5 rounded-full border border-[#4ade80]/40 text-[#4ade80] font-semibold text-base hover:bg-[#4ade80]/10 hover:border-[#4ade80] hover:shadow-[0_0_20px_rgba(74,222,128,0.2)] transition-all flex items-center justify-center gap-2"
      >
        <IconChat className="w-4 h-4" />
        Chat with Builder
      </button>

      {/* Availability */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <span className="w-2 h-2 rounded-full bg-[#4ade80] online-dot flex-shrink-0" />
        <span>
          {profile?.online ? "Available · Taking orders now" : "Currently available for orders"}
        </span>
      </div>

      {/* Trust badges */}
      <div className="pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2">
        {[
          { icon: "🔒", label: "Escrow Protected" },
          { icon: "↩️", label: "Revision Guarantee" },
          { icon: "📁", label: "Files Included" },
          { icon: "⚡", label: "Fast Delivery" },
        ].map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────
export default function OfferDetailPage({ offer }) {
  const [theme, setTheme] = useState("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const isLight = theme === "light";
  const rank = RANKS[offer.builder.rank];
  const profile = BUILDER_PROFILES[offer.builder.username] || {};
  const detail = OFFER_DETAILS[offer.id] || {};
  const images = detail.images?.length > 0 ? detail.images : [`https://picsum.photos/seed/${offer.id}-1/900/560`];
  const features = detail.features || FEATURES_BY_TYPE[offer.build_type] || [];
  const reviews = getOfferReviews(offer.id);

  const gate = useAuthGate();

  // Toast helper for navbar "coming soon" actions (no auth required)
  const showSoon = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Auth-gated action: if logged in, show the coming-soon toast.
  // If logged out, redirect to /login with this offer as the return path.
  const requireAuthThenSoon = useCallback(
    (msg) => {
      gate(() => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
      });
    },
    [gate]
  );

  // Theme init
  useEffect(() => {
    const saved = window.localStorage.getItem("theme") || "dark";
    setTheme(saved);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (isLight) {
      html.classList.add("light");
      html.classList.remove("dark");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); obs.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className={`min-h-screen ${isLight ? "light" : ""} catalog-root`}>
      <div className="gradient-background" />
      <div className="gradient-edge-glow" />

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

      {/* Toast */}
      <div
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-none transition-all duration-500 ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="glass catalog-toast rounded-2xl px-5 py-3 text-sm font-medium text-[#4ade80] flex items-center gap-2 shadow-2xl whitespace-nowrap max-w-xs text-center">
          <span className="text-[#4ade80]">✦</span>
          {toast}
        </div>
      </div>

      <main className="relative z-10 pt-24 lg:pt-28 pb-36 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 detail-fade-up flex-wrap" aria-label="Breadcrumb">
            <a href={withBase("/")} className="hover:text-[#4ade80] transition-colors">Home</a>
            <IconChevron className="w-3 h-3 opacity-50" />
            <a href={withBase("/builders")} className="hover:text-[#4ade80] transition-colors">Builders</a>
            <IconChevron className="w-3 h-3 opacity-50" />
            <span className="truncate max-w-[200px] sm:max-w-xs" aria-current="page">{offer.title}</span>
          </nav>

          {/* Page header */}
          <header className="mb-8 detail-fade-up" style={{ animationDelay: "80ms" }}>
            {/* Classification badges */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${rank.bgClass} ${rank.textClass} ${rank.borderClass}`}>
                {rank.label} Builder
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400 capitalize">{offer.style}</span>
              <span className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400 capitalize">{offer.build_type}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-[2rem] xl:text-[2.4rem] font-extrabold leading-tight mb-4 max-w-3xl">
              {offer.title}
            </h1>

            {/* Meta bar */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <IconStar className="w-3.5 h-3.5 text-amber-400" />
                <strong className="text-amber-400">{offer.rating.toFixed(2)}</strong>
                <span>({offer.order_count} reviews)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <IconClock className="w-3.5 h-3.5" />
                {offer.delivery_days} day delivery
              </span>
              <span className="flex items-center gap-1.5">
                <IconRefresh className="w-3.5 h-3.5" />
                {offer.revisions} revision{offer.revisions !== 1 ? "s" : ""} included
              </span>
              <span className="flex items-center gap-1.5">
                by
                <img src={offer.builder.avatar} alt="" className="w-5 h-5 rounded-full object-cover" loading="lazy" />
                <strong>{offer.builder.display_name}</strong>
              </span>
            </div>
          </header>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-8 items-start">

            {/* LEFT: Content */}
            <div className="space-y-8 min-w-0">
              <OfferGallery images={images} title={offer.title} />
              <AboutSection offer={offer} />
              <FeaturesSection features={features} />
              <BuilderCard builder={offer.builder} profile={profile} rank={rank} />
              <ReviewsSection reviews={reviews} offer={offer} />
            </div>

            {/* RIGHT: Sticky sidebar (desktop only) */}
            <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
              <OrderSidebar offer={offer} rank={rank} profile={profile} onShowSoon={requireAuthThenSoon} />
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[150] glass border-t border-white/10 safe-bottom px-4 pt-3 pb-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="flex-shrink-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">From</p>
            <p className="text-lg font-extrabold text-[#4ade80] leading-none">
              ${offer.starting_price.toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => requireAuthThenSoon("Checkout flow coming soon!")}
            className="flex-1 py-3 rounded-full bg-[#4ade80] text-black font-bold text-sm green-glow flex items-center justify-center gap-1.5"
          >
            Place Order
            <IconArrow className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => requireAuthThenSoon("Messaging system coming soon!")}
            className="py-3 px-4 rounded-full border border-[#4ade80]/40 text-[#4ade80] font-semibold text-sm hover:bg-[#4ade80]/10 hover:border-[#4ade80] transition-all flex items-center gap-1.5 flex-shrink-0"
          >
            <IconChat className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
