"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { resolvePostLoginPath, sanitizeRedirect } from "../../../lib/auth/redirects";
import { friendlyAuthError } from "../../../lib/auth/errors";
import { withBase } from "../../home/utils";
import OAuthButton from "./OAuthButton";
import { stageAccountAcceptance } from "../../../lib/legal/api";

export default function AuthCard() {
  const router = useRouter();
  const { status, configured, profile, signInWithDiscord, signInWithGoogle } = useAuth();

  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [redirectTarget, setRedirectTarget] = useState("/");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const target = sanitizeRedirect(params.get("redirect"));
    setRedirectTarget(target);

    const oauthError = params.get("error_description") || params.get("error");
    if (oauthError) {
      setError(friendlyAuthError(oauthError));
    }
  }, []);

  // A signed-in user who lands on /login goes straight back to wherever they
  // came from. There is no registration to detour through any more, so we don't
  // wait on the profile fetch — that round-trip can take seconds and used to
  // make "login" feel frozen.
  useEffect(() => {
    if (status !== "authenticated") return;
    router.replace(resolvePostLoginPath(profile, redirectTarget));
  }, [status, profile, redirectTarget, router]);

  async function handleSignIn(provider) {
    if (pending) return;
    setError(null);
    setPending(provider);
    stageAccountAcceptance();

    const fn = provider === "discord" ? signInWithDiscord : signInWithGoogle;
    const { error: signInError } = await fn({ redirect: redirectTarget });

    if (signInError) {
      setError(friendlyAuthError(signInError));
      setPending(null);
    }
  }

  const title = "Welcome to BuildEx";
  const subtitle = "One click and you're in. New here? Pick a provider — your account is created for you and you land right back where you were.";

  return (
    <div className="reveal active">
      <div className="glass rounded-3xl p-8 sm:p-10 border border-white/10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full text-xs mb-5">
            <span className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" />
            <span>Secure auth via Supabase</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2 logo-font">
            {title}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">{subtitle}</p>
        </div>

        {!configured && (
          <div className="mb-6 auth-banner auth-banner-warning">
            Authentication isn&apos;t configured yet. Add{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
            <code>.env.local</code> and restart the dev server.
          </div>
        )}

        {error && (
          <div role="alert" className="mb-6 auth-banner auth-banner-error">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <OAuthButton
            provider="discord"
            onClick={() => handleSignIn("discord")}
            loading={pending === "discord"}
            disabled={!configured || (pending && pending !== "discord")}
          >
            Continue with Discord
          </OAuthButton>
          <OAuthButton
            provider="google"
            onClick={() => handleSignIn("google")}
            loading={pending === "google"}
            disabled={!configured || (pending && pending !== "google")}
          >
            Continue with Google
          </OAuthButton>
        </div>

        <p className="mt-5 text-center text-xs leading-5 text-gray-400">
          By continuing you confirm you are at least 13 and have any consent required
          by local law, and you accept the{" "}
          <a href={withBase("/legal/terms/")} className="underline hover:text-white">Terms of Use</a>{" "}
          and acknowledge the{" "}
          <a href={withBase("/legal/privacy/")} className="underline hover:text-white">Privacy Policy</a>.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <span className="flex-1 h-px bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-gray-500">More options soon</span>
          <span className="flex-1 h-px bg-white/10" />
        </div>

        <div className="mt-4 text-center text-xs text-gray-500">
          Email login, account linking, and 2FA are on the roadmap.
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-gray-500 px-4">Your acceptance is recorded with the applicable policy versions when your account is created.</p>
    </div>
  );
}
