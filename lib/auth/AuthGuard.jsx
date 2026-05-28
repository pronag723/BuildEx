"use client";

import { useRequireAuth } from "./useRequireAuth";

export default function AuthGuard({ children, fallback = null }) {
  const { status, configured } = useRequireAuth();

  if (!configured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="glass rounded-3xl p-10 max-w-md border border-white/10">
          <div className="text-xl font-semibold mb-2">Authentication not configured</div>
          <p className="text-gray-400 text-sm">
            Set <code className="text-[#4ade80]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-[#4ade80]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your <code>.env.local</code>{" "}
            to enable protected routes.
          </p>
        </div>
      </div>
    );
  }

  if (status === "authenticated") return children;

  return (
    fallback || (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <span className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" />
          <span className="text-sm">Checking your session…</span>
        </div>
      </div>
    )
  );
}
