"use client";

import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../../../lib/icons";

export const PROFILE_TABS = [
  { key: "works", icon: "grid" },
  { key: "prices", icon: "tag" },
  { key: "reviews", icon: "star" },
];

// Works / Prices / Reviews. Sticks under the site header on a phone so the
// tabs stay in reach while scrolling a long grid; on desktop the sidebar does
// that job and the tabs scroll with the page. `trailing` sits at the right end
// of the row on desktop (the owner's works actions).
export default function ProfileTabs({ tab, onChange, worksCount, reviewsCount, trailing = null }) {
  const t = useT();
  const counts = { works: worksCount, reviews: reviewsCount };

  return (
    <div
      role="tablist"
      aria-label={t("profile.tabs.label")}
      className="sticky top-[var(--header-h)] z-30 -mx-4 mt-5 lg:mt-7 grid grid-cols-3 border-b border-line/[0.08] bg-canvas px-4 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex lg:gap-8 lg:bg-transparent lg:px-0"
    >
      {PROFILE_TABS.map(({ key, icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            id={`profile-tab-${key}`}
            aria-selected={active}
            aria-controls={`profile-panel-${key}`}
            onClick={() => onChange(key)}
            className={`-mb-px inline-flex h-11 flex-shrink-0 items-center whitespace-nowrap justify-center gap-1.5 border-b-2 text-[13px] font-semibold transition-colors lg:h-12 lg:justify-start lg:text-sm ${
              active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
            }`}
          >
            <Icon name={icon} size={15} />
            {t(`profile.tabs.${key}`)}
            {counts[key] > 0 && <span className="hidden font-normal text-ink-3 lg:inline">· {counts[key]}</span>}
          </button>
        );
      })}
      {trailing && <div className="ml-auto hidden min-w-0 items-center gap-2 pl-4 text-right lg:flex">{trailing}</div>}
    </div>
  );
}
