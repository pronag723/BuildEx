export default function StudioOfficialBadge({ className = "" }) {
  return (
    <span
      className={`group/official relative inline-flex shrink-0 ${className}`}
      tabIndex={0}
      role="img"
      aria-label="Official studio"
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#4ade80]/55 bg-[#4ade80]/15 text-[#5cf09a] transition-colors group-hover/official:bg-[#4ade80]/25 group-focus/official:bg-[#4ade80]/25">
        <svg
          className="h-2.5 w-2.5"
          viewBox="0 0 12 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1 5l3.5 3.5L11 1" />
        </svg>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max -translate-x-1/2 rounded-md border border-white/10 bg-[#121512] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/official:opacity-100 group-focus/official:opacity-100"
      >
        Official studio
      </span>
    </span>
  );
}
