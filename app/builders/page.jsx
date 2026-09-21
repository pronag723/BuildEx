"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /builders — legacy feed URL.
//
// The directory moved to the site root, but this path is in the sitemap, in
// every link shared before the move, and in the robots rules. Rather than
// serve the feed from two URLs (which splits the canonical and makes the
// filter URLs ambiguous), this page bounces to `/` and carries the query
// string with it, so `/builders?style=fantasy` still lands on the right feed.
//
// It has to be a client redirect: `output: "export"` emits static HTML with no
// server to send a 301, and `next.config.js` has no `redirects()` for the same
// reason.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BuildersRedirect() {
  const router = useRouter();

  useEffect(() => {
    // `replace` so the back button skips this hop. No withBase() — Next
    // prepends the deployment basePath to router calls itself.
    router.replace(`/${window.location.search}`);
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin"
        role="status"
        aria-label="Redirecting to the builder directory"
      />
    </main>
  );
}
