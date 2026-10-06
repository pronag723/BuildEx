"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, catalogNavItemsFor } from "./navItems";
import { AuthMobileControls } from "../../auth/components/AuthNavControls";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useUnread } from "../../../lib/chat/UnreadContext";
import { useT } from "../../../lib/i18n/LanguageProvider";

// The navigation below `lg`: a sheet that drops from under the header (which
// stays visible, with its menu button turned into a close button) and lists
// the same links as rows, then the account controls.
export default function CatalogMobileMenu({ mobileMenuOpen, setMobileMenuOpen }) {
  const pathname = usePathname();
  const { status } = useAuth();
  const { hasUnread } = useUnread();
  const navItems = catalogNavItemsFor(status === "authenticated");
  const t = useT();
  const close = () => setMobileMenuOpen(false);

  return (
    <div
      id="mobile-menu"
      className={`mobile-menu fixed inset-x-0 bottom-0 top-[var(--header-h)] z-[70] lg:hidden ${
        mobileMenuOpen ? "open" : ""
      }`}
      aria-hidden={!mobileMenuOpen}
    >
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="mobile-menu-panel relative max-h-full overflow-y-auto border-b border-line/10 bg-surface px-4 pb-5 pt-2 shadow-pop">
        <nav aria-label={t("common.mainNav")} className="flex flex-col">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.path);
            return (
              <Link
                key={item.key}
                href={item.path}
                onClick={close}
                tabIndex={mobileMenuOpen ? 0 : -1}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 items-center justify-between border-b border-line/[0.06] text-[15px] font-medium transition-colors ${
                  active ? "text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                <span className="flex items-center gap-2">
                  {active && <span className="h-4 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                  {t(`nav.${item.key}`)}
                </span>
                {item.path === "/chats" && hasUnread && (
                  <span className="h-2 w-2 rounded-full bg-red-500" aria-label={t("common.unreadMessages")} />
                )}
              </Link>
            );
          })}
        </nav>

        {status === "authenticated" && (
          <div className="mt-4 flex flex-col gap-2">
            <AuthMobileControls onAfter={close} />
          </div>
        )}
      </div>
    </div>
  );
}
