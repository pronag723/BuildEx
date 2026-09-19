"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { withBase } from "../../home/utils";
import { isNavActive, catalogNavItems } from "./navItems";
import { AuthMobileControls } from "../../auth/components/AuthNavControls";

export default function CatalogMobileMenu({
  mobileMenuOpen,
  setMobileMenuOpen,
  onShowSoon,
}) {
  const pathname = usePathname();

  return (
    <div
      id="mobile-menu"
      className={`mobile-menu fixed inset-0 z-[70] flex flex-col pt-24 px-6 pb-8 lg:hidden ${
        mobileMenuOpen ? "open" : ""
      }`}
      aria-hidden={!mobileMenuOpen}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setMobileMenuOpen(false)}
      />
      <div className="relative glass rounded-3xl p-8 flex flex-col gap-2 mobile-menu-panel">
        {catalogNavItems.map((item) => (
          <Link
            key={item.label}
            href={item.path}
            className={`mobile-nav-link nav-link ${isNavActive(pathname, item.path) ? "active" : ""}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            {item.label}
          </Link>
        ))}

        <div className="border-t border-white/10 mt-4 pt-6 flex flex-col gap-3">
          <AuthMobileControls onAfter={() => setMobileMenuOpen(false)} />
        </div>
      </div>
    </div>
  );
}
