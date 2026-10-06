"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, catalogNavItemsFor } from "./navItems";
import { AuthMobileControls } from "../../auth/components/AuthNavControls";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useUnread } from "../../../lib/chat/UnreadContext";
import { useT } from "../../../lib/i18n/LanguageProvider";

// The navigation below `lg`: a floating frosted-glass panel that drops from
// under the header (which stays visible, with its menu button turned into a
// close button). The page behind it is dimmed and blurred.
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={close} />
      <div className="mobile-menu-panel glass-panel relative mx-3 mt-2 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl p-2.5">
        <nav aria-label={t("common.mainNav")} className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.path);
            return (
              <Link
                key={item.key}
                href={item.path}
                onClick={close}
                tabIndex={mobileMenuOpen ? 0 : -1}
                aria-current={active ? "page" : undefined}
                className="glass-row justify-between"
              >
                <span className="flex items-center gap-2.5">
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
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
          <div className="mt-2 flex flex-col gap-0.5 border-t border-line/10 pt-2">
            <AuthMobileControls onAfter={close} />
          </div>
        )}
      </div>
    </div>
  );
}
