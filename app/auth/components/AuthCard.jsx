"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { resolvePostLoginPath, sanitizeRedirect } from "../../../lib/auth/redirects";
import { friendlyAuthError } from "../../../lib/auth/errors";
import { withBase } from "../../home/utils";
import OAuthButton from "./OAuthButton";

export default function AuthCard({ mode = "login" }) {
  const router = useRouter();
  const { status, configured, profile, profileLoaded, signInWithDiscord, signInWithGoogle } = useAuth();

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

  // If a signed-in user lands on /login or /signup, route them onward
  // IMMEDIATELY without waiting on the auth provider's profile fetch — that
  // round-trip can take seconds and used to make "login" feel frozen.
  //
  // If the profile is already cached we use it to pick the final target;
  // otherwise we send the user through /onboarding, which has its own
  // OnboardingGate that decides whether to forward them onward (completed
  // users → /account or the original redirect target) or keep them in the
  // flow. That extra hop is a no-op for completed users and is far faster
  // than blocking on profileLoaded here.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (profileLoaded) {
      const next = resolvePostLoginPath(profile, redirectTarget);
      router.replace(withBase(next));
      return;
    }
    const next =
      redirectTarget && redirectTarget !== "/"
        ? `/onboarding?redirect=${encodeURIComponent(redirectTarget)}`
        : "/onboarding";
    router.replace(withBase(next));
  }, [status, profile, profileLoaded, redirectTarget, router]);

  async function handleSignIn(provider) {
    if (pending) return;
    setError(null);
    setPending(provider);

    const fn = provider === "discord" ? signInWithDiscord : signInWithGoogle;
    const { error: signInError } = await fn({ redirect: redirectTarget });

    if (signInError) {
      setError(friendlyAuthError(signInError));
      setPending(null);
    }
  }

  const isJoin = mode === "signup";
  const title = isJoin ? "Join BuildEx" : "Welcome back";
  const subtitle = isJoin
    ? "Create your account in seconds. Pick your role after — buyer, builder, or both."
    : "Sign in to manage your offers, orders, and messages.";
  const altCtaText = isJoin ? "Already have an account?" : "New to BuildEx?";
  const altCtaLink = isJoin ? "/login" : "/signup";
  const altCtaLabel = isJoin ? "Log in" : "Create an account";

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

        <div className="mt-8 flex items-center gap-3">
          <span className="flex-1 h-px bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-gray-500">More options soon</span>
          <span className="flex-1 h-px bg-white/10" />
        </div>

        <div className="mt-4 text-center text-xs text-gray-500">
          Email login, account linking, and 2FA are on the roadmap.
        </div>

        <p className="mt-8 text-center text-sm text-gray-400">
          {altCtaText}{" "}
          <a
            href={withBase(altCtaLink)}
            className="text-[#4ade80] font-medium hover:underline"
          >
            {altCtaLabel}
          </a>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-gray-500 px-4">
        By continuing you agree to BuildEx&apos;s{" "}
        <a href={withBase("/")} className="underline hover:text-gray-300">
          Terms
        </a>{" "}
        and{" "}
        <a href={withBase("/")} className="underline hover:text-gray-300">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
