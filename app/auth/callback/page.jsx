"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — OAuth landing page
// Every provider round-trip returns here with `?code=` on the URL. The Supabase
// client created by AuthProvider (root layout) has `detectSessionInUrl: true`
// and exchanges that code automatically, so this page has exactly two jobs:
//
//   • surface a provider-side error (`?error=…`) back on /login, where the
//     AuthCard already renders it nicely;
//   • send the user to the page they were on before they signed in.
//
// There is no registration behind sign-in any more, so nothing else happens
// here — a brand-new account already has a usable profiles row by the time
// AuthContext settles (lib/auth/profile.js → ensureProfile).
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { sanitizeRedirect } from "../../../lib/auth/redirects";
import { withBase } from "../../home/utils";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Waiting />}>
      <AuthCallbackInner />
    </Suspense>
  );
}

function readTarget() {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(window.location.search);
  return sanitizeRedirect(params.get("redirect"));
}

function readOAuthError() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const errKey = params.get("error");
  const errDesc = params.get("error_description");
  if (!errKey && !errDesc) return null;
  const qs = new URLSearchParams();
  if (errDesc) qs.set("error_description", errDesc);
  if (errKey) qs.set("error", errKey);
  return `/login?${qs.toString()}`;
}

function AuthCallbackInner() {
  const router = useRouter();
  const { status, configured } = useAuth();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const errorRedirect = readOAuthError();
    if (errorRedirect) {
      router.replace(errorRedirect);
      return;
    }
    if (!configured) return;
    if (status === "loading") return;

    if (status === "unauthenticated") {
      // The exchange failed (most often a `?code=` that was already redeemed
      // by a refresh). Send them back to sign in rather than looping here.
      router.replace("/login");
      return;
    }
    router.replace(readTarget());
  }, [status, configured, router]);

  // The exchange itself can take 10–15 s on a Supabase cold start; only show
  // the escape hatch once we're well past that.
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 20000);
    return () => clearTimeout(t);
  }, []);

  if (!configured) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="glass rounded-3xl p-10 max-w-md border border-white/10">
          <div className="text-xl font-semibold mb-2">Authentication not configured</div>
          <p className="text-gray-400 text-sm">
            Add Supabase keys to <code className="text-[#4ade80]">.env.local</code> to enable sign-in.
          </p>
        </div>
      </main>
    );
  }

  if (stuck && status !== "authenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="glass rounded-3xl p-10 max-w-md border border-red-400/30">
          <div className="text-xl font-semibold mb-2">Sign-in didn&apos;t finish</div>
          <p className="text-gray-400 text-sm mb-6">
            If you refreshed this page, the one-time login code in the URL is no longer
            valid — please sign in again.
          </p>
          <a
            href={withBase("/login")}
            className="inline-block px-6 py-3 bg-[#4ade80] text-black font-semibold rounded-full green-glow hover:scale-105 transition-all"
          >
            Back to login
          </a>
        </div>
      </main>
    );
  }

  return <Waiting />;
}

function Waiting() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
      <p className="mt-4 text-sm text-gray-500">Signing you in…</p>
    </main>
  );
}
