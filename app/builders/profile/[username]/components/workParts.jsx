"use client";

// Pieces shared by the three ways to look at one work: the desktop dialog, the
// phone work page and the phone feed.

import Link from "next/link";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { daysRange, formatCount, formatPrice } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";
import Avatar from "../../../../../lib/ui/Avatar";
import { publicAsset } from "../../../../home/utils";

const profileHref = (username) => `/builders/profile?u=${encodeURIComponent(username)}`;

/** Version / size / time, only the ones the builder filled in. */
export function WorkFacts({ work, tone = "raised" }) {
  const t = useT();
  const range = work.durationDays ? daysRange(work.durationDays, null) : null;
  const facts = [
    work.version && { key: "version", label: t("profile.viewer.version"), value: work.version },
    work.size && { key: "size", label: t("profile.viewer.size"), value: work.size },
    range && {
      key: "duration",
      label: t("profile.viewer.duration"),
      value: t("profile.prices.days", { count: range.count, range: range.text }),
    },
  ].filter(Boolean);
  if (facts.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {facts.map((fact) => (
        <div key={fact.key} className={`min-w-0 rounded-xl p-2.5 ${tone === "raised" ? "bg-raised" : "border border-line/[0.08] bg-surface"}`}>
          <p className="text-[11px] text-ink-3">{fact.label}</p>
          <p className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">{fact.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Co-authors: BuildEx builders link to their profile; others read "feat. …". */
export function WorkCoauthors({ work }) {
  const t = useT();
  if (work.coauthors.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-3">{t("profile.viewer.coauthors")}</p>
      <ul className="mt-2 space-y-1.5">
        {work.coauthors.map((c) => {
          const name = c.profile ? c.profile.displayName : t("profile.viewer.feat", { name: c.name });
          const body = (
            <>
              <Avatar
                src={c.profile?.avatarUrl ? publicAsset(c.profile.avatarUrl) : null}
                name={c.profile ? c.profile.displayName : c.name}
                size={30}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{name}</span>
                {c.role && <span className="block truncate text-xs text-ink-3">{c.role}</span>}
              </span>
              {c.profile && <Icon name="chevronRight" size={16} className="text-ink-3" />}
            </>
          );
          return (
            <li key={c.id}>
              {c.profile ? (
                <Link href={profileHref(c.profile.username)} className="flex items-center gap-2.5 rounded-xl bg-raised px-2.5 py-2 transition-colors hover:bg-line/[0.08]">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl bg-raised px-2.5 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Discuss a similar build · from $150" — the price only when a tier is linked. */
export function discussLabel(tier, t) {
  return tier
    ? t("profile.viewer.discussFrom", { price: formatPrice(tier.priceFromCents, t.lang) })
    : t("profile.viewer.discuss");
}

export function LikeButton({ like, onToggle, className = "", size = 18, showCount = true }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={like.liked}
      aria-label={like.liked ? t("profile.viewer.unlike") : t("profile.viewer.like")}
      className={className}
    >
      <Icon name="heart" size={size} filled={like.liked} className={like.liked ? "text-[rgb(var(--heart))]" : ""} />
      {showCount && <span>{formatCount(like.likes, t.lang)}</span>}
    </button>
  );
}

/** "9.8K views" for a work. */
export function viewsLabel(work, t) {
  return t("profile.viewsMeta", { count: work.views, n: formatCount(work.views, t.lang) });
}
