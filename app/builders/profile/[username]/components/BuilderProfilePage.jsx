"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import CatalogNavbar from "../../../components/CatalogNavbar";
import CatalogMobileMenu from "../../../components/CatalogMobileMenu";
import SiteFooter from "../../../../home/components/SiteFooter";
import { RANKS } from "../../../data/builders";
import { getBuilderReviews } from "../../../data/reviews";
import { listBuilderReviews } from "../../../../../lib/reviews/api";
import { publicAsset, withBase } from "../../../../home/utils";
import Avatar from "../../../../../lib/ui/Avatar";
import { useAuthGate } from "../../../../../lib/auth/useAuthGate";
import { AVAILABILITY_STATES } from "../../../../../lib/onboarding/constants";
import { formatPrice } from "../../../../../lib/pricing";
import { useFavorites } from "../../../../../lib/favorites/FavoritesContext";

// Neutral avatar used when a reviewer has no picture (e.g. a Discord account
// without an avatar). Inline so it never 404s under the GitHub Pages basePath.
const FALLBACK_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='20' fill='%23334155'/%3E%3Ccircle cx='20' cy='16' r='7' fill='%2364748b'/%3E%3Cpath d='M6 38c0-8 6-12 14-12s14 4 14 12' fill='%2364748b'/%3E%3C/svg%3E";

