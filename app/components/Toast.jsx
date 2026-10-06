"use client";

import { useRef } from "react";

// A short status message at the bottom of the screen. Pass `message` to show
// it and null to hide it; the owner decides how long it stays. The last text
// is kept while the toast fades out, so it doesn't empty itself mid-fade.
export default function Toast({ message }) {
  const last = useRef(message);
  if (message) last.current = message;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast menu-panel ${message ? "is-visible" : ""}`}
    >
      {message || last.current}
    </div>
  );
}
