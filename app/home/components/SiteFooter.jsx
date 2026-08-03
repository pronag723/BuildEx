"use client";

import { withBase } from "../utils";
import { usePathname } from "next/navigation";

export default function SiteFooter() {
  const pathname = usePathname();
  const legalCenterHref = pathname.startsWith("/legal")
    ? withBase("/legal/")
    : `${withBase("/legal/")}?from=${encodeURIComponent(pathname)}`;

  return (
    <footer className="site-footer site-footer-enter border-t border-white/10 bg-black/70 py-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 overflow-x-auto px-6 text-sm text-gray-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 whitespace-nowrap">© 2026 BuildEx — The Freelance Marketplace for Minecraft Builders</span>
        <nav aria-label="Legal" className="flex shrink-0 items-center gap-5 whitespace-nowrap">
          <a href={legalCenterHref} className="hover:text-white">Legal Center</a>
          <a href={withBase("/legal/terms/")} className="hover:text-white">Terms</a>
          <a href={withBase("/legal/payments/")} className="hover:text-white">Payments &amp; disputes</a>
          <a href={withBase("/legal/privacy/")} className="hover:text-white">Privacy</a>
          <a href={withBase("/legal/community/")} className="hover:text-white">Community &amp; copyright</a>
        </nav>
      </div>
    </footer>
  );
}
