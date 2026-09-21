// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder contact / social links
//
// A builder can publish up to CONTACT_LINKS_MAX ways to reach them off
// platform. They are stored on builder_profiles.contact_links as a jsonb
// object keyed by platform, e.g.
//   { "discord": "pixelforge", "youtube": "@pixelforge", "other": "https://pixelforge.dev" }
//
// SECURITY. These values are typed by one user and rendered on a public
// profile, which makes them a phishing and XSS surface. Three rules, enforced
// here and mirrored by the CHECK constraint in the migrations:
//
//   1. Only the keys in PLATFORMS, only string values, one value per key.
//   2. A value is either a bare handle or a plain `https://` URL — never
//      javascript:, data:, mailto:, a scheme-relative `//host`, or anything
//      with whitespace or the quote/angle characters that break out of an
//      HTML attribute. A branded platform additionally only accepts URLs on
//      that platform's own hosts, so a "YouTube" button cannot point at
//      somewhere else.
//   3. Anything else is rejected outright rather than escaped or patched up.
//
// Rendering rules live with the data because they are part of the same
// contract: `contactLinkHref` returns a URL only for values it can safely turn
// into one, and returns null otherwise so the caller prints text instead of an
// anchor. Callers that render an anchor must pass
// rel="noopener noreferrer nofollow".
//
// ICONS. lucide (our only icon family — see lib/icons.jsx) ships no brand
// marks, so each platform borrows the closest semantic glyph. That is a
// deliberate trade: one coherent family beats eight mismatched logos.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTACT_LINK_MAX = 200;
// One per platform in PLATFORMS. This was 6 while PLATFORMS had 8 entries, so
// the last two a builder picked were silently dropped on save even though the
// dropdown offered them and the SQL CHECK constraint allowed them. Keep the two
// in step: the cap is "all of them", not a separate number.
export const CONTACT_LINKS_MAX = 8;

// A plain https:// URL: host, optional port, optional path. No credentials
// (`user:pass@`), no whitespace, and none of the characters that could escape
// an HTML attribute if this ever reaches a non-React renderer.
const HTTPS_URL =
  /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+(?::[0-9]{1,5})?(?:\/[^\s"'<>\\`]*)?$/;

// Each platform declares how to recognise a bare handle, which URLs belong to
// it, and how to turn a handle into a link.
//   handlePrefix    — what a normalized handle DISPLAYS as, so "@name" and
//                     "name" both settle on one form.
//   urlHandlePrefix — what that handle looks like inside the platform's URL.
// The two differ more often than not: Telegram shows "@name" but links to
// t.me/name, while YouTube shows AND links "@name". Getting this wrong
// produces a plausible-looking dead link, so they are declared separately
// rather than derived from each other.
// Keep this table and the SQL CHECK constraint in step.
const PLATFORMS = [
  {
    key: "discord",
    label: "Discord",
    icon: "chat",
    handle: /^[A-Za-z0-9._]{2,32}(?:#[0-9]{4})?$/,
    handlePrefix: "",
    url: /^https:\/\/(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9-]{1,64}$/,
    // A Discord username is not addressable by URL — it stays plain text.
    baseUrl: null,
    placeholder: "yourname or https://discord.gg/abc123",
    hint: "Your Discord username, or an invite link to your server.",
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "send",
    handle: /^@[A-Za-z0-9_]{5,32}$/,
    handlePrefix: "@",
    urlHandlePrefix: "",
    url: /^https:\/\/(?:t\.me|telegram\.me)\/[A-Za-z0-9_]{5,32}$/,
    baseUrl: "https://t.me/",
    placeholder: "@yourname",
    hint: "Your @username, or the t.me link to your profile.",
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: "play",
    handle: /^@[A-Za-z0-9._-]{3,30}$/,
    handlePrefix: "@",
    urlHandlePrefix: "@",
    url: /^https:\/\/(?:(?:www\.|m\.)?youtube\.com|youtu\.be)\/[A-Za-z0-9@._\-/]{1,80}$/,
    baseUrl: "https://www.youtube.com/",
    placeholder: "@yourchannel",
    hint: "Your @channel handle, or a youtube.com link.",
  },
  {
    key: "twitch",
    label: "Twitch",
    icon: "video",
    handle: /^[A-Za-z0-9_]{4,25}$/,
    handlePrefix: "",
    urlHandlePrefix: "",
    url: /^https:\/\/(?:www\.)?twitch\.tv\/[A-Za-z0-9_]{4,25}$/,
    baseUrl: "https://twitch.tv/",
    placeholder: "yourchannel",
    hint: "Your Twitch channel name.",
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: "music",
    handle: /^@[A-Za-z0-9._]{2,24}$/,
    handlePrefix: "@",
    urlHandlePrefix: "@",
    url: /^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]{2,24}$/,
    baseUrl: "https://www.tiktok.com/",
    placeholder: "@yourname",
    hint: "Your @username on TikTok.",
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: "camera",
    handle: /^@[A-Za-z0-9._]{1,30}$/,
    handlePrefix: "@",
    urlHandlePrefix: "",
    url: /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/,
    baseUrl: "https://instagram.com/",
    placeholder: "@yourname",
    hint: "Your @username on Instagram.",
  },
  {
    key: "x",
    label: "X / Twitter",
    icon: "at",
    handle: /^@[A-Za-z0-9_]{1,15}$/,
    handlePrefix: "@",
    urlHandlePrefix: "",
    url: /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]{1,15}$/,
    baseUrl: "https://x.com/",
    placeholder: "@yourname",
    hint: "Your @username on X.",
  },
  {
    key: "other",
    label: "Website",
    icon: "link",
    // Anything else the builder wants to link. URL only — a bare word here
    // would be meaningless, and any host is allowed, so this key gets no
    // impersonation protection beyond the URL being shown in full.
    handle: null,
    handlePrefix: "",
    url: HTTPS_URL,
    baseUrl: null,
    placeholder: "https://yoursite.com",
    hint: "Any other page clients should see. Must start with https://.",
  },
];

export const CONTACT_LINK_TYPES = PLATFORMS.map(
  ({ key, label, icon, placeholder, hint }) => ({ key, label, icon, placeholder, hint })
);

export const CONTACT_LINK_KEYS = PLATFORMS.map((p) => p.key);

function platform(type) {
  return PLATFORMS.find((p) => p.key === type) || null;
}

export function contactLinkTypeMeta(type) {
  const p = platform(type);
  return p ? { key: p.key, label: p.label, icon: p.icon, placeholder: p.placeholder, hint: p.hint } : null;
}

/**
 * Canonicalizes what the user typed before validating it: trims, lowercases
 * the scheme of a URL so `HTTPS://` still passes, and settles a handle on the
 * platform's own prefix so "name" and "@name" store identically.
 */
export function normalizeContactLink(type, raw) {
  const p = platform(type);
  let value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.length > CONTACT_LINK_MAX) value = value.slice(0, CONTACT_LINK_MAX);

  // Case-normalize the scheme so "HTTPS://Example.com/Path" passes. The path
  // is left alone because paths are case-sensitive.
  value = value.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)/, (m) => m.toLowerCase());

  if (!p || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return value;

  // Not a URL, so it is meant as a handle — apply the platform's prefix.
  if (!p.handle) return value;
  const bare = value.replace(/^@+/, "");
  if (!bare) return "";
  return `${p.handlePrefix}${bare}`;
}

