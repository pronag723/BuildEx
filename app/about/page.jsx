"use client";

import { useEffect, useState } from "react";
import CatalogNavbar from "../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../builders/components/CatalogMobileMenu";
import HeroSection from "../home/components/HeroSection";
import ProjectsSection from "../home/components/ProjectsSection";
import HowItWorksSection from "../home/components/HowItWorksSection";
import WhyBuildExSection from "../home/components/WhyBuildExSection";
import SiteFooter from "../home/components/SiteFooter";
import { useScrollLock } from "../../lib/useScrollLock";

// /about — what BuildEx is, in four plain sections, under the same header as
// the rest of the product. The header's "Showcase" and "How it works" links
// land on the anchors here.
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
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main>
        <HeroSection />
        <ProjectsSection />
        <HowItWorksSection />
        <WhyBuildExSection />
      </main>
      <SiteFooter />
    </div>
  );
}
