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
      const here =
        opts.redirectTo ||
        (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
      const basePrefix = withBase("").replace(/\/$/, "");
      router.push(buildLoginUrl(here, basePrefix));
    },
    [status, router]
  );
}
