"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useIsBuilder } from "../../../lib/auth/useIsBuilder";
import { BUILDER_ONBOARDING_START } from "../../../lib/onboarding/state";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// "Are you a builder?" in the feed. Signing in lands everyone on the feed now
// (lib/auth/redirects.js), so this is where a new builder finds the way into
// onboarding: a banner above the grid until it is dismissed, then a slim
// reminder inside the grid. Guests see it too — onboarding sends them through
// /login and back. Builders never see either.
//
// Dismissal is remembered per browser only; losing it just shows the banner
// once more.

const DISMISS_KEY = "bx-builder-prompt";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "dismissed";
  } catch {
    return false;
  }
}

/** Which prompt the feed shows: "banner", "inline", or null for none. */
export function useBuilderPrompt() {
  const isBuilder = useIsBuilder();
  // null until read after mount, so the static render never flashes a banner
  // at someone who already closed it.
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "dismissed");
    } catch {}
  }, []);

  let mode = null;
  if (isBuilder === false && dismissed !== null) mode = dismissed ? "inline" : "banner";
  return { mode, dismiss };
}

export function BecomeBuilderBanner({ onDismiss }) {
  const t = useT();
  return (
    <section className="card !border-accent/25 relative mt-5 flex flex-col gap-3 p-4 pr-12 sm:flex-row sm:items-center sm:gap-4 sm:p-5 sm:pr-14">
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-ink" aria-hidden="true">
        <Icon name="hammer" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{t("catalog.builderPrompt.title")}</h2>
        <p className="mt-0.5 text-sm text-ink-2">{t("catalog.builderPrompt.body")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={BUILDER_ONBOARDING_START} className="btn btn-primary">
          {t("catalog.builderPrompt.cta")}
        </Link>
        <button type="button" onClick={onDismiss} className="btn btn-ghost">
          {t("catalog.builderPrompt.dismiss")}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="btn btn-ghost btn-icon absolute right-2 top-2"
        aria-label={t("catalog.builderPrompt.hide")}
      >
        <Icon name="close" size={16} />
      </button>
    </section>
  );
}

/** The reminder that takes a full row inside the grid once the banner is gone. */
export function BecomeBuilderInline() {
  const t = useT();
  return (
    <div className="card col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5 lg:col-span-3">
      <p className="min-w-0 text-sm text-ink-2">
        <span className="font-semibold text-ink">{t("catalog.builderPrompt.inlineLead")}</span>{" "}
        {t("catalog.builderPrompt.inlineBody")}
      </p>
      <Link href={BUILDER_ONBOARDING_START} className="btn btn-secondary btn-sm flex-shrink-0">
        {t("catalog.builderPrompt.inlineCta")}
        <Icon name="arrowRight" size={14} />
      </Link>
    </div>
  );
}
