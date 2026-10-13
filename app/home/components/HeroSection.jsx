"use client";

import Link from "next/link";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { publicAsset } from "../utils";

// Floating voxel blocks scattered over the room (from `sm`). Position is a
// share of the hero, size is in vmin, `blur` pushes a block into the distance
// and `dur` staggers the float so they never bob in step.
const BLOCKS = [
  { src: 2, left: "5%", top: "16%", size: 7, rot: -12, dur: 7 },
  { src: 3, left: "27%", top: "9%", size: 4.5, rot: 18, blur: 1, dur: 9 },
  { src: 1, left: "49%", top: "15%", size: 10, rot: 8, dur: 8 },
  { src: 2, left: "64%", top: "7%", size: 5, rot: -20, blur: 1.5, dur: 10 },
  { src: 3, left: "79%", top: "21%", size: 8.5, rot: 14, dur: 7.5 },
  { src: 1, left: "92%", top: "44%", size: 6, rot: -8, dur: 9.5 },
  { src: 2, left: "71%", top: "56%", size: 4.5, rot: 25, blur: 2, dur: 11 },
  { src: 3, left: "37%", top: "70%", size: 6.5, rot: -15, dur: 8.5 },
  { src: 1, left: "18%", top: "88%", size: 5, rot: 10, blur: 1, dur: 10 },
  { src: 2, left: "56%", top: "84%", size: 4, rot: -30, blur: 2, dur: 12 },
  { src: 3, left: "88%", top: "76%", size: 7.5, rot: -5, dur: 8 },
  { src: 1, left: "74%", top: "37%", size: 12, rot: 12, dur: 9 },
  { src: 2, left: "97%", top: "17%", size: 6, rot: -16, dur: 10.5 },
  { src: 3, left: "83%", top: "58%", size: 9, rot: 22, dur: 8.5 },
  { src: 1, left: "63%", top: "33%", size: 5, rot: -24, blur: 1.5, dur: 11.5 },
  { src: 2, left: "67%", top: "73%", size: 6, rot: 6, blur: 1, dur: 9 },
];

// The studio room behind the hero, lit white by day and black by night;
// toggling the theme cross-fades the two (all CSS — see "The studio scene" in
// globals.css). On a phone it is the one portrait picture. From `sm` it is
// built up from pieces so it fills any width: the room's edge cubes, blocks
// floating across the whole hero, and the character (in HeroSection, above
// the headline).
function HeroScene() {
  const pictures = {
    "--hero-night": `url(${publicAsset("/backgrounds/hero-night.webp")})`,
    "--hero-day": `url(${publicAsset("/backgrounds/hero-day.webp")})`,
  };
  return (
    <div className="hero-scene" style={pictures} aria-hidden="true">
      <img className="scene-full scene-night" src={publicAsset("/backgrounds/hero-night.webp")} alt="" decoding="async" />
      <img className="scene-full scene-day" src={publicAsset("/backgrounds/hero-day.webp")} alt="" decoding="async" />
      <div className="scene-edge scene-edge-left" />
      <div className="scene-edge scene-edge-right" />
      <div className="scene-edge scene-edge-stairs" />
      {BLOCKS.map((b, i) => (
        <img
          key={i}
          className="scene-block"
          src={publicAsset(`/backgrounds/hero-block-${b.src}.webp`)}
          alt=""
          decoding="async"
          style={{
            left: b.left,
            top: b.top,
            "--size": b.size,
            "--rot": `${b.rot}deg`,
            "--blur": `${b.blur || 0}px`,
            "--dur": `${b.dur}s`,
            "--delay": `${-i * 1.3}s`,
          }}
        />
      ))}
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

      {/* The character stands in front of the headline (from `sm`). */}
      <div className="hero-figure" aria-hidden="true">
        <img className="scene-night" src={publicAsset("/backgrounds/hero-figure-night.webp")} alt="" decoding="async" />
        <img className="scene-day" src={publicAsset("/backgrounds/hero-figure-day.webp")} alt="" decoding="async" />
      </div>

      <a href="#projects" className="hero-next" aria-label={t("about.hero.scrollAria")}>
        <Icon name="chevronDown" size={20} strokeWidth={2} />
      </a>
    </section>
  );
}