// Both the live (Supabase) and demo (mock) review sources are normalised to one
// shape so the Reviews section doesn't care where a review came from.
function mapDbReviews(rows) {
  return (rows || []).map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.body || "",
    created_at: r.created_at,
    reviewerName: r.reviewer?.display_name || r.reviewer?.username || "Client",
    reviewerAvatar: r.reviewer?.avatar_url || null,
    project: null,
  }));
}
function mapMockReviews(rows) {
  return (rows || []).map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.comment || "",
    created_at: r.created_at,
    reviewerName: r.reviewer?.display_name || "Client",
    reviewerAvatar: r.reviewer?.avatar || null,
    project: r.project || null,
  }));
}

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
function IconChat({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
function IconQuote({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="14" x2="15" y2="14" />
      <line x1="9" y1="18" x2="13" y2="18" />
    </svg>
  );
}

// ─── Portfolio carousel ──────────────────────────────────────────────────────
function PortfolioCarousel({ items }) {
  const [index, setIndex] = useState(0);
  const count = items.length;

  const go = (dir) => setIndex((i) => (i + dir + count) % count);

  return (
    <div className="group/media relative rounded-3xl overflow-hidden glass">
      <div
        className="flex transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {items.map((item) => (
          <div key={item.id} className="relative w-full flex-shrink-0 aspect-[16/9] overflow-hidden">
            <img
              src={publicAsset(item.thumbnail)}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

            {item.featured && (
              <div className="absolute bottom-4 left-4 px-3 py-1 rounded-full text-xs bg-[#4ade80]/20 text-[#4ade80] backdrop-blur-sm border border-[#4ade80]/30 font-semibold flex items-center gap-1">
                <IconStar className="w-3 h-3" /> Featured
              </div>
            )}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous build"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
          >
            <IconChevron className="w-5 h-5 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Next build"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#4ade80]/25 text-white border border-[#4ade80]/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] transition-all duration-200"
          >
            <IconChevron className="w-5 h-5" />
          </button>

          {/* Slide dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Go to build ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all duration-200 ${
                  i === index ? "w-6 bg-[#4ade80]" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Rate card (exact price, new shape) ─────────────────────────────────────
function RateCard({ size, info }) {
  const labelMap = {
    small:  { title: "Small Build",  icon: "🏠" },
    medium: { title: "Medium Build", icon: "🏛️" },
    large:  { title: "Large Build",  icon: "🏰" },
  };
  const meta = labelMap[size];
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-2 transition-all duration-300 hover:border-[#4ade80]/40 hover:shadow-[0_0_24px_rgba(74,222,128,0.12)]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{meta.icon}</span>
        <h3 className="font-bold text-base">{meta.title}</h3>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{info.label}</p>
      <div className="mt-2 pt-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Price</p>
        <p className="text-[#4ade80] font-extrabold text-xl leading-tight">
          {info.price > 0 ? formatPrice(info.price) : "—"}
        </p>
      </div>
    </div>
  );
}

// ─── Contact sidebar ─────────────────────────────────────────────────────────
function ContactSidebar({ builder, onShowSoon, onContact, onOrder }) {
  // Orders are only open when the builder is "available". "busy" hides them from
  // the feed and pauses work; "limited" keeps them visible but also pauses new
  // orders — both disable the Order CTA, with a status-specific note.
  const status = builder.availability_status || "available";
  const isBusy = status === "busy";
  const isLimited = status === "limited";
  const ordersBlocked = isBusy || isLimited;
  return (
    <div className="glass rounded-3xl p-6 builder-sidebar-sticky space-y-5">
      {/* Avatar + header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <Avatar
            src={builder.avatar}
            name={builder.display_name}
            className="w-14 h-14 rounded-full ring-2 ring-[#4ade80]/30 text-xl"
          />
          {builder.online && (
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#4ade80] border-2 border-[#1a1a1a] online-dot" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-base leading-tight">{builder.display_name}</p>
          {builder.online ? (
            <p className="text-xs text-[#4ade80] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] online-dot" />
              Online now
            </p>
          ) : (
            <p className="text-xs text-gray-500">Offline · replies {builder.response_time}</p>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-3 text-center">
          <p className="text-xl font-extrabold">{builder.avg_rating.toFixed(2)}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Rating</p>
        </div>
        <div className="glass rounded-2xl p-3 text-center">
          <p className="text-xl font-extrabold">{builder.completed_projects}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Projects</p>
        </div>
      </div>

      {/* Starting price */}
      <div className="py-4 border-y border-white/[0.08]">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Rates from</p>
        <p className="text-2xl font-extrabold text-[#4ade80] leading-none">
          {builder.starts_from > 0 ? formatPrice(builder.starts_from) : "—"}
        </p>
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
          Final pricing is discussed per project.
        </p>
      </div>

      {/* CTAs — Order is the primary (green) action, Contact is secondary (dark) */}
      <button
        type="button"
        onClick={onOrder}
        disabled={ordersBlocked}
        title={ordersBlocked ? "This builder isn't taking new orders right now" : undefined}
        className={`w-full py-4 rounded-full font-bold text-base transition-all flex items-center justify-center gap-2 ${
          ordersBlocked
            ? "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
            : "bg-[#4ade80] text-black green-glow hover:bg-[#22c55e]"
        }`}
      >
        <IconQuote className="w-4 h-4" />
        {ordersBlocked ? "Not taking orders" : "Order Now"}
      </button>

      <button
        type="button"
        onClick={onContact}
        className="w-full py-3.5 rounded-full border border-white/15 bg-white/5 text-gray-200 font-semibold text-base hover:bg-white/10 hover:border-white/30 transition-all flex items-center justify-center gap-2"
      >
        <IconChat className="w-4 h-4" />
        Contact Builder
      </button>
      {ordersBlocked && (
        <p className="-mt-2 text-center text-[11px] text-gray-500 leading-relaxed">
          {isBusy
            ? "This builder is currently busy and isn't taking new orders. You can still contact them to discuss future work."
            : "This builder has limited availability and isn't taking new orders right now. You can still contact them to discuss future work."}
        </p>
      )}

      {/* Response info */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <IconClock className="w-3.5 h-3.5" />
        Typically replies in <strong>{builder.response_time}</strong>
      </div>

      {/* Trust badges */}
      <div className="pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2">
        {[
          { icon: "🔒", label: "Escrow Protected" },
          { icon: "💬", label: "Discuss Anytime" },
          { icon: "📁", label: "Source Files" },
          { icon: "✦", label: "Custom Quotes" },
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

// ─── Reviews section ─────────────────────────────────────────────────────────
function ReviewsSection({ reviews, builder }) {
  const total = reviews.length;
  // Star distribution computed from the (already normalised) list, so it works
  // identically for live and demo data.
  const breakdown = reviews.reduce(
    (acc, rev) => {
      acc[rev.rating] = (acc[rev.rating] || 0) + 1;
      return acc;
    },
    { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  );

  function RatingBar({ stars }) {
    const count = breakdown[stars] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400 w-4 text-right">{stars}</span>
        <IconStar className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="rating-bar-fill h-full rounded-full bg-[#4ade80]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-gray-500 w-6 text-left">{count}</span>
      </div>
    );
  }

  return (
    <section className="reveal glass rounded-3xl p-6 lg:p-8" id="reviews">
      <h2 className="font-bold text-xl mb-6">Reviews</h2>

      {total === 0 ? (
        <p className="text-gray-500 text-sm">No reviews yet for this builder.</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-6 mb-8 pb-8 border-b border-white/[0.08]">
            <div className="text-center flex-shrink-0">
              <p className="text-5xl font-extrabold text-[#4ade80]">{builder.avg_rating.toFixed(1)}</p>
              <div className="flex items-center justify-center gap-0.5 mt-2 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <IconStar key={s} className={`w-4 h-4 ${s <= Math.round(builder.avg_rating) ? "text-amber-400" : "text-gray-600"}`} />
                ))}
              </div>
              <p className="text-xs text-gray-500">{total} review{total !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 space-y-2">
              {[5, 4, 3, 2, 1].map((s) => <RatingBar key={s} stars={s} />)}
            </div>
          </div>

          <div className="space-y-5">
            {reviews.map((rev) => (
              <article key={rev.id} className="flex gap-3">
                <img
                  src={rev.reviewerAvatar ? publicAsset(rev.reviewerAvatar) : FALLBACK_AVATAR}
                  alt={rev.reviewerName}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5 ring-1 ring-white/10"
                  loading="lazy"
                  decoding="async"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{rev.reviewerName}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <IconStar key={s} className={`w-3 h-3 ${s <= rev.rating ? "text-amber-400" : "text-gray-600"}`} />
                      ))}
                    </div>
                    {rev.project && (
                      <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                        {rev.project}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(rev.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  {rev.text && (
                    <p className="text-sm text-gray-400 leading-relaxed">{rev.text}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function BuilderProfilePage({ builder }) {
  const [theme, setTheme] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);

  const isLight = theme === "light";
  const rank = RANKS[builder.rank];
  // Orders are only open when "available"; both "busy" and "limited" pause them.
  const ordersBlocked =
    builder.availability_status === "busy" ||
    builder.availability_status === "limited";

  // Real, DB-backed builders carry a profiles.id — fetch their reviews live.
  // Demo/seeded builders (no id, served from static data) keep the mock set so
  // the catalog still looks populated offline.
  const [reviews, setReviews] = useState(() =>
    builder.id ? [] : mapMockReviews(getBuilderReviews(builder.username))
  );

  useEffect(() => {
    if (!builder.id) return;
    let cancelled = false;
    listBuilderReviews(builder.id).then(({ reviews: rows }) => {
      if (!cancelled) setReviews(mapDbReviews(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [builder.id, builder.username]);

  const gate = useAuthGate();
  const router = useRouter();

  // Favorites — signed-in visitors can bookmark this builder from the header.
  const { canFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(builder.id);

  const showSoon = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Open (or jump to) a chat thread with this builder. Auth-gated: unauthenticated
  // visitors are routed to /login first, then back here. The /chats page resolves
  // the @handle to the builder and starts the conversation.
  const contactBuilder = useCallback(() => {
    // Next prepends the deployment basePath to router.push automatically, so the
    // path must stay base-less here — wrapping it in withBase() would double the
    // prefix (/BuildEx/BuildEx/chats) and 404 on GitHub Pages.
    const target = `/chats?to=${encodeURIComponent(builder.username)}`;
    gate(
      () => {
        router.push(target);
      },
      { redirectTo: target }
    );
  }, [gate, router, builder.username]);

  // "Order now" CTA — routes to the buyer placement flow (Stage 3).
  // Auth-gated so logged-out visitors hit /login first and come back here.
  const orderNow = useCallback(() => {
    // Orders are only open when the builder is "available". A "busy" builder is
    // hidden from the feed; a "limited" one stays visible but has paused new
    // orders — both short-circuit with a notice instead of routing to the
    // (now-blocked) placement page.
    const status = builder.availability_status || "available";
    if (status === "busy" || status === "limited") {
      setToast(
        status === "busy"
          ? `${builder.display_name} is busy and isn't taking new orders right now.`
          : `${builder.display_name} has limited availability and isn't taking new orders right now.`
      );
      setTimeout(() => setToast(null), 3500);
      return;
    }
    const target = `/order/?to=${encodeURIComponent(builder.username)}`;
    gate(
      () => {
        router.push(target);
      },
      { redirectTo: target }
    );
  }, [gate, router, builder.username, builder.availability_status, builder.display_name]);

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

  // ── Animated gradient background (identical to catalog/home pages) ────────
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

    function periToXY(progress, offset) {
      const p = ((progress % 1) + 1) % 1;
      const seg = p * 4;
      const si = Math.floor(seg);
      const sp = seg - si;
      switch (si) {
        case 0:  return { x: offset + sp * (100 - offset * 2), y: offset };
        case 1:  return { x: 100 - offset, y: offset + sp * (100 - offset * 2) };
        case 2:  return { x: 100 - offset - sp * (100 - offset * 2), y: 100 - offset };
        default: return { x: offset, y: 100 - offset - sp * (100 - offset * 2) };
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
  }, []);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); obs.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className={`builder-profile-root ${isLight ? "light" : ""} catalog-root`}>
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

      {/* Toast */}
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

      <main className="relative z-10 pt-24 lg:pt-28 pb-36 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Breadcrumb + back button */}
          <div className="flex items-center justify-between gap-4 mb-6 detail-fade-up flex-wrap">
            <nav className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-[#4ade80] transition-colors">Home</Link>
              <IconChevron className="w-3 h-3 opacity-50" />
              <Link href="/builders" className="hover:text-[#4ade80] transition-colors">Builders</Link>
              <IconChevron className="w-3 h-3 opacity-50" />
              <span className="truncate max-w-[200px] sm:max-w-xs" aria-current="page">{builder.display_name}</span>
            </nav>
            <div className="flex items-center gap-2">
              {canFavorite && builder.id && (
                <button
                  type="button"
                  onClick={() => toggleFavorite(builder.id)}
                  aria-pressed={favorited}
                  aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                    favorited
                      ? "bg-[#4ade80] text-black border-[#4ade80] shadow-[0_0_18px_rgba(74,222,128,0.4)]"
                      : "border-white/15 text-gray-300 bg-white/5 hover:border-[#4ade80]/50 hover:text-[#4ade80]"
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill={favorited ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {favorited ? "Saved" : "Save"}
                </button>
              )}
              <Link
                href="/builders"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black hover:border-[#4ade80] hover:shadow-[0_0_18px_rgba(74,222,128,0.35)] transition-all"
              >
                <IconChevron className="w-3 h-3 rotate-180" />
                Back to Builders
              </Link>
            </div>
          </div>

          {/* ── Hero header ───────────────────────────────────────────────── */}
          <header className="glass rounded-3xl p-6 sm:p-8 mb-8 detail-fade-up">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Avatar */}
              <div className="relative flex-shrink-0 mx-auto sm:mx-0">
                <Avatar
                  src={builder.avatar}
                  name={builder.display_name}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl ring-2 ring-[#4ade80]/30 shadow-xl text-4xl"
                />
                {builder.online && (
                  <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#4ade80] border-[3px] border-[#1a1a1a] online-dot" />
                )}
              </div>

              {/* Identity + stats */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                    {builder.display_name}
                  </h1>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${rank.bgClass} ${rank.textClass} ${rank.borderClass}`}>
                    {rank.label} Builder
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">@{builder.username}</p>

                {/* Meta bar */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-gray-400 mb-4">
                  <span className="flex items-center gap-1.5">
                    <IconStar className="w-3.5 h-3.5 text-amber-400" />
                    <strong className="text-amber-400">{builder.avg_rating.toFixed(2)}</strong>
                    <span>({reviews.length} reviews)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    📦 {builder.completed_projects} completed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <IconClock className="w-3.5 h-3.5" />
                    Replies {builder.response_time}
                  </span>
                  {(() => {
                    const avail =
                      AVAILABILITY_STATES.find(
                        (a) => a.key === (builder.availability_status || "available")
                      ) || AVAILABILITY_STATES[0];
                    return (
                      <span className="flex items-center gap-1.5 font-medium" style={{ color: avail.dot }}>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: avail.dot, boxShadow: `0 0 8px ${avail.dot}` }}
                        />
                        {avail.label}
                      </span>
                    );
                  })()}
                </div>

                {/* Specialties */}
                <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                  {builder.specialties.map((s) => (
                    <span key={s} className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </header>

          {/* ── Two-column layout ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-8 items-start">

            {/* LEFT: Content */}
            <div className="space-y-8 min-w-0">

              {/* Portfolio gallery */}
              <section className="reveal">
                <div className="flex items-end justify-between mb-5">
                  <h2 className="font-bold text-xl">Portfolio</h2>
                  <span className="text-xs text-gray-500">
                    {builder.portfolio.length} {builder.portfolio.length === 1 ? "build" : "builds"}
                  </span>
                </div>
                {builder.portfolio.length === 0 ? (
                  <div className="glass rounded-3xl p-12 text-center text-gray-500 text-sm">
                    This builder hasn&apos;t added portfolio entries yet.
                  </div>
                ) : (
                  <PortfolioCarousel items={builder.portfolio} />
                )}
              </section>

              {/* About */}
              <section className="reveal glass rounded-3xl p-6 lg:p-8">
                <h2 className="font-bold text-xl mb-4">About</h2>
                {builder.bio && (
                  <p className="text-gray-400 leading-relaxed mb-6">{builder.bio}</p>
                )}

                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Tools used</p>
                  <div className="flex flex-wrap gap-1.5">
                    {builder.tools.map((t) => (
                      <span key={t} className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/[0.08]">
                  <div className="text-center">
                    <p className="text-xl font-bold">{builder.avg_rating.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Avg. Rating</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold">{builder.completed_projects}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Projects</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold">{builder.response_time}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Response</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold">{new Date(builder.member_since).getFullYear()}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Member Since</p>
                  </div>
                </div>
              </section>

              {/* Rates */}
              <section className="reveal glass rounded-3xl p-6 lg:p-8">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
                  <div>
                    <h2 className="font-bold text-xl">Rates & Project Scale</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Exact prices per build scale. Final scope is always discussed per project.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80] font-medium self-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                    Custom quotes welcome
                  </span>
                </div>

                {(() => {
                  const enabledSizes = ["small", "medium", "large"].filter(
                    (s) => builder.rates?.[s]?.enabled !== false && builder.rates?.[s]
                  );
                  return enabledSizes.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No rates set yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {enabledSizes.map((s) => (
                        <RateCard key={s} size={s} info={builder.rates[s]} />
                      ))}
                    </div>
                  );
                })()}

                <div className="mt-5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">💡</span>
                    <div className="text-sm text-gray-400 leading-relaxed">
                      <strong className="text-white">How pricing works:</strong> Every BuildEx commission is unique.
                      Rates depend on build scale, complexity, custom particles, terrain work, and revision rounds.
                      Send {builder.display_name} a message to receive a tailored quote for your project.
                    </div>
                  </div>
                </div>
              </section>

              {/* Reviews */}
              <ReviewsSection reviews={reviews} builder={builder} />
            </div>

            {/* RIGHT: Sticky contact sidebar */}
            <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
              <ContactSidebar builder={builder} onShowSoon={requireAuthThenSoon} onContact={contactBuilder} onOrder={orderNow} />
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[150] glass border-t border-white/10 safe-bottom px-4 pt-3 pb-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="flex-shrink-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Rates from</p>
            <p className="text-lg font-extrabold text-[#4ade80] leading-none">
              {builder.starts_from > 0 ? formatPrice(builder.starts_from) : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={orderNow}
            disabled={ordersBlocked}
            title={ordersBlocked ? "This builder isn't taking new orders right now" : undefined}
            className={`flex-1 py-3 rounded-full font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${
              ordersBlocked
                ? "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
                : "bg-[#4ade80] text-black green-glow"
            }`}
          >
            <IconQuote className="w-4 h-4" />
            {ordersBlocked ? "Not taking orders" : "Order Now"}
          </button>
          <button
            type="button"
            onClick={contactBuilder}
            aria-label="Contact builder"
            className="py-3 px-4 rounded-full border border-white/15 bg-white/5 text-gray-200 font-semibold text-sm hover:bg-white/10 hover:border-white/30 transition-all flex items-center gap-1.5 flex-shrink-0"
          >
            <IconChat className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
