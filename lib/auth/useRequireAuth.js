"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";
import { buildLoginUrl } from "./redirects";
import { withBase } from "../../app/home/utils";

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
    router.replace(buildLoginUrl(fullPath, withBase("").replace(/\/$/, "")));
  }, [status, configured, router, pathname, search]);

  return { status, configured };
}
