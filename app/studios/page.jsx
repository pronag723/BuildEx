"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  fetchStudio,
  fetchStudioReviews,
  getOrCreateStudioConversation,
} from "../../lib/studios/api";
import { formatPrice } from "../../lib/pricing";
import { Icon } from "../../lib/icons";
import { useGradientBackground } from "../../lib/ui/useGradientBackground";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import SiteFooter from "../home/components/SiteFooter";

function IconChat({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconQuote({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="14" x2="15" y2="14" />
      <line x1="9" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function IconChevron({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 7l3 3-3 3" />
    </svg>
  );
}

function PortfolioCarousel({ items }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef(null);
  const count = items.length;

  function go(direction) {
    setIndex((current) => (current + direction + count) % count);
  }

  function finishSwipe(clientX) {
    if (touchStart.current == null) return;
    const distance = clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) >= 45) go(distance < 0 ? 1 : -1);
  }

  return (
    <div
      className="group/media relative rounded-3xl overflow-hidden glass touch-pan-y"
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}
    >
      <div
        className="flex transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {items.map((item) => (
          <div key={item.id} className="relative w-full flex-shrink-0 aspect-[16/9] overflow-hidden">
            <img
              src={item.thumbnail}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />
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
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Go to build ${itemIndex + 1}`}
                onClick={() => setIndex(itemIndex)}
                className={`h-2 rounded-full transition-all duration-200 ${
                  itemIndex === index ? "w-6 bg-[#4ade80]" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StudioSidebar({ studio, canOrder, onOrder, onContact }) {
  return (
    <aside className="glass rounded-3xl p-6 builder-sidebar-sticky space-y-5">
      <div className="flex items-center gap-3">
        {studio.avatar ? (
          <img src={studio.avatar} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-[#4ade80]/30" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-[#4ade80]/10 border border-[#4ade80]/30 flex items-center justify-center text-xl font-bold text-[#4ade80]">
            {studio.display_name[0]}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-bold text-base leading-tight truncate">{studio.display_name}</p>
          <p className="text-xs text-gray-500 mt-1">@{studio.username}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-3 text-center">
          <p className="text-xl font-extrabold">{studio.avg_rating.toFixed(2)}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Rating</p>
        </div>
        <div className="glass rounded-2xl p-3 text-center">
          <p className="text-xl font-extrabold">{studio.completed_orders}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Projects</p>
        </div>
      </div>

      <div className="py-4 border-y border-white/[0.08]">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Rates from</p>
        <p className="text-2xl font-extrabold text-[#4ade80] leading-none">
          {studio.starts_from > 0 ? formatPrice(studio.starts_from) : "—"}
        </p>
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
          Choose a project scale and share the complete brief at checkout.
        </p>
      </div>

      <button
        type="button"
        onClick={onOrder}
        disabled={!canOrder}
        className={`w-full py-4 rounded-full font-bold text-base transition-all flex items-center justify-center gap-2 ${
          canOrder
            ? "bg-[#4ade80] text-black green-glow hover:bg-[#22c55e]"
            : "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
        }`}
      >
        <IconQuote className="w-4 h-4" />
        {canOrder ? "Order Now" : "Not taking orders"}
      </button>

      <button
        type="button"
        onClick={onContact}
        className="w-full py-3.5 rounded-full border border-white/15 bg-white/5 text-gray-200 font-semibold text-base hover:bg-white/10 hover:border-white/30 transition-all flex items-center justify-center gap-2"
      >
        <IconChat className="w-4 h-4" />
        Contact Studio
      </button>

      {!canOrder && (
        <p className="-mt-2 text-center text-[11px] text-gray-500 leading-relaxed">
          This studio is not accepting new orders right now. You can still contact the team about future work.
        </p>
      )}
    </aside>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StudioPageInner />
    </Suspense>
  );
}

function StudioPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, profile } = useAuth();
  const slug = params.get("s") || "";
  const [studio, setStudio] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { gradientRef, edgeGlowRef } = useGradientBackground();
  const isLight = theme === "light";

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchStudio(slug).then(async (result) => {
      if (!active) return;
      if (result.error || !result.studio) {
        setError(result.error?.message || "This studio does not exist or is not public.");
        setStudio(null);
        setLoading(false);
        return;
      }
      setStudio(result.studio);
      const reviewResult = await fetchStudioReviews(result.studio.id);
      if (active) {
        setReviews(reviewResult.reviews || []);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [slug]);

  async function messageStudio() {
    if (status !== "authenticated") {
      router.push(`/login?redirect=${encodeURIComponent(`/studios?s=${slug}`)}`);
      return;
    }
    const result = await getOrCreateStudioConversation(studio.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.push(`/chats?c=${encodeURIComponent(result.conversationId)}`);
  }

  function orderNow() {
    if (profile?.role === "studio" || !studio.has_capacity) return;
    const target = `/order?s=${encodeURIComponent(studio.username)}`;
    if (status !== "authenticated") {
      router.push(`/login?redirect=${encodeURIComponent(target)}`);
      return;
    }
    router.push(target);
  }

  const canOrder = Boolean(studio?.has_capacity && profile?.role !== "studio");

  return (
    <div className={`builder-profile-root ${isLight ? "light" : ""} catalog-root min-h-screen flex flex-col`}>
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

      <main className="relative z-10 flex-1 px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <Loading />
          ) : !studio ? (
            <div className="glass rounded-3xl p-10 text-center text-gray-400">{error}</div>
          ) : (
            <>
              {error && <div className="auth-banner auth-banner-error mb-6">{error}</div>}

              <header className="glass rounded-3xl p-6 sm:p-8 mb-8 detail-fade-up">
                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                  {studio.avatar ? (
                    <img src={studio.avatar} alt="" className="w-24 h-24 rounded-2xl object-cover ring-2 ring-[#4ade80]/30" />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-[#4ade80]/10 border border-[#4ade80]/30 flex items-center justify-center text-3xl font-bold text-[#4ade80]">
                      {studio.display_name[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-2xl sm:text-3xl font-extrabold">{studio.display_name}</h1>
                      <span className="px-2.5 py-1 rounded-full text-xs bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80]">
                        Studio
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">@{studio.username}</p>
                    <p className="text-sm text-gray-400 mt-3">
                      {studio.avg_rating.toFixed(2)} rating · {studio.reviews_count} reviews · {studio.completed_orders} completed
                    </p>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-8 items-start">
                <div className="space-y-8 min-w-0">
                  <section className="reveal">
                    <div className="flex items-end justify-between mb-5">
                      <h2 className="font-bold text-xl">Portfolio</h2>
                      <span className="text-xs text-gray-500">
                        {studio.portfolio.length} {studio.portfolio.length === 1 ? "build" : "builds"}
                      </span>
                    </div>
                    {studio.portfolio.length === 0 ? (
                      <div className="glass rounded-3xl p-12 text-center text-gray-500 text-sm">
                        This studio hasn&apos;t added portfolio entries yet.
                      </div>
                    ) : (
                      <PortfolioCarousel items={studio.portfolio} />
                    )}
                  </section>

                  <section className="reveal glass rounded-3xl p-6 lg:p-8">
                    <div className="mb-5">
                      <h2 className="font-bold text-xl">Rates &amp; Project Scale</h2>
                      <p className="text-xs text-gray-500 mt-1">
                        Exact studio prices for each available build scale.
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {studio.rate_tiers.filter((tier) => tier.enabled).map((tier) => (
                        <div key={tier.id} className="glass rounded-2xl p-5 flex flex-col gap-2 transition-all duration-300 hover:border-[#4ade80]/40 hover:shadow-[0_0_24px_rgba(74,222,128,0.12)]">
                          <div className="flex items-center gap-2.5 mb-1">
                            <span className="icon-tile icon-tile-sm text-[#4ade80] flex-shrink-0">
                              <Icon name={tier.icon} size={18} />
                            </span>
                            <h3 className="font-bold text-base truncate">{tier.label}</h3>
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            {tier.blocks > 0 ? `Up to ${tier.blocks}×${tier.blocks} blocks` : "Quote on request"}
                          </p>
                          <div className="mt-2 pt-3 border-t border-white/[0.06]">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Price</p>
                            <p className="text-[#4ade80] font-extrabold text-xl leading-tight">
                              {tier.price > 0 ? formatPrice(tier.price) : "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="reveal glass rounded-3xl p-6 lg:p-8">
                    <h2 className="font-bold text-xl mb-5">Reviews</h2>
                    <div className="space-y-5">
                      {reviews.length === 0 && <p className="text-sm text-gray-500">No reviews yet.</p>}
                      {reviews.map((review) => (
                        <article key={review.id} className="flex gap-3">
                          <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
                            {(review.reviewer?.display_name || "B")[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{review.reviewer?.display_name || "Buyer"}</p>
                              <p className="text-amber-400 text-xs">{"★".repeat(review.rating)}</p>
                              <span className="text-xs text-gray-500 ml-auto">
                                {new Date(review.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-400 mt-1.5 whitespace-pre-wrap">{review.body}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>

                <StudioSidebar
                  studio={studio}
                  canOrder={canOrder}
                  onOrder={orderNow}
                  onContact={messageStudio}
                />
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Loading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
    </div>
  );
}
