"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { resolvePostLoginPath, sanitizeRedirect } from "../../../lib/auth/redirects";
import { friendlyAuthError } from "../../../lib/auth/errors";
import { withBase } from "../../home/utils";
import OAuthButton from "./OAuthButton";
import { stageAccountAcceptance } from "../../../lib/legal/api";
import { useT } from "../../../lib/i18n/LanguageProvider";

export default function AuthCard() {
  const router = useRouter();
  const { status, configured, profile, signInWithDiscord, signInWithGoogle } = useAuth();
  const t = useT();

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

  const title = t("auth.title");
  const subtitle = t("auth.subtitle");

  return (
    <div>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{subtitle}</p>

        {!configured && (
          <div className="mt-6 auth-banner auth-banner-warning">
            {t.rich("auth.notConfigured", {
              url: <code>NEXT_PUBLIC_SUPABASE_URL</code>,
              key: <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
              file: <code>.env.local</code>,
            })}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-6 auth-banner auth-banner-error">
            {error}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-2.5">
          <OAuthButton
            provider="discord"
            onClick={() => handleSignIn("discord")}
            loading={pending === "discord"}
            disabled={!configured || (pending && pending !== "discord")}
          >
            {t("auth.continueWith", { provider: "Discord" })}
          </OAuthButton>
          <OAuthButton
            provider="google"
            onClick={() => handleSignIn("google")}
            loading={pending === "google"}
            disabled={!configured || (pending && pending !== "google")}
          >
            {t("auth.continueWith", { provider: "Google" })}
          </OAuthButton>
        </div>

        <p className="mt-5 text-xs leading-5 text-ink-3">
          {/* Consent copy lives in lib/i18n/messages/<lang>/auth.mjs ("By
              continuing you confirm you are at least 13…"); the two policy
              links are spliced into it here. */}
          {t.rich("auth.consent", {
            terms: <a href={withBase("/legal/terms/")} className="underline underline-offset-2 hover:text-ink">{t("auth.termsLink")}</a>,
            privacy: <a href={withBase("/legal/privacy/")} className="underline underline-offset-2 hover:text-ink">{t("auth.privacyLink")}</a>,
          })}
        </p>
      </div>

      <p className="mt-4 px-2 text-center text-xs leading-5 text-ink-3">{t("auth.acceptanceRecorded")}</p>
    </div>
  );
}
