"use client";

export default function PaginationControls({ total, shown, onLoadMore }) {
  const hasMore = shown < total;
  const remaining = total - shown;

  return (
    <div className="mt-14 flex flex-col items-center gap-4">
      <p className="text-sm text-gray-400">
        Showing{" "}
        <span className="text-white font-semibold">{shown}</span> of{" "}
        <span className="text-white font-semibold">{total}</span> offers
      </p>

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="group inline-flex items-center gap-2.5 glass rounded-2xl px-8 py-3 text-sm font-medium hover:border-[#4ade80]/40 hover:text-[#4ade80] transition-all duration-300"
        >
          Load {Math.min(remaining, 9)} more
          <svg
            className="w-4 h-4 group-hover:translate-y-0.5 transition-transform"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 4v12M4 10l6 6 6-6" />
          </svg>
        </button>
      )}

      {!hasMore && total > 0 && (
        <p className="text-xs text-gray-500 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full" />
          You&apos;ve seen all available offers
        </p>
      )}
    </div>
  );
}
