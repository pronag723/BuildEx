"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useIsBuilder } from "../../../lib/auth/useIsBuilder";
import { BUILDER_ONBOARDING_START } from "../../../lib/onboarding/state";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// "Are you a builder?" in the feed. Signing in lands everyone on the feed now
// (lib/auth/redirects.js), so this is where a new builder finds the way into
// onboarding: a banner above the grid until it is dismissed, then a slim
// reminder inside the grid. Guests see it too — onboarding sends them through
// /login and back. Builders never see either, and neither do accounts that
// aren't new: anyone who signed up before the prompt shipped, or more than a
// week ago, has already made their choice (the menus still offer it).
//
// Dismissal is remembered per browser only; losing it just shows the banner
// once more.

const DISMISS_KEY = "bx-builder-prompt";
const PROMPT_SHIPPED_AT = Date.parse("2026-10-28T22:00:00Z");
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

function isNewAccount(createdAt, now = Date.now()) {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created >= PROMPT_SHIPPED_AT && now - created < NEW_ACCOUNT_MS;
}

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "dismissed";
  } catch {
    return false;
  }
}

/** Which prompt the feed shows: "banner", "inline", or null for none. */
export function useBuilderPrompt() {
  const { status, user } = useAuth();
  const isBuilder = useIsBuilder();
  const eligible = status !== "authenticated" || isNewAccount(user?.created_at);
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
  if (eligible && isBuilder === false && dismissed !== null) mode = dismissed ? "inline" : "banner";
  return { mode, dismiss };
}

// Kept small on purpose: on a phone it sits in the first screen above the
// cards, so it is three short lines (title, one sentence, two small buttons)
// rather than a hero block that pushes the builders out of view.
export function BecomeBuilderBanner({ onDismiss }) {
  const t = useT();
  return (
    <section className="card !border-accent/25 relative mt-4 p-3 pr-11 sm:mt-5 sm:flex sm:items-center sm:gap-4 sm:px-4 sm:pr-12">
      <div className="min-w-0 sm:flex-1">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug">
          <Icon name="hammer" size={15} className="flex-shrink-0 text-accent-ink" aria-hidden="true" />
          {t("catalog.builderPrompt.title")}
        </h2>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{t("catalog.builderPrompt.body")}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:flex-shrink-0">
        <Link href={BUILDER_ONBOARDING_START} className="btn btn-primary btn-sm">
          {t("catalog.builderPrompt.cta")}
        </Link>
        <button type="button" onClick={onDismiss} className="btn btn-ghost btn-sm">
          {t("catalog.builderPrompt.dismiss")}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="btn btn-ghost btn-icon absolute right-1.5 top-1.5 !h-8 !w-8 sm:top-1/2 sm:-translate-y-1/2"
        aria-label={t("catalog.builderPrompt.hide")}
      >
        <Icon name="close" size={15} />
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
        {t("catalog.builderPrompt.cta")}
        <Icon name="arrowRight" size={14} />
      </Link>
    </div>
  );
}
