"use client";

import { withBase } from "../utils";
import { AuthMobileControls } from "../../auth/components/AuthNavControls";

export default function MobileMenu({
  navItems,
  activeSection,
  mobileMenuOpen,
  setMobileMenuOpen,
  onAnchorClick
}) {
  return (
    <div
      id="mobile-menu"
      className={`mobile-menu fixed inset-0 z-40 flex flex-col pt-24 px-6 pb-8 lg:hidden ${
        mobileMenuOpen ? "open" : ""
      }`}
      aria-hidden={!mobileMenuOpen}
    >
      <div
        id="mobile-menu-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setMobileMenuOpen(false)}
      />
      <div className="relative glass rounded-3xl p-8 flex flex-col gap-2 mobile-menu-panel">
        {navItems.map((item) => (
          <a
            key={`${item.label}-mobile`}
            href={item.href.startsWith("/") ? withBase(item.href) : item.href}
            className={`mobile-nav-link nav-link ${
              activeSection === item.href.slice(1) ? "active" : ""
            }`}
            onClick={(event) => onAnchorClick(event, item.href)}
          >
            {item.label}
          </a>
        ))}
        <div className="border-t border-white/10 mt-4 pt-6 flex flex-col gap-3">
          <AuthMobileControls onAfter={() => setMobileMenuOpen(false)} />
        </div>
      </div>
    </div>
  );
}
