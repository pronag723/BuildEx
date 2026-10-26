"use client";

import { useEffect, useState } from "react";

// Whether a media query matches, live. False on the first render (the static
// export has no window), then the real value.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (event) => setMatches(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export const DESKTOP_QUERY = "(min-width: 1024px)";
