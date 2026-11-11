"use client";

// Small pieces that show a contest's state: running ("until 20 Nov") or
// ended, official when a moderator pinned it, and its prize.

import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDate } from "../../../lib/i18n/format.mjs";
import { Icon } from "../../../lib/icons";

export function contestEnded(endsAt) {
  return Boolean(endsAt) && new Date(endsAt).getTime() <= Date.now();
}

/** "Until 20 Nov" / "Ended", plus "Official" when pinned. */
export function ContestBadges({ endsAt, official = false, prize = null }) {
  const t = useT();
  const ended = contestEnded(endsAt);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {official && (
        <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">
          <Icon name="verified" size={12} />
          {t("community.contest.official")}
        </span>
      )}
      {endsAt && (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${ended ? "text-ink-3" : "text-accent-ink"}`}>
          <Icon name="clock" size={12} />
          {ended ? t("community.contest.ended") : t("community.contest.until", { date: formatDate(endsAt, t.lang, { day: "numeric", month: "short" }) })}
        </span>
      )}
      {prize && (
        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-2">
          <Icon name="trophy" size={12} className="flex-shrink-0" />
          <span className="truncate">{prize}</span>
        </span>
      )}
    </span>
  );
}
