"use client";

import { useEffect, useRef, useState } from "react";
import { publicAsset } from "../../home/utils";

// The wardrobe scene under the Profile tab: a character beside an open
// wardrobe, seen at an angle, in a studio room with boxes stacked at the
// sides. Purely decorative (hidden from assistive tech, click-through).
//
// It is the mockup's own room, in layers (all motion is CSS — see "The
// wardrobe scene" in globals.css):
//
//   account-room-*      the room: wall, floor and wardrobe, with the
//                       character and the boxes painted out (1280x642)
//   account-strip-*     one column of wall and floor, repeated to carry the
//                       room past the picture's sides on wide screens
//   account-boxes-*     the boxes stacked at the picture's sides; on a wide
//                       screen they keep to the window's edges (the
//                       picture's frame crops them, so the window's should)
//   account-door-*      the two doors, cut out and laid exactly over
//                       themselves; while editing they swing further open
//   account-character-* the character, cut out, laid over where he stood;
//                       he breathes, and leans toward the wardrobe while
//                       editing
//
// Night and day are separate renders and cross-fade with the theme.

const THEMES = ["night", "day"];

// Where each cut-out sits in the room picture: [left, top, right, bottom],
// in picture pixels.
const CHARACTER = { night: [266, 54, 473, 536], day: [261, 54, 476, 542] };
const DOORS = { left: [573, 66, 653, 511], right: [965, 26, 1073, 531] };
const BOXES = {
  left: { night: [0, 149, 209, 521], day: [0, 148, 224, 521] },
  right: { night: [1167, 245, 1280, 512], day: [1158, 238, 1280, 511] },
};

function placed([x0, y0, x1, y1]) {
  return {
    left: `calc(${x0} * var(--k))`,
    top: `calc(${y0} * var(--k))`,
    width: `calc(${x1 - x0} * var(--k))`,
    height: `calc(${y1 - y0} * var(--k))`,
  };
}

function Art({ name, theme, box }) {
  const [x0, y0, x1, y1] = box;
  return (
    <img
      className={`ws-art scene-${theme}`}
      src={publicAsset(`/backgrounds/account-${name}-${theme}.webp`)}
      width={x1 - x0}
      height={y1 - y0}
      style={placed(box)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
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
    <div className="wardrobe-scene" data-editing={editing ? "" : undefined} aria-hidden="true">
      <div className={`ws-world${moving ? " is-moving" : ""}`}>
        <div className="ws-enter ws-strip">
          {THEMES.map((theme) => (
            <div
              key={theme}
              className={`ws-strip-layer scene-${theme}`}
              style={{ backgroundImage: `url(${publicAsset(`/backgrounds/account-strip-${theme}.webp`)})` }}
            />
          ))}
        </div>

        <div className="ws-enter ws-sides" style={{ "--enter-delay": "60ms" }}>
          {Object.entries(BOXES).map(([side, boxes]) =>
            THEMES.map((theme) => {
              const [x0, y0, x1, y1] = boxes[theme];
              return (
                <img
                  key={`${side}-${theme}`}
                  className={`ws-boxes ws-boxes-${side} scene-${theme}`}
                  src={publicAsset(`/backgrounds/account-boxes-${side}-${theme}.webp`)}
                  width={x1 - x0}
                  height={y1 - y0}
                  style={{
                    top: `calc(${y0} * var(--k))`,
                    width: `calc(${x1 - x0} * var(--k))`,
                    height: `calc(${y1 - y0} * var(--k))`,
                  }}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              );
            })
          )}
        </div>

        <div className="ws-room">
          <div className="ws-enter ws-room-art">
            {THEMES.map((theme) => (
              <img
                key={theme}
                className={`ws-room-img scene-${theme}`}
                src={publicAsset(`/backgrounds/account-room-${theme}.webp`)}
                width={1280}
                height={642}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ))}
            <div className="ws-glow" />
            {Object.entries(DOORS).map(([side, box]) => (
              <div key={side} className={`ws-door ws-door-${side}`} style={placed(box)}>
                {THEMES.map((theme) => (
                  <Art key={theme} name={`door-${side}`} theme={theme} box={[0, 0, box[2] - box[0], box[3] - box[1]]} />
                ))}
              </div>
            ))}
          </div>

          <div className="ws-enter ws-character" style={{ "--enter-delay": "160ms" }}>
            <div className="ws-pose">
              <div className="ws-breathe">
                {THEMES.map((theme) => (
                  <Art key={theme} name="character" theme={theme} box={CHARACTER[theme]} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
