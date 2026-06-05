"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Watches navigation so the /builders catalog can tell when a visitor returns
// from a builder profile (and should keep its shuffled order) versus arrives
// fresh (and should reshuffle). It just forwards each route change to
// recordNav(); the actual flag bookkeeping lives in data/feedOrder.js.
// Renders nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordNav } from "../data/feedOrder";

export default function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordNav(pathname);
  }, [pathname]);
  return null;
}
