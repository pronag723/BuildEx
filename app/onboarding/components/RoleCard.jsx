"use client";

import { useRef } from "react";

/**
 * Large interactive role-selection card.
 * Glassmorphism + green-glow hover + animated radial spotlight that follows
 * the cursor for a premium feel.
 */
export default function RoleCard({
  role,            // "builder" | "client"
  title,
  description,
  icon,            // JSX icon element
  bullets = [],
  selected,
  onSelect,
}) {
  const ref = useRef(null);

  function handleMouseMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--role-x", `${x}%`);
    el.style.setProperty("--role-y", `${y}%`);
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      onMouseMove={handleMouseMove}
      onFocus={() => {
        ref.current?.style.setProperty("--role-x", "50%");
        ref.current?.style.setProperty("--role-y", "0%");
      }}
      aria-pressed={selected}
      className={`role-card glass w-full ${selected ? "is-selected" : ""}`}
    >
      <span className="role-check" aria-hidden="true">
        <svg viewBox="0 0 12 10" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 5l3.5 3.5L11 1" />
        </svg>
      </span>

      <span className="role-icon" aria-hidden="true">
        {icon}
      </span>

      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#4ade80] mb-1.5">
          I&apos;m a {role}
        </div>
        <h3 className="text-xl sm:text-2xl font-extrabold logo-font tracking-tight">
          {title}
        </h3>
        <p className="mt-2 text-[13px] sm:text-sm text-gray-400 leading-snug">
          {description}
        </p>
      </div>

      {bullets.length > 0 && (
        <ul className="mt-auto space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-gray-300 leading-snug">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#4ade80] flex-shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
