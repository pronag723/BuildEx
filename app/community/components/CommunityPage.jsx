"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Community (/community, stage 4)
//
// One header item, sections down the left like channels in Discord. A section
// is shown only once it has something to show (stage-0 proposal П7): today
// that is the Showcase (every public work) and "Looking for a builder" (public
// briefs); "Saved" appears for signed-in people, and the updates channel and
// the rules are plain links. Sections live in ?s= because the site is a static
// export.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import { withBase } from "../../home/utils";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import ShowcaseSection from "./ShowcaseSection";
import RequestsSection from "./RequestsSection";

// Labels: `community.sections.<key>`.
const SECTIONS = [
  { key: "showcase", icon: "grid" },
  { key: "requests", icon: "briefcase" },
];
const MY_SECTIONS = [{ key: "saved", icon: "bookmark", auth: true }];

function readSection() {
  if (typeof window === "undefined") return "showcase";
  const s = new URLSearchParams(window.location.search).get("s");
  return [...SECTIONS, ...MY_SECTIONS].some((x) => x.key === s) ? s : "showcase";
}

export default function CommunityPage() {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useScrollLock(mobileMenuOpen);
  const [section, setSection] = useState("showcase");

  useEffect(() => {
    setSection(readSection());
    const onPop = () => setSection(readSection());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((key) => {
    setSection(key);
    const url = key === "showcase" ? "/community" : `/community?s=${key}`;
    window.history.pushState(window.history.state, "", withBase(url));
    window.scrollTo({ top: 0 });
  }, []);

  const mine = MY_SECTIONS.filter((s) => !s.auth || signedIn);
  const item = (s) => (
    <button
      key={s.key}
      type="button"
      onClick={() => go(s.key)}
      aria-current={section === s.key ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
        section === s.key ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-line/[0.06] hover:text-ink"
      }`}
    >
      <Icon name={s.icon} size={16} className={section === s.key ? "text-ink" : "text-ink-3"} />
      {t(`community.sections.${s.key}`)}
    </button>
  );

  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* Sections — desktop */}
        <aside className="sticky top-[calc(var(--header-h)+1.5rem)] hidden h-fit w-56 flex-shrink-0 lg:block">
          <nav aria-label={t("community.navAria")} className="space-y-0.5">
            {SECTIONS.map(item)}
            {mine.length > 0 && (
              <>
                <p className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  {t("community.mine")}
                </p>
                {mine.map(item)}
              </>
            )}
            <div className="my-3 h-px bg-line/[0.06]" />
            {signedIn && (
              <Link
                href="/chats?c=updates"
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 transition-colors hover:bg-line/[0.06] hover:text-ink"
              >
                <Icon name="verified" size={16} className="text-ink-3" />
                {t("community.updates")}
              </Link>
            )}
            <Link
              href="/legal/community"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 transition-colors hover:bg-line/[0.06] hover:text-ink"
            >
              <Icon name="shield" size={16} className="text-ink-3" />
              {t("community.rules")}
            </Link>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Sections — phone */}
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            {[...SECTIONS, ...mine].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => go(s.key)}
                aria-pressed={section === s.key}
                className={`tag-toggle ${section === s.key ? "border-accent/60 bg-raised text-ink" : ""}`}
              >
                {t(`community.sections.${s.key}`)}
              </button>
            ))}
          </div>

          {section === "showcase" && <ShowcaseSection key="showcase" mode="all" />}
          {section === "saved" && <ShowcaseSection key="saved" mode="saved" />}
          {section === "requests" && <RequestsSection />}
        </main>
      </div>
    </div>
  );
}
