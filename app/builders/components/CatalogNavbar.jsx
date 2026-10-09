"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, catalogNavItemsFor } from "./navItems";
import { useActiveAboutSection } from "./useActiveAboutSection";
import AuthNavControls from "../../auth/components/AuthNavControls";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useUnread } from "../../../lib/chat/UnreadContext";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import LanguageSwitcher from "../../../lib/i18n/LanguageSwitcher";
import SiteHeader from "../../components/SiteHeader";
import ThemeToggle from "../../components/ThemeToggle";

// The product header: feed, profiles, messages, account, about. The theme is
// owned by ThemeToggle now, so pages no longer thread theme state through here.
// `overScene` is passed through to SiteHeader (see there).
export default function CatalogNavbar({ mobileMenuOpen, setMobileMenuOpen, overScene = null }) {
  const pathname = usePathname();
  const aboutSection = useActiveAboutSection();
  const { status } = useAuth();
  const { hasUnread } = useUnread();
  const navItems = catalogNavItemsFor(status === "authenticated");
  const t = useT();

  const nav = navItems.map((item) => (
    <Link
      key={item.key}
      href={item.path}
      className="nav-link"
      aria-current={isNavActive(pathname, item.path, aboutSection) ? "page" : undefined}
    >
      {t(`nav.${item.key}`)}
      {item.path === "/chats" && hasUnread && (
        <span
          className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500"
          aria-label={t("common.unreadMessages")}
        />
      )}
    </Link>
  ));

  const actions = (
    <>
      <LanguageSwitcher />
      <ThemeToggle />
      <AuthNavControls />
      <button
        type="button"
        className="lg:hidden btn btn-ghost btn-icon"
        aria-label={mobileMenuOpen ? t("common.closeMenu") : t("common.openMenu")}
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-menu"
        onClick={() => setMobileMenuOpen((v) => !v)}
      >
        <Icon name={mobileMenuOpen ? "close" : "menu"} size={19} />
      </button>
    </>
  );

  return <SiteHeader nav={nav} actions={actions} overScene={overScene} />;
}
