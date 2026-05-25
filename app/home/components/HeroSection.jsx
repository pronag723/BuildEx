"use client";

export default function HeroSection({ heroVisualRef, onAnchorClick, onShowSoon }) {
  return (
    <section
      id="hero"
      className="flex items-center hero-pt relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 hero-gap items-center hero-height relative z-10 w-full">
        <div className="space-y-8 hero-text-space text-center lg:text-left">
          <div className="inline-flex items-center gap-2 glass px-5 py-2 rounded-full text-sm hero-badge">
            <span className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse flex-shrink-0" />
            Connecting server owners with elite Minecraft builders
          </div>
          <h1 className="hero-h1 font-bold leading-tight tracking-tighter">
            <span className="block">The&nbsp;place&nbsp;where</span>
            <span className="block text-[#4ade80]">great servers</span>
            <span className="block">get built</span>
          </h1>
          <p className="hero-body text-gray-400 max-w-md mx-auto lg:mx-0">
            Hire skilled Minecraft builders or find paid work building epic
            spawns, hubs, maps, and custom decorations.
          </p>
          <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
            <a
              href="/builders"
              onClick={(event) => onAnchorClick(event, "/builders")}
              className="hero-btn-primary px-8 py-4 bg-[#4ade80] text-black font-semibold rounded-full hover:scale-105 transition-all green-glow inline-block text-center"
            >
              Browse Builders
            </a>
            <button
              type="button"
              onClick={() => onShowSoon("Project posting coming soon")}
              className="hero-btn-secondary px-8 py-4 border border-white/30 hover:border-white/60 font-medium rounded-full transition-all post-project-btn"
            >
              Post a Project
            </button>
          </div>
          <div className="flex items-center gap-8 text-sm pt-2 stat-counter justify-center lg:justify-start">
            <div>
              <div
                className="text-[#4ade80] font-semibold text-2xl count-up"
                data-count="200"
                data-suffix="+"
              >
                200+
              </div>
              <div className="text-gray-400">Active Builders</div>
            </div>
            <div>
              <div
                className="text-[#4ade80] font-semibold text-2xl count-up"
                data-count="1200"
                data-suffix="+"
              >
                1.2k+
              </div>
              <div className="text-gray-400">Projects Completed</div>
            </div>
            <div>
              <div
                className="text-[#4ade80] font-semibold text-2xl count-up"
                data-count="4.9"
                data-suffix=""
              >
                4.9
              </div>
              <div className="text-gray-400">Average Rating</div>
            </div>
          </div>
        </div>

        <div ref={heroVisualRef} className="relative hero-visual" id="heroVisual">
          <div className="glass rounded-3xl p-6 w-80 floating-card card-hover absolute -right-8 top-12 shadow-2xl border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="https://picsum.photos/id/1015/64/64"
                alt="Builder"
                className="w-12 h-12 rounded-2xl object-cover minecraft-img"
              />
              <div>
                <div className="font-semibold">PixelForge</div>
                <div className="text-xs text-[#4ade80] flex items-center gap-1">
                  <span>★</span> Master Builder
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-300 mb-4">Modern Fantasy Spawn</div>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[#4ade80] font-semibold">$850</div>
                <div className="text-xs text-emerald-400">+8% fee (Master)</div>
              </div>
              <button
                type="button"
                className="text-xs bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-colors"
              >
                View Build
              </button>
            </div>
          </div>

          <div className="glass rounded-3xl p-5 floating-card card-hover absolute -left-6 bottom-24 w-72 shadow-2xl border border-white/10">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Latest Bid
            </div>
            <div className="flex justify-between items-end">
              <div>
                <div className="font-medium">$620</div>
                <div className="text-xs text-emerald-400">by Architect • 4h ago</div>
              </div>
              <button
                type="button"
                className="text-xs bg-[#4ade80] hover:bg-[#22c55e] text-black px-4 py-2 rounded-full transition-all font-medium"
              >
                Accept
              </button>
            </div>
          </div>

          <div className="absolute -right-16 bottom-48 glass rounded-2xl px-6 py-3 text-[#4ade80] text-sm flex items-center gap-3 border border-[#4ade80]/30 floating-card card-hover">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#4ade80]" />
            </span>
            <span>17 builders online now</span>
          </div>
        </div>
      </div>

      <a
        href="#projects"
        className="hero-next-link"
        aria-label="Scroll to projects"
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
