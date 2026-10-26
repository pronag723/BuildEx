"use client";

import { useEffect, useRef, useState } from "react";
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
//
// The row is see-through like on desktop, so a header background runs behind
// it; it only takes the page colour once it is stuck under the site header,
// where works scroll beneath it.
export default function ProfileTabs({ tab, onChange, worksCount, reviewsCount, trailing = null }) {
  const t = useT();
  const counts = { works: worksCount, reviews: reviewsCount };
  const ref = useRef(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    let frame = 0;
    const check = () => {
      frame = 0;
      if (getComputedStyle(node).position !== "sticky") {
        setStuck(false);
        return;
      }
      const top = parseFloat(getComputedStyle(node).top) || 0;
      setStuck(node.getBoundingClientRect().top <= top + 0.5);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={t("profile.tabs.label")}
      className={`sticky top-[var(--header-h)] z-30 -mx-4 mt-5 lg:mt-7 grid grid-cols-3 border-b border-line/[0.08] px-4 transition-colors duration-200 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex lg:gap-8 lg:px-0 ${
        stuck ? "bg-canvas/90 backdrop-blur-md" : "bg-transparent"
      }`}
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
