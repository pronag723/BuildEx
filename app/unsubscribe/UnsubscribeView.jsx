"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — one-click unsubscribe from message emails
// Opened from the link at the bottom of every message email:
//   /unsubscribe/?token=<user id>.<signature>
// No sign-in: the email-unsubscribe Edge Function checks the token's signature
// and turns profiles.email_on_message off. The visit itself is the click, so
// the request goes out on load; the undo button turns emails back on with the
// same token, in case a link scanner or a slip of the finger got here first.
//
// The token is read from window.location rather than useSearchParams, so the
// static export needs no Suspense boundary for it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import AuthShell from "../auth/components/AuthShell";
import { changeEmailSubscription } from "../../lib/notifications/emailSettings";
import { Icon } from "../../lib/icons";
import { useT } from "../../lib/i18n/LanguageProvider";
import { withBase } from "../home/utils";

// "working" → "unsubscribed" ⇄ "resubscribed", or "invalid" / "error".
export default function UnsubscribeView() {
  const t = useT();
  const [state, setState] = useState("working");
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef("");
  const lastActionRef = useRef("unsubscribe");

  const run = useCallback(async (action) => {
    lastActionRef.current = action;
    setBusy(true);
    const { error } = await changeEmailSubscription(tokenRef.current, action);
    setBusy(false);
    if (error) {
      setState(error.code === "invalid_token" ? "invalid" : "error");
      return;
    }
    setState(action === "resubscribe" ? "resubscribed" : "unsubscribed");
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setState("invalid");
      return;
    }
    tokenRef.current = token;
    run("unsubscribe");
  }, [run]);

  const settingsLink = (
    <a href={withBase("/account/?section=danger")} className="btn btn-secondary">
      {t("notifications.unsubscribe.settings")}
    </a>
  );

  if (state === "working") {
    return (
      <AuthShell>
        <div className="card flex flex-col items-center p-8 text-center">
          <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
          <p className="mt-4 text-sm text-ink-3" role="status">
            {t("notifications.unsubscribe.working")}
          </p>
        </div>
      </AuthShell>
    );
  }

  const copy = {
    unsubscribed: ["doneTitle", "doneBody"],
    resubscribed: ["resubscribedTitle", "resubscribedBody"],
    invalid: ["invalidTitle", "invalidBody"],
    error: ["errorTitle", "errorBody"],
  }[state];
  const ok = state === "unsubscribed" || state === "resubscribed";

  return (
    <AuthShell>
      <div className="card p-8">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${
            ok ? "bg-accent/10 text-accent-ink" : "bg-danger/10 text-danger"
          }`}
          aria-hidden="true"
        >
          <Icon name={ok ? "mail" : "close"} size={20} />
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          {t(`notifications.unsubscribe.${copy[0]}`)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2" role="status">
          {t(`notifications.unsubscribe.${copy[1]}`)}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {state === "unsubscribed" && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run("resubscribe")}>
              {busy && <span className="h-3.5 w-3.5 rounded-full border-2 border-accent-fg/30 border-t-accent-fg animate-spin" />}
              {t("notifications.unsubscribe.undo")}
            </button>
          )}
          {state === "resubscribed" && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run("unsubscribe")}>
              {busy && <span className="h-3.5 w-3.5 rounded-full border-2 border-line/20 border-t-ink animate-spin" />}
              {t("notifications.unsubscribe.unsubscribeAgain")}
            </button>
          )}
          {state === "error" && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(lastActionRef.current)}>
              {t("common.tryAgain")}
            </button>
          )}
          {settingsLink}
          {ok && (
            <a href={withBase("/")} className="btn btn-ghost">
              {t("notifications.unsubscribe.browse")}
            </a>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
