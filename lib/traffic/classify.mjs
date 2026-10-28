// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Where did this visit come from?
//
// Turns a landing URL and document.referrer into the "touch" that
// record_site_visit / record_signup_source store (migration 0111):
//
//   { channel, source, medium, campaign, referrer_host, landing_path }
//
// channel is one of:
//   campaign — a tagged link: ?ref=, utm_*, or an ad click id (gclid, yclid)
//   search   — a search engine (Google, Yandex, Bing, …)
//   social   — a social network or messenger (Telegram, VK, YouTube, …)
//   referral — any other site
//   direct   — no referrer and no tag (typed, bookmarked, or an app such as
//              Telegram that does not send one — which is why ad links need
//              a ?ref=)
//
// `source` is a stable short name ("google" for google.com and google.ru
// alike) so the console groups them; an unknown site keeps its bare host.
//
// Plain .mjs with no browser globals, so `node --test` covers it.
// ─────────────────────────────────────────────────────────────────────────────

// [names a host may end with, source name]. Matched on whole labels, so
// "google.com" matches "www.google.com" but not "notgoogle.com".
const SEARCH = [
  [["googlequicksearchbox"], "google"], // the Android Google app's referrer
  [["yandex.ru", "yandex.com", "yandex.by", "yandex.kz", "yandex.ua", "yandex.com.tr", "ya.ru"], "yandex"],
  [["bing.com"], "bing"],
  [["duckduckgo.com"], "duckduckgo"],
  [["search.yahoo.com", "yahoo.com"], "yahoo"],
  [["ecosia.org"], "ecosia"],
  [["search.brave.com"], "brave"],
  [["baidu.com"], "baidu"],
  [["go.mail.ru"], "mail.ru"],
  [["naver.com"], "naver"],
  [["qwant.com"], "qwant"],
  [["startpage.com"], "startpage"],
];

const SOCIAL = [
  [["t.me", "telegram.me", "telegram.org"], "telegram"],
  [["vk.com", "vk.ru", "vkontakte.ru"], "vk"],
  [["youtube.com", "youtu.be"], "youtube"],
  [["reddit.com"], "reddit"],
  [["discord.com", "discord.gg", "discordapp.com"], "discord"],
  [["twitter.com", "x.com", "t.co"], "x"],
  [["tiktok.com"], "tiktok"],
  [["instagram.com"], "instagram"],
  [["facebook.com", "fb.com"], "facebook"],
  [["ok.ru"], "ok"],
  [["dzen.ru"], "dzen"],
  [["twitch.tv"], "twitch"],
  [["pinterest.com"], "pinterest"],
  [["linkedin.com", "lnkd.in"], "linkedin"],
  [["threads.net"], "threads"],
  [["whatsapp.com"], "whatsapp"],
];

// Google's many country domains (google.ru, google.co.uk, …) don't fit a
// suffix list; mail.google.com and accounts.google.com are not search.
const GOOGLE_SEARCH = /(?:^|\.)google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/;
const GOOGLE_NOT_SEARCH = /^(?:mail|accounts|docs|drive|play|news)\.google\./;

function endsWithLabel(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function lookup(host, table) {
  for (const [domains, name] of table) {
    if (domains.some((d) => endsWithLabel(host, d))) return name;
  }
  return null;
}

// "https://www.Example.com/x" → "example.com"; "android-app://com.foo/" →
// "com.foo"; anything unparsable → null.
export function referrerHost(referrer) {
  if (!referrer || typeof referrer !== "string") return null;
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(referrer.trim());
  if (!match) return null;
  return match[1].toLowerCase().replace(/^www\./, "") || null;
}

// A tag value: lower-case, trimmed, only the characters a label needs.
export function cleanLabel(value, max = 80) {
  if (value == null) return null;
  const out = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё._~@+-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
  return out || null;
}

// The landing page as the console lists it: trailing slash dropped, and a
// builder profile named by its handle ("/builders/profile/@steve"), because
// "which builder's link brought people in" is the question there.
export function landingPath(pathname, searchParams) {
  let path = String(pathname || "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path === "/builders/profile") {
    const handle = cleanLabel(searchParams?.get?.("u"), 40);
    if (handle) path = `${path}/@${handle}`;
  }
  return path.slice(0, 200);
}

/**
 * Classify one visit.
 *   href     — the landing URL (location.href)
 *   referrer — document.referrer ("" when none)
 *   host     — this site's host (location.host)
 * Returns the touch, or null when the visit came from BuildEx itself (a
 * reload or a link opened in a new tab), which is not a new arrival.
 */
export function classifyVisit({ href, referrer, host }) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const params = url.searchParams;
  const ownHost = String(host || url.host).toLowerCase().replace(/^www\./, "");
  const refHost = referrerHost(referrer);

  if (refHost && refHost === ownHost) return null;

  const base = {
    medium: null,
    campaign: null,
    referrer_host: refHost,
    landing_path: landingPath(url.pathname, params),
  };

  const utmSource = cleanLabel(params.get("utm_source"));
  const ref = cleanLabel(params.get("ref"));
  if (utmSource || ref) {
    return {
      ...base,
      channel: "campaign",
      source: utmSource || ref,
      medium: cleanLabel(params.get("utm_medium")),
      // With both, ?ref= is the more specific label (one post, one channel).
      campaign: cleanLabel(params.get("utm_campaign"), 120) || (utmSource && ref ? ref : null),
    };
  }
  if (params.get("gclid")) {
    return { ...base, channel: "campaign", source: "google", medium: "cpc" };
  }
  if (params.get("yclid")) {
    return { ...base, channel: "campaign", source: "yandex", medium: "cpc" };
  }

  if (refHost) {
    if (GOOGLE_SEARCH.test(refHost) && !GOOGLE_NOT_SEARCH.test(refHost)) {
      return { ...base, channel: "search", source: "google" };
    }
    const search = lookup(refHost, SEARCH);
    if (search) return { ...base, channel: "search", source: search };
    const social = lookup(refHost, SOCIAL);
    if (social) return { ...base, channel: "social", source: social };
    return { ...base, channel: "referral", source: refHost };
  }

  // Facebook tags every outbound link, organic ones included, and often sends
  // no referrer.
  if (params.get("fbclid")) {
    return { ...base, channel: "social", source: "facebook" };
  }

  return { ...base, channel: "direct", source: null };
}

// mobile / tablet / desktop from the user agent. iPadOS reports itself as a
// Mac, so a touch-capable "Macintosh" counts as a tablet.
export function deviceClass(userAgent, maxTouchPoints = 0) {
  const ua = String(userAgent || "");
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "tablet";
  if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

// Crawlers that run JavaScript (Googlebot does) and automation.
export function looksAutomated(userAgent, webdriver = false) {
  if (webdriver) return true;
  return /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|vkshare/i.test(
    String(userAgent || "")
  );
}

// Which touch to keep for sign-up attribution: a tagged or referred arrival
// replaces whatever was kept before; a direct one never replaces anything.
// That is "last non-direct touch" — the usual rule for judging an ad, since
// someone who saw the ad and came back by typing the address still counts.
export function shouldReplaceTouch(stored, next) {
  if (!next) return false;
  if (!stored) return true;
  return next.channel !== "direct";
}
