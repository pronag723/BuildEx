"use client";

import { useEffect, useState } from "react";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import HeroSection from "../home/components/HeroSection";
import HowItWorksSection from "../home/components/HowItWorksSection";
import WhyBuildExSection from "../home/components/WhyBuildExSection";
import SiteFooter from "../home/components/SiteFooter";
import { useScrollLock } from "../../lib/useScrollLock";

// /about — what BuildEx is, in three plain sections, under the same header as
// the rest of the product. The header's "How it works" link lands on its anchor here.
export default function AboutPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useScrollLock(mobileMenuOpen);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    function onResize() {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="catalog-root">
      {/* The hero runs up under the header, which is see-through over it. */}
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} overScene="hero" />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main>
        <HeroSection />
        <HowItWorksSection />
        <WhyBuildExSection />
      </main>
      <SiteFooter />
    </div>
  );
}
