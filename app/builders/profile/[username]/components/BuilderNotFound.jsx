"use client";

export default function BuilderNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="gradient-background" />
      <div className="gradient-edge-glow" />

      <div className="relative z-10 glass rounded-3xl p-12 max-w-md w-full">
        <div className="w-16 h-16 bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
          🧱
        </div>
        <h1 className="text-2xl font-bold mb-3">Builder not found</h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          This creator may have left the platform, changed their username, or the link is incorrect.
          Browse the catalog to find other talented builders.
        </p>
        <a
          href="/builders"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#4ade80] text-black font-bold text-sm green-glow hover:bg-[#22c55e] transition-all"
        >
          Browse Builders
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 10h10M11 6l4 4-4 4" />
          </svg>
        </a>
      </div>
    </div>
  );
}
