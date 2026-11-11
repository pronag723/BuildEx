"use client";

import Link from "next/link";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { publicAsset } from "../utils";

// The castle behind the hero, by night or by day with the theme. Toggling the
// theme plays the change of time of day (all CSS — see "The scene" in
// globals.css). The sun and moon are cut out of the pictures so they can set
// and rise, and the sky mask keeps them behind the forest and the towers.
function HeroScene() {
  const skyMask = `url(${publicAsset("/backgrounds/castle-sky-mask.png")})`;
  return (
    <div className="hero-scene" aria-hidden="true">
      <div className="scene-stage">
        <img className="scene-night" src={publicAsset("/backgrounds/castle-night.webp")} alt="" decoding="async" />
        <div className="scene-glow" />
        <img className="scene-day" src={publicAsset("/backgrounds/castle-day.webp")} alt="" decoding="async" />
        <div className="scene-sky" style={{ maskImage: skyMask, WebkitMaskImage: skyMask }}>
          <div className="scene-orbit scene-orbit-moon">
            <div className="scene-rise">
              <img className="scene-moon" src={publicAsset("/backgrounds/castle-moon.png")} alt="" />
            </div>
          </div>
          <div className="scene-orbit scene-orbit-sun">
            <div className="scene-rise">
              <img className="scene-sun" src={publicAsset("/backgrounds/castle-sun.png")} alt="" />
            </div>
          </div>
        </div>
      </div>
      <div className="scene-shade scene-shade-night" />
      <div className="scene-shade scene-shade-day" />
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
        <div className="hero-actions">
          <Link href="/" className="btn btn-outline btn-lg">
            <Icon name="arrowRight" size={18} strokeWidth={2} />
            {t("about.browseBuilders")}
          </Link>
        </div>
      </div>

      <a href="#how-it-works" className="hero-next" aria-label={t("about.hero.scrollAria")}>
        <Icon name="chevronDown" size={20} strokeWidth={2} />
      </a>
    </section>
  );
}
