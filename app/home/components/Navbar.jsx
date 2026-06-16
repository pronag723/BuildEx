"use client";

import { withBase } from "../utils";
import AuthNavControls from "../../auth/components/AuthNavControls";
import { Icon } from "../../../lib/icons";
import BxLogo from "./BxLogo";

export default function Navbar({
  navItems,
  activeSection,
  mobileMenuOpen,
  setMobileMenuOpen,
  isLight,
  setTheme,
  onAnchorClick
}) {
  return (
    <nav className="fixed top-3.5 left-1/2 -translate-x-1/2 z-50 w-full nav-wrapper px-6">
      <div className="glass nav-pill flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3 flex-shrink-0">
          <a
            href="#hero"
            className="flex items-center gap-1.5 no-underline"
            onClick={(event) => onAnchorClick(event, "#hero")}
          >
            <BxLogo className="w-11 h-11 flex-shrink-0" />
            <span className="text-2xl font-bold tracking-tight logo-font nav-logo-text">
              Build
              <span className="text-[#4ade80] font-extrabold">Ex</span>
            </span>
          </a>
        </div>

        <div className="hidden lg:flex items-center nav-links-gap nav-text font-medium">
          {navItems.map((item) => (
            <a
              key={`${item.label}-desktop`}
              href={item.href.startsWith("/") ? withBase(item.href) : item.href}
              className={`nav-link hover:text-[#4ade80] transition-colors whitespace-nowrap ${
                activeSection === item.href.slice(1) ? "active" : ""
              }`}
              onClick={(event) => onAnchorClick(event, item.href)}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="flex items-center nav-controls-gap flex-shrink-0">
          <button
            id="theme-toggle"
            type="button"
            className="theme-switch relative w-14 h-7 flex items-center rounded-full transition-all duration-300 bg-white/10 border border-white/20 hover:border-white/40 flex-shrink-0"
            aria-label="Toggle color theme"
            onClick={() =>
              setTheme((currentTheme) =>
                currentTheme === "light" ? "dark" : "light"
              )
            }
          >
            <span className="theme-switch-thumb absolute left-1 w-5 h-5 rounded-full bg-[#0f172a] shadow-lg transition-all duration-300 flex items-center justify-center">
              <Icon name={isLight ? "sun" : "moon"} size={12} strokeWidth={2} />
            </span>
          </button>

          <AuthNavControls />

          <button
            id="burger-btn"
            type="button"
            className={`lg:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition-all ${
              mobileMenuOpen ? "active" : ""
            }`}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileMenuOpen((isOpen) => !isOpen)}
          >
            <span className="burger-line w-5 h-0.5 bg-current rounded-full transition-all duration-300" />
            <span className="burger-line w-5 h-0.5 bg-current rounded-full transition-all duration-300" />
            <span className="burger-line w-5 h-0.5 bg-current rounded-full transition-all duration-300" />
          </button>
        </div>
      </div>
    </nav>
  );
}
