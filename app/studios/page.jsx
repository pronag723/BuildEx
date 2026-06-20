"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx Studios — public studio storefront (/studios?s=<slug>).
//
// Like the builder profile route, `output: "export"` can't pre-render arbitrary
// studio slugs, so this single static page reads the slug from the URL on the
// client and fetches the studio + its builders from Supabase (migration 0026).
// Builders render with the exact same BuilderCard the catalog uses.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";

import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import BuilderGrid from "../builders/components/BuilderGrid";
import SiteFooter from "../home/components/SiteFooter";
import { Icon } from "../../lib/icons";
import { fetchStudio, fetchStudioBuilders } from "../../lib/studios/api";

export default function StudioStorefrontPage() {
  // Minimal theme handling, mirroring the builder profile page.
  const [theme, setTheme] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLight = theme === "light";

  const [loading, setLoading] = useState(true);
  const [studio, setStudio] = useState(null);
  const [builders, setBuilders] = useState([]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (theme == null) return;
    const html = document.documentElement;
    html.classList.toggle("light", isLight);
    html.classList.toggle("dark", !isLight);
    localStorage.setItem("theme", isLight ? "light" : "dark");
  }, [theme, isLight]);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("s");
    if (!slug) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { studio: row } = await fetchStudio(slug);
      if (cancelled) return;
      if (!row) {
        setStudio(null);
        setLoading(false);
        return;
      }
      setStudio(row);
      const { builders: list } = await fetchStudioBuilders(row.id);
      if (cancelled) return;
      setBuilders(list);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalProjects = builders.reduce((sum, b) => sum + (b.completed_projects || 0), 0);
  const rated = builders.filter((b) => b.avg_rating > 0);
  const avgRating = rated.length
    ? rated.reduce((sum, b) => sum + b.avg_rating, 0) / rated.length
    : 0;

  return (
    <div className={`builder-profile-root ${isLight ? "light" : ""} catalog-root`}>
      <div className="gradient-background" aria-hidden="true" />
      <div className="gradient-edge-glow" aria-hidden="true" />

      <CatalogNavbar
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={() => {}}
      />
      <CatalogMobileMenu
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onShowSoon={() => {}}
      />

      <main className="relative z-10 pt-24 lg:pt-28 pb-36 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
            </div>
          ) : !studio ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 glass rounded-3xl flex items-center justify-center text-gray-400 mb-6">
                <Icon name="studio" size={32} strokeWidth={1.5} />
              </div>
              <h1 className="text-2xl font-bold mb-2">Studio not found</h1>
              <p className="text-gray-400 text-sm max-w-xs mb-6">
                This studio doesn&apos;t exist or is no longer active.
              </p>
              <Link
                href="/builders"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black transition-all"
              >
                Browse all builders
              </Link>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap mb-6" aria-label="Breadcrumb">
                <Link href="/" className="hover:text-[#4ade80] transition-colors">Home</Link>
                <span className="opacity-50">/</span>
                <Link href="/builders" className="hover:text-[#4ade80] transition-colors">Builders</Link>
                <span className="opacity-50">/</span>
                <span className="truncate max-w-[200px] sm:max-w-xs" aria-current="page">{studio.name}</span>
              </nav>

              {/* Studio header */}
              <header className="glass rounded-3xl p-6 sm:p-8 mb-8">
                <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                  <div className="flex-shrink-0 mx-auto sm:mx-0">
                    {studio.logo_url ? (
                      <img
                        src={studio.logo_url}
                        alt={studio.name}
                        className="w-24 h-24 rounded-3xl object-cover ring-2 ring-emerald-500/30 shadow-xl"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 ring-2 ring-emerald-500/30 flex items-center justify-center text-emerald-300">
                        <Icon name="studio" size={40} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                        Partner Studio
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight mb-2">
                      {studio.name}
                    </h1>
                    {studio.bio && (
                      <p className="text-sm text-gray-400 leading-relaxed max-w-2xl mb-4">
                        {studio.bio}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Icon name="users" size={14} />
                        {builders.length} {builders.length === 1 ? "builder" : "builders"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Icon name="package" size={14} />
                        {totalProjects} completed
                      </span>
                      {avgRating > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Icon name="star" size={14} className="text-amber-400" />
                          <strong className="text-amber-400">{avgRating.toFixed(2)}</strong>
                          avg rating
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              {/* Builders */}
              <h2 className="text-lg font-bold mb-4">Builders from {studio.name}</h2>
              <BuilderGrid builders={builders} animKey={studio.id} />
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
