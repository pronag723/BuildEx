"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchBuilders } from "../../builders/data/fetchBuilders";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { publicAsset } from "../utils";

// Moves a glass card's glare to the cursor (drawn by .glass-card::after). Only
// a mouse has a hover state, so touch and pen leave the glare where it rests.
function followPointer(event) {
  if (event.pointerType !== "mouse") return;
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  card.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

// The illustrative profile card: what a profile is, with no name, price or
// portfolio image to invent. From `lg` it floats beside the text; below it, on
// a screen tall enough to hold it, it sits still under the centred buttons
// (beside the reach card from `md`).
function ProfileCard({ className = "" }) {
  const t = useT();
  return (
    <div className={`glass-card ${className}`} onPointerMove={followPointer}>
      <div className="flex items-center gap-3">
        <span className="glass-icon text-accent-ink">
          <Icon name="user" size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-ink">{t("about.hero.cardTitle")}</div>
          <div className="mt-0.5 text-xs text-ink-2">{t("about.hero.cardMeta")}</div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">{t("about.hero.cardBody")}</p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="glass-chip glass-chip-sm">{t("about.hero.chipA")}</span>
          <span className="glass-chip glass-chip-sm">{t("about.hero.chipB")}</span>
        </div>
        <span className="glass-chip glass-chip-accent">{t("about.hero.message")}</span>
      </div>
    </div>
  );
}

// The builder's own contact links, the other thing the site hands you.
function ReachCard({ className = "" }) {
  const t = useT();
  return (
    <div className={`glass-card ${className}`} onPointerMove={followPointer}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
        {t("about.hero.reach")}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="glass-chip">
          <Icon name="chat" size={13} /> Discord
        </span>
        <span className="glass-chip">
          <Icon name="send" size={13} /> Telegram
        </span>
        <span className="glass-chip glass-chip-accent">
          <Icon name="chat" size={13} /> {t("about.hero.onBuildEx")}
        </span>
      </div>
    </div>
  );
}

export default function HeroSection() {
  // Real directory figures for the presence badge (and, below `lg`, the line
  // under the buttons). We reuse fetchBuilders (which already applies the
  // visibility rules and sets `online` from last_seen_at) instead of writing a
  // bespoke count query, and render nothing until it resolves so no number is
  // ever invented.
  const t = useT();
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchBuilders().then(({ builders }) => {
      if (!alive) return;
      const list = builders || [];
      if (list.length > 0) {
        setCounts({ listed: list.length, online: list.filter((b) => b.online).length });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const presence =
    counts &&
    (counts.online > 0
      ? t("about.hero.online", { count: counts.online })
      : t("about.hero.listed", { count: counts.listed }));

  return (
    <section id="hero" className="hero on-scene">
      {/* The night scene behind everything: it is what the glass cards blur. */}
      <div className="hero-scene" aria-hidden="true">
        <img src={publicAsset("/backgrounds/night-forest.webp")} alt="" fetchPriority="high" decoding="async" />
      </div>

      <div className="relative z-[1] mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-28 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:px-8">
        {/* Below `lg` the column is centred; from `lg` it sits left of the cards. */}
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
          <h1 className="mx-auto max-w-[16ch] text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[2.75rem] md:text-[3.25rem] lg:mx-0">
            {t("about.hero.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-ink-2 lg:mx-0">
            {t("about.hero.body")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            <Link href="/" className="btn btn-primary btn-lg">
              {t("about.browseBuilders")}
            </Link>
            <a href="#how-it-works" className="btn btn-ghost btn-lg">
              {t("about.hero.howItWorks")}
            </a>
          </div>
          {/* From `lg` the presence badge beside the text carries this. */}
          {counts && (
            <p className="mt-6 text-sm text-ink-3 lg:hidden">
              {t("about.hero.listed", { count: counts.listed })}
              {counts.online > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {t("about.hero.online", { count: counts.online })}
                  </span>
                </>
              )}
            </p>
          )}
          <div
            className="hero-compact-card mx-auto mt-8 grid w-full max-w-sm gap-4 text-left md:max-w-2xl md:grid-cols-2"
            aria-hidden="true"
          >
            <ProfileCard className="p-5" />
            <ReachCard className="hidden p-5 md:block" />
          </div>
        </div>

        {/* Illustrations of the two things the site does: show you a profile,
            and hand you the builder's own contact links. No names, prices or
            portfolio images — there is nothing here to invent. Each card is an
            outer .hero-float (position + float) around an inner .glass-card
            (glass + hover lift), so the two transforms never fight. */}
        <div className="hero-visual">
          <div className="hero-float right-2 top-2 w-[22rem]" aria-hidden="true">
            <ProfileCard className="p-6" />
          </div>

          <div className="hero-float hero-float-2 left-0 top-[10rem] w-[19.5rem]" aria-hidden="true">
            <ReachCard className="p-5" />
          </div>

          {presence && (
            <div className="hero-float hero-float-3 left-[15rem] top-[16.75rem]">
              <div className="glass-card glass-pill flex items-center gap-2.5 py-3 pl-4 pr-5" onPointerMove={followPointer}>
                <span className="hero-online-dot" aria-hidden="true" />
                <span className="whitespace-nowrap text-sm font-medium text-ink">{presence}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hero-float hero-next">
        <a href="#projects" className="glass-card glass-round" aria-label={t("about.hero.scrollAria")}>
          <Icon name="chevronDown" size={20} strokeWidth={2} />
        </a>
      </div>
    </section>
  );
}
