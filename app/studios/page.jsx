"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  fetchStudio,
  fetchStudioReviews,
  getOrCreateStudioConversation,
} from "../../lib/studios/api";
import { formatPrice } from "../../lib/pricing";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import SiteFooter from "../home/components/SiteFooter";

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
  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);
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

      <main className="relative z-10 flex-1 px-4 pt-28 pb-20">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <Loading />
          ) : !studio ? (
            <div className="glass rounded-3xl p-10 text-center text-gray-400">{error}</div>
          ) : (
            <>
              <section className="glass rounded-3xl p-6 sm:p-8">
                <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
                  <div className="flex items-center gap-4 flex-1">
                    {studio.avatar ? (
                      <img src={studio.avatar} alt="" className="w-20 h-20 rounded-2xl object-cover ring-2 ring-[#4ade80]/30" />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-[#4ade80]/10 border border-[#4ade80]/30 flex items-center justify-center text-2xl font-bold text-[#4ade80]">
                        {studio.display_name[0]}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h1 className="text-2xl sm:text-3xl font-extrabold">{studio.display_name}</h1>
                        <span className="px-2.5 py-1 rounded-full text-xs bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80]">Studio</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">@{studio.username}</p>
                      <p className="text-sm text-gray-400 mt-2">
                        ★ {studio.avg_rating.toFixed(2)} · {studio.reviews_count} reviews · {studio.completed_orders} completed
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={messageStudio} className="px-5 py-2.5 rounded-full border border-white/15 text-sm font-semibold hover:border-[#4ade80]/40">
                      Message studio
                    </button>
                    {studio.has_capacity && profile?.role !== "studio" ? (
                      <Link href={`/order?s=${encodeURIComponent(studio.username)}`} className="px-6 py-2.5 rounded-full bg-[#4ade80] text-black text-sm font-bold green-glow">
                        Pay &amp; order
                      </Link>
                    ) : (
                      <button disabled className="px-6 py-2.5 rounded-full bg-white/10 text-gray-500 text-sm font-bold cursor-not-allowed">
                        {profile?.role === "studio" ? "Studio accounts cannot order" : "No builders available"}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <div className="grid lg:grid-cols-[1fr_320px] gap-6 mt-6">
                <div className="space-y-6">
                  <section className="glass rounded-3xl p-6">
                    <h2 className="font-bold text-lg mb-4">Studio portfolio</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {studio.portfolio.map((image) => (
                        <div key={image.id} className="rounded-2xl overflow-hidden bg-black/30 aspect-video">
                          <img src={image.thumbnail} alt={image.title} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="glass rounded-3xl p-6">
                    <h2 className="font-bold text-lg mb-4">Reviews</h2>
                    <div className="space-y-3">
                      {reviews.length === 0 && <p className="text-sm text-gray-500">No reviews yet.</p>}
                      {reviews.map((review) => (
                        <article key={review.id} className="rounded-2xl border border-white/10 p-4">
                          <div className="flex justify-between gap-3">
                            <p className="font-semibold text-sm">{review.reviewer?.display_name || "Buyer"}</p>
                            <p className="text-amber-400 text-sm">{"★".repeat(review.rating)}</p>
                          </div>
                          <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">{review.body}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
                <aside className="glass rounded-3xl p-5 h-fit lg:sticky lg:top-28">
                  <h2 className="font-bold mb-4">Studio prices</h2>
                  <div className="space-y-3">
                    {studio.rate_tiers.filter((tier) => tier.enabled).map((tier) => (
                      <div key={tier.id} className="flex justify-between gap-3 py-2 border-b border-white/[0.07]">
                        <span className="text-sm text-gray-400">{tier.label}</span>
                        <span className="font-semibold text-[#4ade80]">{formatPrice(tier.price)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    Studios accept every building style. Choose the style and provide the full brief during checkout.
                  </p>
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

function Loading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
    </div>
  );
}
