"use client";

import { withBase } from "../../home/utils";
import { useThemedBackground } from "./useThemedBackground";
import { Icon } from "../../../lib/icons";
import BxLogo from "../../home/components/BxLogo";

export default function AuthShell({ children }) {
  const { gradientRef, edgeGlowRef, isLight, setTheme } = useThemedBackground();

  return (
    <div className="min-h-screen relative">
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

      <header className="fixed top-3.5 left-1/2 -translate-x-1/2 z-50 w-full nav-wrapper px-6">
        <div className="glass nav-pill flex items-center justify-between shadow-2xl">
          <a href={withBase("/")} className="flex items-center gap-1.5 no-underline">
            <BxLogo className="w-11 h-11 flex-shrink-0" />
            <span className="text-2xl font-bold tracking-tight logo-font nav-logo-text">
              Build<span className="text-[#4ade80] font-extrabold">Ex</span>
            </span>
          </a>

          <div className="flex items-center nav-controls-gap flex-shrink-0">
            <button
              type="button"
              className="theme-switch relative w-14 h-7 flex items-center rounded-full transition-all duration-300 bg-white/10 border border-white/20 hover:border-white/40 flex-shrink-0"
              aria-label="Toggle color theme"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            >
              <span className="theme-switch-thumb absolute left-1 w-5 h-5 rounded-full bg-[#0f172a] shadow-lg transition-all duration-300 flex items-center justify-center">
                <Icon name={isLight ? "sun" : "moon"} size={12} strokeWidth={2} />
              </span>
            </button>

            <a
              href={withBase("/")}
              className="nav-btn-ghost nav-btn-text font-medium rounded-full border border-white/20 hover:border-white/40 transition-all ghost-btn whitespace-nowrap hidden sm:inline-block"
            >
              ← Back to site
            </a>
          </div>
        </div>
      </header>

      <main className="min-h-screen flex items-center justify-center px-6 pt-32 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
