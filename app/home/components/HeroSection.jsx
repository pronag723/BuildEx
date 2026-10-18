"use client";

import Link from "next/link";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { publicAsset } from "../utils";

// The studio room behind the hero, lit white by day and black by night;
// toggling the theme cross-fades the two (all CSS — see "The studio scene" in
// globals.css). On a phone it is the one portrait picture. From `sm` it is the
// same room laid out on a wider wall: its corner pieces (cubes at the top left
// and top right, stairs at the bottom left, and a box at the bottom right made
// from the stairs' bottom step) cut from it at their natural proportions, and
// its floor. The character and the floating blocks stand in front of it (in
// HeroSection).
function HeroScene() {
  const pictures = {
    "--hero-night": `url(${publicAsset("/backgrounds/hero-night.webp")})`,
    "--hero-day": `url(${publicAsset("/backgrounds/hero-day.webp")})`,
  };
  return (
    <div className="hero-scene" style={pictures} aria-hidden="true">
      <img className="scene-full scene-night" src={publicAsset("/backgrounds/hero-night.webp")} alt="" decoding="async" />
      <img className="scene-full scene-day" src={publicAsset("/backgrounds/hero-day.webp")} alt="" decoding="async" />
      <PhoneBlocks theme="night" width={586} />
      <PhoneBlocks theme="day" width={585} />
      <div className="scene-floor" />
      <div className="scene-piece scene-cubes-left" />
      <div className="scene-piece scene-cubes-right" />
      <div className="scene-piece scene-stairs" />
      <div className="scene-piece scene-box-right" />
    </div>
  );
}

// Where each floating block is painted in the phone pictures (top-left
// corner, picture pixels; hero-block-N.webp is its 1:1 cut-out), and its size.
const PHONE_BLOCKS = {
  night: [[363, 144], [482, 490], [122, 739]],
  day: [[362, 140], [480, 494], [122, 748]],
};
const BLOCK_SIZES = [[116, 128], [96, 110], [94, 108]];
// hero-patch-N-<theme>.webp is the wall where block N was, filled in from
// around it, cut this many pixels wider than the block on every side.
const PATCH_MARGIN = 18;

// Phone: the picture's three blocks set floating. Laid over the picture with
// its own cover fit (the SVG's "slice"); each block's spot is papered over
// with its wall patch, and the block itself — the picture, masked to the
// block's cut-out — drifts above it.
function PhoneBlocks({ theme, width }) {
  const picture = publicAsset(`/backgrounds/hero-${theme}.webp`);
  return (
    <svg
      className={`scene-blocks-phone scene-${theme}`}
      viewBox={`0 0 ${width} 1280`}
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        {PHONE_BLOCKS[theme].map(([x, y], i) => (
          <mask key={i} id={`hero-block-${theme}-${i + 1}`} style={{ maskType: "alpha" }}>
            <image
              href={publicAsset(`/backgrounds/hero-block-${i + 1}.webp`)}
              x={x}
              y={y}
              width={BLOCK_SIZES[i][0]}
              height={BLOCK_SIZES[i][1]}
            />
          </mask>
        ))}
      </defs>
      {PHONE_BLOCKS[theme].map(([x, y], i) => (
        <image
          key={i}
          href={publicAsset(`/backgrounds/hero-patch-${i + 1}-${theme}.webp`)}
          x={x - PATCH_MARGIN}
          y={y - PATCH_MARGIN}
          width={BLOCK_SIZES[i][0] + 2 * PATCH_MARGIN}
          height={BLOCK_SIZES[i][1] + 2 * PATCH_MARGIN}
        />
      ))}
      {PHONE_BLOCKS[theme].map(([x, y], i) => (
        <g
          key={i}
          className={`phone-block phone-block-${i + 1}`}
          style={{ transformOrigin: `${x + BLOCK_SIZES[i][0] / 2}px ${y + BLOCK_SIZES[i][1] / 2}px` }}
        >
          <image href={picture} width={width} height="1280" mask={`url(#hero-block-${theme}-${i + 1})`} />
        </g>
      ))}
    </svg>
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
        <div className="hero-actions">
          <Link href="/" className="btn btn-outline btn-lg">
            <Icon name="arrowRight" size={18} strokeWidth={2} />
            {t("about.browseBuilders")}
          </Link>
        </div>
      </div>

      {/* The character stands on the floor right of the copy (from `sm`),
          with three of the picture's blocks floating around him: one above
          his head, one at his side, one low between him and the copy. */}
      <div className="hero-figure" aria-hidden="true">
        <img className="scene-night" src={publicAsset("/backgrounds/hero-figure-night.webp")} alt="" decoding="async" />
        <img className="scene-day" src={publicAsset("/backgrounds/hero-figure-day.webp")} alt="" decoding="async" />
      </div>
      <SceneBlock src={1} className="scene-block-head" />
      <SceneBlock src={2} className="scene-block-side" />
      <SceneBlock src={3} className="scene-block-low" />

      {/* Phone: the character again, cut out (the cut-outs are 1:1 crops of
          the pictures, at 282,600) and laid exactly over himself in the
          picture — the SVG's "slice" is the picture's object-fit: cover — so
          he stands in front of the headline where the two meet. */}
      <div className="hero-figure-phone" aria-hidden="true">
        <svg className="scene-night" viewBox="0 0 586 1280" preserveAspectRatio="xMidYMax slice">
          <image href={publicAsset("/backgrounds/hero-figure-night.webp")} x="282" y="600" width="303" height="640" />
        </svg>
        <svg className="scene-day" viewBox="0 0 585 1280" preserveAspectRatio="xMidYMax slice">
          <image href={publicAsset("/backgrounds/hero-figure-day.webp")} x="282" y="600" width="303" height="640" />
        </svg>
      </div>

      <a href="#projects" className="hero-next" aria-label={t("about.hero.scrollAria")}>
        <Icon name="chevronDown" size={20} strokeWidth={2} />
      </a>
    </section>
  );
}
