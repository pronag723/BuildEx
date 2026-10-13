"use client";

import Link from "next/link";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { publicAsset } from "../utils";

// The studio room behind the hero: the same voxel scene lit white by day and
// black by night. Toggling the theme cross-fades the two pictures (all CSS —
// see "The studio scene" in globals.css).
function HeroScene() {
  return (
    <div className="hero-scene" aria-hidden="true">
      <img className="scene-night" src={publicAsset("/backgrounds/hero-night.webp")} alt="" decoding="async" />
      <img className="scene-day" src={publicAsset("/backgrounds/hero-day.webp")} alt="" decoding="async" />
    </div>
  );
}

export default function HeroSection() {
  const t = useT();

  return (
    <section id="hero" className="hero on-scene">
      <HeroScene />
      <div className="hero-copy relative z-[1] mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="hero-title">
          <span>{t("about.hero.titleLine1")}</span>
          <span>{t("about.hero.titleLine2")}</span>
          <span className="accent-word">{t("about.hero.titleAccent")}</span>
        </h1>
        <div className="mt-8 flex flex-col items-start gap-6 sm:mt-10">
          <Link href="/" className="btn btn-outline btn-lg">
            <Icon name="arrowRight" size={18} strokeWidth={2} />
            {t("about.browseBuilders")}
          </Link>
          <a href="#how-it-works" className="hero-link">
            {t("about.hero.howItWorks")}
            <Icon name="arrowRight" size={16} strokeWidth={2} />
          </a>
        </div>
      </div>
    </section>
  );
}