/**
 * @returns {string|null} an error message, or null when the value is allowed.
 * An empty value is allowed — every link is optional.
 */
export function contactLinkError(type, raw) {
  const p = platform(type);
  if (!p) return "Pick where clients should reach you.";
  const value = normalizeContactLink(type, raw);
  if (!value) return null;
  if (value.length > CONTACT_LINK_MAX) return `Keep it under ${CONTACT_LINK_MAX} characters.`;

  if (p.url.test(value)) return null;
  if (p.handle && p.handle.test(value)) return null;

  if (!p.handle) {
    return "Enter a full link starting with https:// — other kinds of links aren't allowed.";
  }
  return `That doesn't look like a ${p.label} ${p.handlePrefix === "@" ? "@username" : "username"} or link.`;
}

export function isValidContactLink(type, raw) {
  const value = normalizeContactLink(type, raw);
  return Boolean(value) && contactLinkError(type, value) === null;
}

/**
 * Turns the editor's list of { type, value } rows into the jsonb object we
 * store. Invalid and empty rows are dropped, later duplicates of a platform
 * lose to the first, and the result is capped at CONTACT_LINKS_MAX.
 */
export function buildContactLinks(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Object.keys(out).length >= CONTACT_LINKS_MAX) break;
    const type = row?.type;
    if (!platform(type) || out[type] !== undefined) continue;
    const value = normalizeContactLink(type, row?.value);
    if (!value || !isValidContactLink(type, value)) continue;
    out[type] = value;
  }
  return out;
}

/**
 * Reads the stored jsonb back into an ordered list, dropping anything that no
 * longer validates. Rows written before this validation existed, or under a
 * key we do not know, simply read as absent. Order follows PLATFORMS so the
 * buttons are in the same sequence on every profile.
 */
export function readContactLinks(contactLinks) {
  if (!contactLinks || typeof contactLinks !== "object" || Array.isArray(contactLinks)) {
    return [];
  }
  const out = [];
  for (const p of PLATFORMS) {
    const value = contactLinks[p.key];
    if (typeof value !== "string") continue;
    const normalized = normalizeContactLink(p.key, value);
    if (!normalized || !isValidContactLink(p.key, normalized)) continue;
    out.push({
      type: p.key,
      value: normalized,
      label: p.label,
      icon: p.icon,
      href: contactLinkHref(p.key, normalized),
      text: contactLinkText(p.key, normalized),
    });
    if (out.length >= CONTACT_LINKS_MAX) break;
  }
  return out;
}

/**
 * The https:// URL this link should open, or null when there is no safe one
 * (a Discord username, for example). A null href means "render as text" —
 * callers must not invent one.
 */
export function contactLinkHref(type, value) {
  const p = platform(type);
  if (!p) return null;
  const v = normalizeContactLink(type, value);
  if (!v || !isValidContactLink(type, v)) return null;
  if (p.url.test(v)) return v;
  // A handle we know how to address.
  if (p.baseUrl && p.handle && p.handle.test(v)) {
    const bare = v.replace(/^@+/, "");
    const built = `${p.baseUrl}${p.urlHandlePrefix || ""}${bare}`;
    // Belt and braces: a URL we built ourselves still has to pass the same
    // check a pasted one would. If the table and the pattern ever disagree we
    // fall back to plain text rather than publish a dead or wrong link.
    return p.url.test(built) && HTTPS_URL.test(built) ? built : null;
  }
  return null;
}

/** Human-readable label, e.g. "@pixelforge" or "pixelforge.dev". */
export function contactLinkText(type, value) {
  const v = normalizeContactLink(type, value);
  if (!v) return "";
  if (!/^https:\/\//.test(v)) return v;
  return v.replace(/^https:\/\/(?:www\.)?/, "").replace(/\/$/, "");
}
