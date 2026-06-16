"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../lib/icons";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Homepage "Features" deck
// A swipeable stack of cards (drag / arrows / dots / keyboard) showcasing the
// platform's standout features. Each card carries a lightweight, in-app CSS/SVG
// MOCKUP of the feature rather than a screenshot, so it always matches the live
// design system (green #4ade80, .glass surfaces, Inter / Space Grotesk).
// ─────────────────────────────────────────────────────────────────────────────

// ── Per-feature stylized mockups (pure presentation) ────────────────────────

// 3D voxel preview — a small isometric cluster of cubes inside a viewer frame.
function PreviewMock() {
  return (
    <div className="fd-mock fd-mock-preview">
      <div className="fd-viewer-bar">
        <span className="fd-dot" />
        <span className="fd-dot" />
        <span className="fd-dot" />
        <span className="fd-viewer-label">3D preview</span>
      </div>
      <div className="fd-stage">
        <div className="fd-voxel">
          <span className="fd-face fd-top" />
          <span className="fd-face fd-left" />
          <span className="fd-face fd-right" />
        </div>
      </div>
      <div className="fd-hint">Drag to rotate · scroll to zoom</div>
    </div>
  );
}

// Escrow / transaction security — a lock with a buyer → escrow → builder flow.
function EscrowMock() {
  return (
    <div className="fd-mock fd-mock-escrow">
      <div className="fd-lock">
        <Icon name="lock" size={26} />
      </div>
      <div className="fd-flow">
        <span className="fd-node">Buyer</span>
        <span className="fd-line" />
        <span className="fd-node fd-node-active">
          <Icon name="shield" size={13} /> Escrow
        </span>
        <span className="fd-line" />
        <span className="fd-node">Builder</span>
      </div>
      <div className="fd-escrow-note">Funds released only after you approve</div>
    </div>
  );
}

// Rank ladder — rookie → master with the falling commission rate.
function RankMock() {
  const tiers = [
    { label: "Rookie", pct: "15%", w: 34 },
    { label: "Advanced", pct: "12%", w: 56 },
    { label: "Expert", pct: "8%", w: 78 },
    { label: "Master", pct: "5%", w: 100 },
  ];
  return (
    <div className="fd-mock fd-mock-rank">
      {tiers.map((t, i) => (
        <div className="fd-rank-row" key={t.label}>
          <span className="fd-rank-name">{t.label}</span>
          <span className="fd-rank-bar">
            <span
              className={`fd-rank-fill ${i === tiers.length - 1 ? "fd-rank-top" : ""}`}
              style={{ width: `${t.w}%` }}
            />
          </span>
          <span className="fd-rank-pct">{t.pct}</span>
        </div>
      ))}
    </div>
  );
}

// Verified reviews — a compact review card with a star row.
function ReviewMock() {
  return (
    <div className="fd-mock fd-mock-review">
      <div className="fd-review-head">
        <span className="fd-avatar">E</span>
        <div>
          <div className="fd-review-name">EmberCraft</div>
          <div className="fd-stars">
            {Array.from({ length: 5 }).map((_, i) => (
              <Icon key={i} name="star" size={13} className="fd-star" />
            ))}
          </div>
        </div>
        <span className="fd-verified">
          <Icon name="check" size={12} /> Verified order
        </span>
      </div>
      <p className="fd-review-body">
        “Hired straight from the feed and the spawn turned out incredible.”
      </p>
    </div>
  );
}

// Live chat + order tracking — a chat bubble pair and a status timeline.
function ChatMock() {
  const steps = ["Paid", "In progress", "Delivered"];
  return (
    <div className="fd-mock fd-mock-chat">
      <div className="fd-bubble fd-bubble-in">Can you add a dragon tower?</div>
      <div className="fd-bubble fd-bubble-out">On it — sending a preview soon ✦</div>
      <div className="fd-track">
        {steps.map((s, i) => (
          <span key={s} className="fd-track-step">
            <span className={`fd-track-dot ${i <= 1 ? "fd-track-done" : ""}`} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    key: "preview",
    icon: "box",
    title: "Interactive 3D Previews",
    body: "Rotate and zoom an automatic 3D render of the build before you confirm — no downloads, no guesswork.",
    bullets: ["Rotate · zoom · inspect", "Generated at delivery", "Approve with confidence"],
    Mock: PreviewMock,
  },
  {
    key: "escrow",
    icon: "shield",
    title: "Escrow-Protected Payments",
    body: "Your payment is held safely and only released to the builder once you've approved the delivery.",
    bullets: ["Funds held in escrow", "Released on approval", "Disputes resolved fairly"],
    Mock: EscrowMock,
  },
  {
    key: "ranks",
    icon: "trophy",
    title: "Earned Ranking System",
    body: "Builders climb from Rookie to Master through real completed orders and ratings — higher ranks pay lower fees.",
    bullets: ["Ranks from real metrics", "Lower commission per tier", "Rewards proven quality"],
    Mock: RankMock,
  },
  {
    key: "reviews",
    icon: "star",
    title: "Verified Reviews",
    body: "Every review comes from a real, completed order — so the ratings you see are ones you can trust.",
    bullets: ["Order-gated reviews", "One review per order", "Honest, real feedback"],
    Mock: ReviewMock,
  },
  {
    key: "chat",
    icon: "chat",
    title: "Live Chat & Order Tracking",
    body: "Message builders directly, share files and photos, and follow your order from payment to delivery.",
    bullets: ["Direct messaging", "Paste & send photos", "Live order status"],
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
            Why BuildEx
          </span>
          <h2 className="text-4xl font-semibold mb-4">
            Built for serious <span className="text-[#4ade80]">creators</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Swipe through the features that make hiring and selling Minecraft
            builds safe, transparent, and effortless.
          </p>
        </div>

        <div className="features-deck-wrap">
          <div
            className="features-deck"
            role="group"
            aria-roledescription="carousel"
            aria-label="BuildEx features"
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
        <div className="flex items-center justify-center gap-5 mt-8">
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
