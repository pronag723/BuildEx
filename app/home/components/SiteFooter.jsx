"use client";

import { withBase } from "../utils";

export default function SiteFooter() {
  return (
    <footer className="site-footer site-footer-enter border-t border-white/10 py-8 bg-black/70">
      <div className="max-w-7xl mx-auto px-6 text-center text-gray-400 text-sm">
        <nav aria-label="Legal" className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
          <a href={withBase("/legal/")} className="hover:text-white">Legal Center</a>
          <a href={withBase("/legal/terms/")} className="hover:text-white">Terms</a>
          <a href={withBase("/legal/payments/")} className="hover:text-white">Payments &amp; disputes</a>
          <a href={withBase("/legal/privacy/")} className="hover:text-white">Privacy</a>
          <a href={withBase("/legal/community/")} className="hover:text-white">Community &amp; copyright</a>
        </nav>
        © 2026 BuildEx — The Freelance Marketplace for Minecraft Builders
      </div>
    </footer>
  );
}
