"use client";

export default function CatalogSearch({ query, onQueryChange }) {
  return (
    <div className="relative flex-1 min-w-0">
      {/* Search icon */}
      <svg
        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="6" />
        <path d="m19 19-4.35-4.35" />
      </svg>

      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by title, builder, style or tag…"
        className="w-full glass rounded-2xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-[#4ade80]/40 focus:ring-1 focus:ring-[#4ade80]/15 transition-all placeholder:text-gray-500"
        aria-label="Search offers"
      />

      {/* Clear button */}
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-colors text-xs"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
