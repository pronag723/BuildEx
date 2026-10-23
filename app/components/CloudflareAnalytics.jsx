"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Web Analytics: counts page views without cookies or browser
// storage (see "Visitor statistics" in the privacy policy). Off unless the
// build has NEXT_PUBLIC_CF_ANALYTICS_TOKEN, so local dev is never counted.
//
// The beacon reports page addresses to Cloudflare, so it is kept off the two
// pages whose URL carries a secret: /auth/callback (the OAuth ?code=) and
// /unsubscribe (the signed ?token=). Both are only reached by a full page load
// from outside the site, and the beacon follows client-side navigation from
// wherever it was loaded, so skipping it on first load keeps those URLs out.
// The cost is that the rest of that visit goes uncounted until a full reload.
// Renders nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

const token = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;

const UNTRACKED_PATH = /\/(?:auth\/callback|unsubscribe)\/?$/;

export default function CloudflareAnalytics() {
  useEffect(() => {
    if (!token || UNTRACKED_PATH.test(window.location.pathname)) return;
    if (document.querySelector("script[data-cf-beacon]")) return;
    const script = document.createElement("script");
    script.defer = true;
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.setAttribute("data-cf-beacon", JSON.stringify({ token, spa: true }));
    document.head.appendChild(script);
  }, []);
  return null;
}
