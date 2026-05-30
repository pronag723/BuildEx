"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";
import { buildLoginUrl } from "./redirects";

export function useRequireAuth() {
  const { status, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!configured) return;
    if (status !== "unauthenticated") return;

    const query = search?.toString();
    const fullPath = query ? `${pathname}?${query}` : pathname;
    // Keep the login URL base-less: router.replace() prepends the deployment
    // basePath automatically. Adding it here too produced /BuildEx/BuildEx/login
    // and 404'd on GitHub Pages.
    router.replace(buildLoginUrl(fullPath));
  }, [status, configured, router, pathname, search]);

  return { status, configured };
}
