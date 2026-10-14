"use client";

import { useEffect, useRef, useState } from "react";
import { publicAsset } from "../../home/utils";

// The wardrobe scene under the Profile tab: a Minecraft character beside an
// open wardrobe on a studio floor, with a few voxel blocks floating at the
// sides. Purely decorative (hidden from assistive tech, click-through).
//
// It is built from layers so each can move on its own (all CSS — see "The
// wardrobe scene" in globals.css): the floor rises in first, then the
// wardrobe, then the character. While the profile card is being edited the
// doors swing wide, the character leans in to pick an outfit, and the whole
// scene settles lower and dimmer to give the form the stage.
//
// Day and night art sit on top of each other and cross-fade with the theme,
// as on /about. Until its art is exported (public/backgrounds/account-*.webp,
// see ART_EXPORTED) the character is the /about figure and the wardrobe is
// drawn in CSS on the same geometry, so the doors animate either way; art
// that fails to load falls back the same way. No broken images.

const THEMES = ["night", "day"];

// Flip each to true once its files are in public/backgrounds — until then
// nothing requests them (no 404s in the console).
//   character: account-character-{night,day}.webp            606x1280
//   wardrobe:  account-wardrobe-body-{night,day}.webp         720x1080
//              account-wardrobe-door-{left,right}-{night,day}.webp  316x1004
const ART_EXPORTED = { character: false, wardrobe: false };

// Hanging on the rail, left to right (the mockups' coats).
const COATS = ["#2b2b2d", "#454547", "#e4e1da", "#7f1d2a", "#8e2433", "#565b54"];

function SceneImage({ src, fallback, className, width, height, onFallback, onMissing }) {
  const [current, setCurrent] = useState(src);
  if (!current) return null;
  return (
    <img
      className={className}
      src={publicAsset(current)}
      width={width}
      height={height}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        if (fallback && current !== fallback) {
          setCurrent(fallback);
          onFallback?.();
        } else {
          setCurrent(null);
          onMissing?.();
        }
      }}
    />
  );
}

function Character() {
  // The /about day figure stands 3.3% lower in its box than the night one;
  // when the character falls back to it, it gets the same lift as there.
  const [fallbackDay, setFallbackDay] = useState(!ART_EXPORTED.character);
  return (
    <div className="ws-enter ws-character" style={{ "--enter-delay": "200ms" }}>
      <div className="ws-pose">
        <div className="ws-breathe">
          {THEMES.map((theme) => (
            <SceneImage
              key={theme}
              className={`scene-${theme}${theme === "day" && fallbackDay ? " ws-figure-day-fallback" : ""}`}
              src={
                ART_EXPORTED.character
                  ? `/backgrounds/account-character-${theme}.webp`
                  : `/backgrounds/hero-figure-${theme}.webp`
              }
              fallback={`/backgrounds/hero-figure-${theme}.webp`}
              width={606}
              height={1280}
              onFallback={theme === "day" ? () => setFallbackDay(true) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CssCabinet() {
  return (
    <div className="ws-cab">
      <div className="ws-cab-inner">
        <span className="ws-shelf" style={{ top: "17%" }} />
        <span className="ws-box" style={{ left: "10%", bottom: "83%", width: "32%" }} />
        <span className="ws-box" style={{ left: "56%", bottom: "83%", width: "32%" }} />
        <span className="ws-rail" />
        <div className="ws-coats">
          {COATS.map((color, i) => (
            <span key={i} className="ws-coat" style={{ background: color }} />
          ))}
        </div>
        <span className="ws-shelf" style={{ top: "64%" }} />
        <span className="ws-divider" />
        <span className="ws-shelf ws-shelf-half" style={{ top: "80%" }} />
        <span className="ws-box" style={{ left: "8%", bottom: "20%", width: "34%" }} />
        <span className="ws-box" style={{ left: "10%", bottom: "2%", width: "36%" }} />
        <span className="ws-boot" style={{ left: "60%" }} />
        <span className="ws-boot" style={{ left: "76%" }} />
      </div>
    </div>
  );
}

function Wardrobe() {
  // One missing piece of art and the whole wardrobe is drawn in CSS instead,
  // so the body and its doors always match.
  const [drawn, setDrawn] = useState(!ART_EXPORTED.wardrobe);
  const missing = () => setDrawn(true);

  return (
    <div className="ws-enter ws-wardrobe" style={{ "--enter-delay": "100ms" }}>
      <div className="ws-body">
        {drawn ? (
          <CssCabinet />
        ) : (
          THEMES.map((theme) => (
            <SceneImage
              key={theme}
              className={`scene-${theme}`}
              src={`/backgrounds/account-wardrobe-body-${theme}.webp`}
              width={720}
              height={1080}
              onMissing={missing}
            />
          ))
        )}
      </div>
      {["left", "right"].map((side) => (
        <div key={side} className={`ws-door ws-door-${side}`}>
          {drawn ? (
            <span className="ws-door-face" />
          ) : (
            THEMES.map((theme) => (
              <SceneImage
                key={theme}
                className={`scene-${theme}`}
                src={`/backgrounds/account-wardrobe-door-${side}-${theme}.webp`}
                width={316}
                height={1004}
                onMissing={missing}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

// A floating voxel block at the side of the scene (from `sm`).
function SideBlock({ n, className, delay }) {
  return (
    <div className={`ws-enter ws-block-slot ${className}`} style={{ "--enter-delay": delay }}>
      <img
        className="ws-block"
        src={publicAsset(`/backgrounds/hero-block-${n}.webp`)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </div>
  );
}

export default function WardrobeScene({ editing = false }) {
  const [moving, setMoving] = useState(false);
  const firstRender = useRef(true);

  // will-change only while the scene is actually moving.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    setMoving(true);
    const timer = setTimeout(() => setMoving(false), 700);
    return () => clearTimeout(timer);
  }, [editing]);

  return (
    <div
      className="wardrobe-scene"
      data-editing={editing ? "" : undefined}
      aria-hidden="true"
    >
      <div className={`ws-world${moving ? " is-moving" : ""}`}>
        <div className="ws-enter ws-floor" style={{ "--enter-delay": "0ms" }} />
        <SideBlock n={3} className="ws-block-a" delay="40ms" />
        <SideBlock n={1} className="ws-block-b" delay="80ms" />
        <SideBlock n={2} className="ws-block-c" delay="60ms" />
        <div className="ws-stage">
          <Wardrobe />
          <Character />
        </div>
      </div>
    </div>
  );
}
