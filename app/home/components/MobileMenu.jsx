"use client";

import { withBase } from "../utils";

export default function MobileMenu({
  navItems,
  activeSection,
  mobileMenuOpen,
  setMobileMenuOpen,
  onAnchorClick,
  onShowSoon
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
          <button
            type="button"
            onClick={() => onShowSoon("Login flow coming soon")}
            className="w-full py-3.5 text-base font-medium rounded-2xl border border-white/20 hover:border-white/40 transition-all ghost-btn"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => onShowSoon("Sign up flow coming soon")}
            className="w-full py-3.5 text-base font-semibold rounded-2xl bg-[#4ade80] text-black transition-all green-glow"
          >
            Join as Builder
          </button>
        </div>
      </div>
    </div>
  );
}
