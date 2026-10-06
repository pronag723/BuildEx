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
// AuthContext settles (lib/auth/profile.js → ensureProfile). Someone who signed
// in with nowhere particular to be lands on /account, where they can carry on
// filling their profile in.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { resolvePostLoginPath } from "../../../lib/auth/redirects";
import { withBase } from "../../home/utils";
import { useT } from "../../../lib/i18n/LanguageProvider";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Waiting />}>
      <AuthCallbackInner />
    </Suspense>
  );
}

// The page the user was heading for before signing in, or their profile when
// there wasn't one (see resolvePostLoginPath).
function readTarget(profile) {
  if (typeof window === "undefined") return "/account";
  const params = new URLSearchParams(window.location.search);
  return resolvePostLoginPath(profile, params.get("redirect"));
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
  const { status, configured, profile } = useAuth();
  const t = useT();
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
    router.replace(readTarget(profile));
  }, [status, configured, profile, router]);

  // The exchange itself can take 10–15 s on a Supabase cold start; only show
  // the escape hatch once we're well past that.
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 20000);
    return () => clearTimeout(t);
  }, []);

  if (!configured) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="card max-w-md p-8">
          <h1 className="text-lg font-semibold">{t("auth.callback.notConfiguredTitle")}</h1>
          <p className="mt-2 text-sm text-ink-2">
            {t.rich("auth.callback.notConfiguredBody", {
              file: <code className="text-ink">.env.local</code>,
            })}
          </p>
        </div>
      </main>
    );
  }

  if (stuck && status !== "authenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="card max-w-md p-8">
          <h1 className="text-lg font-semibold">{t("auth.callback.stuckTitle")}</h1>
          <p className="mt-2 text-sm text-ink-2">
            {t("auth.callback.stuckBody")}
          </p>
          <a href={withBase("/login")} className="btn btn-primary mt-6">
            {t("auth.callback.backToLogin")}
          </a>
        </div>
      </main>
    );
  }

  return <Waiting />;
}

function Waiting() {
  const t = useT();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
      <p className="mt-4 text-sm text-ink-3">{t("auth.callback.signingIn")}</p>
    </main>
  );
}
