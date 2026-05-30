"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { buildLoginUrl } from "./redirects";
import { withBase } from "../../app/home/utils";

/**
 * Use for click handlers that require auth (Order now, Message, Hire, etc).
 * If the user is signed in, runs `action`. Otherwise, redirects to /login
 * with the current location preserved.
 */
export function useAuthGate() {
  const { status } = useAuth();
  const router = useRouter();

  return useCallback(
    (action, opts = {}) => {
      if (status === "authenticated") {
        action?.();
        return;
      }
      // The login URL must stay base-less: router.push() prepends the
      // deployment basePath automatically. Prefixing it here too produced
      // /BuildEx/BuildEx/login and 404'd on GitHub Pages.
      const basePrefix = withBase("").replace(/\/$/, "");
      let here =
        opts.redirectTo ||
        (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
      // window.location.pathname carries the basePath; strip it so the redirect
      // target round-trips cleanly (router prepends basePath again on the way back).
      if (basePrefix && here.startsWith(basePrefix)) {
        here = here.slice(basePrefix.length) || "/";
      }
      router.push(buildLoginUrl(here));
    },
    [status, router]
  );
}
