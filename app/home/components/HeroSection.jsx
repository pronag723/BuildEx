"use client";

import { useEffect, useState } from "react";
import { withBase } from "../utils";
import { fetchBuilders } from "../../builders/data/fetchBuilders";
import { Icon } from "../../../lib/icons";

export default function HeroSection({ heroVisualRef, onAnchorClick }) {
  // Real builder-presence figure for the floating badge. We reuse fetchBuilders
  // (which already applies the busy/onboarding visibility rules and sets
  // `online` from last_seen_at) instead of writing a bespoke count query.
  // `label` stays null until the fetch resolves so we never flash a fake number.
  const [badgeLabel, setBadgeLabel] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchBuilders().then(({ builders }) => {
      if (!alive) return;
      const list = builders || [];
      const onlineCount = list.filter((b) => b.online).length;
      if (onlineCount > 0) {
        setBadgeLabel(
          `${onlineCount} builder${onlineCount === 1 ? "" : "s"} online now`
        );
      } else if (list.length > 0) {
        setBadgeLabel(
          `${list.length} builder${list.length === 1 ? "" : "s"} listed`
        );
      } else {
        setBadgeLabel(null);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section
      id="hero"
      className="flex items-center hero-pt relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 hero-gap items-center hero-height relative z-10 w-full">
        <div className="space-y-8 hero-text-space text-center lg:text-left">
          <div className="inline-flex items-center gap-2 glass px-5 py-2 rounded-full text-sm hero-badge">
            <span className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse flex-shrink-0" />
            A directory of Minecraft builders
          </div>
          <h1 className="hero-h1 font-bold leading-tight tracking-tighter">
            <span className="block">Find&nbsp;the&nbsp;builder</span>
            <span className="block text-[#4ade80]">behind the build</span>
            <span className="block">you want</span>
          </h1>
          <p className="hero-body text-gray-400 max-w-md mx-auto lg:mx-0">
            Browse builder profiles, look at the work they have actually made,
            and contact them yourself — on Discord, on Telegram, or here.
          </p>
          <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
            <a
              href={withBase("/")}
              onClick={(event) => onAnchorClick(event, "/")}
              className="hero-btn-primary px-8 py-4 bg-[#4ade80] text-black font-semibold rounded-full hover:scale-105 transition-all green-glow inline-block text-center"
            >
              Browse Builders
            </a>
            <a
              href="#how-it-works"
              onClick={(event) => onAnchorClick(event, "#how-it-works")}
              className="hero-btn-primary px-8 py-4 border border-white/20 hover:border-white/40 font-semibold rounded-full transition-all inline-block text-center"
            >
              How it works
            </a>
          </div>
        </div>

        <div ref={heroVisualRef} className="relative hero-visual" id="heroVisual">
          {/* Illustrations of the two things the site does: show you a profile,
              and hand you the builder's own contact links. No names, prices or
              fees — there is nothing here to invent. */}
          <div className="glass rounded-3xl p-6 w-80 floating-card card-hover absolute -right-8 top-12 shadow-2xl border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <span className="icon-tile text-[#4ade80] flex-shrink-0">
                <Icon name="user" size={22} strokeWidth={1.6} />
              </span>
              <div>
                <div className="font-semibold">Builder profile</div>
                <div className="text-xs text-gray-400">Portfolio · styles · links</div>
              </div>
            </div>
            <div className="text-sm text-gray-300 mb-4">
              See the builds before you say a word.
            </div>
            <div className="flex justify-between items-center gap-3">
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                  Fantasy
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                  Medieval
                </span>
              </div>
              <span className="text-xs bg-white/10 px-4 py-2 rounded-full whitespace-nowrap">
                Message
              </span>
            </div>
          </div>

          <div className="glass rounded-3xl p-5 floating-card card-hover absolute -left-6 bottom-24 w-72 shadow-2xl border border-white/10">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">
              Reach them directly
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-200">
                <Icon name="chat" size={13} /> Discord
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-200">
                <Icon name="send" size={13} /> Telegram
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80]">
                <Icon name="chat" size={13} /> On BuildEx
              </span>
            </div>
          </div>

          {badgeLabel && (
            <div className="absolute -right-16 bottom-48 glass rounded-2xl px-6 py-3 text-[#4ade80] text-sm flex items-center gap-3 border border-[#4ade80]/30 floating-card card-hover">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#4ade80]" />
              </span>
              <span>{badgeLabel}</span>
            </div>
          )}
        </div>
      </div>

      <a
        href="#projects"
        className="hero-next-link"
        aria-label="Scroll to the build showcase"
        onClick={(event) => onAnchorClick(event, "#projects")}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </a>
    </section>
  );
}
