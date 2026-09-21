"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../lib/icons";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Homepage "What you get" deck
// A swipeable stack of cards (drag / arrows / dots / keyboard) describing what
// the site actually does. Each card carries a lightweight, in-app CSS/SVG
// MOCKUP of the feature rather than a screenshot, so it always matches the live
// design system (green #4ade80, .glass surfaces, Inter / Space Grotesk).
//
// Every claim here has to be something the code does. Ranks, reviews, fees and
// protected payments were removed from the product, so they are gone from this
// deck too.
// ─────────────────────────────────────────────────────────────────────────────

// ── Per-feature stylized mockups (pure presentation) ────────────────────────

// Portfolio — a builder's own images, shown as a thumbnail grid.
function PortfolioMock() {
  return (
    <div className="fd-mock fd-mock-portfolio">
      <div className="fd-shot fd-shot-wide" />
      <div className="fd-shot" />
      <div className="fd-shot" />
      <div className="fd-shot" />
      <div className="fd-shot" />
    </div>
  );
}

// Contact links — the buttons a builder chooses to publish on their profile.
function ContactMock() {
  return (
    <div className="fd-mock fd-mock-contact">
      <span className="fd-contact-pill">
        <Icon name="chat" size={12} /> Discord
      </span>
      <span className="fd-contact-pill">
        <Icon name="send" size={12} /> Telegram
      </span>
      <span className="fd-contact-pill">
        <Icon name="play" size={12} /> YouTube
      </span>
      <span className="fd-contact-pill fd-contact-pill-active">
        <Icon name="link" size={12} /> Their site
      </span>
    </div>
  );
}

// Live chat — a chat bubble pair.
function ChatMock() {
  return (
    <div className="fd-mock fd-mock-chat">
      <div className="fd-bubble fd-bubble-in">Can you add a dragon tower?</div>
      <div className="fd-bubble fd-bubble-out">On it — sending some sketches ✦</div>
    </div>
  );
}

const FEATURES = [
  {
    key: "portfolios",
    icon: "image",
    title: "Portfolios, not promises",
    body: "Every profile is the builder's own work, uploaded by them and shown full size. Look at it before you talk to anyone.",
    bullets: ["Full-size portfolio images", "Filter by style and build type", "Nothing scored or ranked by us"],
    Mock: PortfolioMock,
  },
  {
    key: "contact",
    icon: "link",
    title: "Contact on their terms",
    body: "Builders publish the ways they want to be reached — Discord, Telegram, YouTube, their own site. You take it from there.",
    bullets: ["Their own handles and links", "Checked for safe link formats", "No middleman in the conversation"],
    Mock: ContactMock,
  },
  {
    key: "chat",
    icon: "chat",
    title: "Or message here",
    body: "Prefer to keep first contact on the site? BuildEx chat carries text and photos while you work out what you need.",
    bullets: ["Direct messaging", "Paste & send photos", "Report a conversation"],
    Mock: ChatMock,
  },
];

export default function FeaturesDeckSection() {
  const n = FEATURES.length;
  const [active, setActive] = useState(0);
  const [dx, setDx] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const go = useCallback(
    (dir) => setActive((a) => (a + dir + n) % n),
    [n]
  );

  // Pointer drag on the front card.
  const onPointerDown = (e) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    setDx(e.clientX - startXRef.current);
  };
  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const threshold = 110;
    if (dx <= -threshold) go(1); // swipe left → next
    else if (dx >= threshold) go(-1); // swipe right → previous
    setDx(0);
  };

  return (
    <section id="features" className="py-24 reveal">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-[#4ade80]/10 border border-[#4ade80]/30 text-[#4ade80] font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
            What you get
          </span>
          <h2 className="text-4xl font-semibold">
            What you actually <span className="text-[#4ade80]">get</span>
          </h2>
        </div>

        <div className="features-deck-wrap">
          <div
            className="features-deck"
            role="group"
            aria-roledescription="carousel"
            aria-label="What BuildEx gives you"
          >
            {FEATURES.map((f, i) => {
              const pos = (i - active + n) % n; // 0 = front
              const isFront = pos === 0;
              const visible = pos <= 2;
              const baseY = pos * 18;
              const baseScale = 1 - pos * 0.05;
              const transform = isFront
                ? `translateX(${dx}px) translateY(0) rotate(${dx * 0.025}deg) scale(1)`
                : `translateY(${baseY}px) scale(${baseScale})`;
              const Mock = f.Mock;
              return (
                <article
                  key={f.key}
                  className={`features-card glass rounded-3xl ${isFront ? "is-front" : ""}`}
                  aria-hidden={!isFront}
                  style={{
                    transform,
                    opacity: visible ? (pos === 2 ? 0.55 : 1) : 0,
                    zIndex: n - pos,
                    pointerEvents: isFront ? "auto" : "none",
                    transition: draggingRef.current && isFront
                      ? "none"
                      : "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.45s",
                    touchAction: "pan-y",
                  }}
                  onPointerDown={isFront ? onPointerDown : undefined}
                  onPointerMove={isFront ? onPointerMove : undefined}
                  onPointerUp={isFront ? endDrag : undefined}
                  onPointerCancel={isFront ? endDrag : undefined}
                >
                  <div className="features-card-mock">
                    <Mock />
                  </div>
                  <div className="features-card-body">
                    <span className="icon-tile icon-tile-lg text-[#4ade80] mb-4">
                      <Icon name={f.icon} size={28} strokeWidth={1.5} />
                    </span>
                    <h3 className="text-2xl font-semibold mb-2">{f.title}</h3>
                    <p className="text-gray-400 leading-relaxed mb-4">{f.body}</p>
                    <ul className="features-bullets">
                      {f.bullets.map((b) => (
                        <li key={b}>
                          <Icon name="check" size={15} className="text-[#4ade80]" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-5 mt-16">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous feature"
            className="features-arrow"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 rotate-180">
              <path d="M5 10h10M11 6l4 4-4 4" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            {FEATURES.map((f, i) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show ${f.title}`}
                aria-current={i === active}
                className={`features-dot ${i === active ? "is-active" : ""}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next feature"
            className="features-arrow"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M5 10h10M11 6l4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
