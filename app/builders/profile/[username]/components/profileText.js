// Small text helpers shared by the profile header and sidebar. Each takes the
// page's `t` so the output follows the interface language.

import { experienceYears, relativeAgo } from "../../../../../lib/works/format.mjs";

/** "6 years building" / "Started building this year", or null when unset. */
export function experienceLabel(buildingSince, t) {
  const years = experienceYears(buildingSince);
  if (years == null) return null;
  if (years === 0) return t("profile.experienceNew");
  return t("profile.experience", { count: years });
}

/** "Online now", "Last seen 3 hours ago", or null when never seen. */
export function presenceLabel(online, lastSeenAt, t) {
  if (online) return t("card.onlineNow");
  if (!lastSeenAt) return null;
  return t("profile.lastSeen", { ago: relativeAgo(lastSeenAt, t.lang) });
}

/** "~15 min", "~2 h", "~1 d" for a median reply time in minutes. */
export function responseLabel(minutes, t) {
  if (minutes == null) return null;
  if (minutes < 60) return t("profile.stats.responseMinutes", { n: Math.max(1, Math.round(minutes)) });
  if (minutes < 60 * 24) return t("profile.stats.responseHours", { n: Math.round(minutes / 60) });
  return t("profile.stats.responseDays", { n: Math.round(minutes / (60 * 24)) });
}
