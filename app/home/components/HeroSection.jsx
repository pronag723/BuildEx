"use client";

import Link from "next/link";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { publicAsset } from "../utils";

// The studio room behind the hero, lit white by day and black by night;
// toggling the theme cross-fades the two (all CSS — see "The studio scene" in
// globals.css). On a phone it is the one portrait picture. From `sm` it is the
// same picture laid out on a wider wall: its corner pieces (cubes at the top
// left and top right, stairs at the bottom left) cut from it at their natural
// proportions, its floor, and a sharp floating block under the header (two
// more on a very wide wall). The character is cut out too and stands on the
// floor at the right, in front of the copy (in HeroSection), with the
// picture's other two blocks travelling with him.
function HeroScene() {
  const pictures = {
    "--hero-night": `url(${publicAsset("/backgrounds/hero-night.webp")})`,
    "--hero-day": `url(${publicAsset("/backgrounds/hero-day.webp")})`,
  };
  return (
    <div className="hero-scene" style={pictures} aria-hidden="true">
      <img className="scene-full scene-night" src={publicAsset("/backgrounds/hero-night.webp")} alt="" decoding="async" />
      <img className="scene-full scene-day" src={publicAsset("/backgrounds/hero-day.webp")} alt="" decoding="async" />
      <div className="scene-floor" />
      <div className="scene-piece scene-cubes-left" />
      <div className="scene-piece scene-cubes-right" />
      <div className="scene-piece scene-stairs" />
      <SceneBlock src={2} className="scene-block-top" />
      <SceneBlock src={3} className="scene-block-far" />
      <SceneBlock src={1} className="scene-block-farther" />
    </div>
  );
}

// A floating block from the picture, bobbing gently (from `sm`).
function SceneBlock({ src, className }) {
  return (
    <img
      className={`scene-block ${className}`}
      src={publicAsset(`/backgrounds/hero-block-${src}.webp`)}
      alt=""
      decoding="async"
    />
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

      {/* The character stands on the floor at the right (from `sm`), in front
          of the copy, with two of the picture's blocks around him. */}
      <div className="hero-figure" aria-hidden="true">
        <img className="scene-night" src={publicAsset("/backgrounds/hero-figure-night.webp")} alt="" decoding="async" />
        <img className="scene-day" src={publicAsset("/backgrounds/hero-figure-day.webp")} alt="" decoding="async" />
        <SceneBlock src={1} className="scene-block-head" />
        <SceneBlock src={3} className="scene-block-side" />
      </div>

      <a href="#projects" className="hero-next" aria-label={t("about.hero.scrollAria")}>
        <Icon name="chevronDown" size={20} strokeWidth={2} />
      </a>
    </section>
  );
}
