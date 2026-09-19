// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Builder contact links
//
// A builder may publish ONE way to reach them outside BuildEx: a Discord
// username or invite, a Telegram handle or t.me link, or a single generic
// https:// link. It is stored on builder_profiles.contact_links as jsonb, e.g.
//   { "discord": "pixelforge" }   { "other": "https://pixelforge.dev" }
//
// SECURITY. This value is typed by one user and rendered to every visitor, so
// it is an open phishing / XSS surface. Three rules, all enforced here and
// mirrored by the CHECK constraint in 0098_builder_contact_links.sql:
//
//   1. Only the three keys below, only string values, one at a time.
//   2. A URL must be a plain `https://` URL — never javascript:, data:, mailto:
//      or a scheme-relative `//host`. A handle must be a bare handle.
//   3. Anything else is rejected outright rather than escaped or patched up.
//
// Rendering rules live with the data because they are part of the same
// contract: `contactLinkHref` returns a URL only for values that ARE a URL, so
// a bare handle is printed as text and can never become an anchor. Callers that
// do render an anchor must pass rel="noopener noreferrer nofollow".
// ─────────────────────────────────────────────────────────────────────────────

export const CONTACT_LINK_MAX = 200;

export const CONTACT_LINK_TYPES = [
  {
    key: "discord",
    label: "Discord",
    icon: "chat",
    placeholder: "yourname  ·  or  https://discord.gg/abc123",
    hint: "Your Discord username, or an invite link to your server.",
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "send",
    placeholder: "@yourname  ·  or  https://t.me/yourname",
    hint: "Your @username, or the t.me link to your profile.",
  },
  {
    key: "other",
    label: "Other link",
    icon: "link",
    placeholder: "https://yoursite.com",
    hint: "Any other page you want clients to reach you on. Must start with https://.",
  },
];

export const CONTACT_LINK_KEYS = CONTACT_LINK_TYPES.map((t) => t.key);

// A plain https:// URL: host, optional port, optional path. No credentials
// (`user:pass@`), no whitespace, no quote/angle characters that could break out
// of an attribute if this ever reaches a non-React renderer.
const HTTPS_URL =
  /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+(?::[0-9]{1,5})?(?:\/[^\s"'<>\`]*)?$/;

const DISCORD_HANDLE = /^[A-Za-z0-9._]{2,32}(?:#[0-9]{4})?$/;
const DISCORD_INVITE =
  /^https:\/\/(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9-]{1,64}$/;

const TELEGRAM_HANDLE = /^@[A-Za-z0-9_]{5,32}$/;
const TELEGRAM_URL = /^https:\/\/(?:t\.me|telegram\.me)\/[A-Za-z0-9_]{5,32}$/;

/**
 * Canonicalizes what the user typed before validating it: trims, drops a
 * leading `@` from a Discord name, adds one to a bare Telegram name, and
 * lowercases the scheme+host of a URL so `HTTPS://` still validates.
 */
export function normalizeContactLink(type, raw) {
  let value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.length > CONTACT_LINK_MAX) value = value.slice(0, CONTACT_LINK_MAX);

  // Case-normalize the scheme so "HTTPS://Example.com/Path" passes; the path is
  // left alone because paths are case-sensitive.
  value = value.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)/, (m) => m.toLowerCase());

  if (type === "discord") {
    if (/^https?:\/\//i.test(value)) return value;
    return value.replace(/^@+/, "");
  }
  if (type === "telegram") {
    if (/^https?:\/\//i.test(value)) return value;
    const handle = value.replace(/^@+/, "");
    return handle ? `@${handle}` : "";
  }
  return value;
}

/**
 * @returns {string|null} an error message, or null when the value is allowed.
 * An empty value is allowed — the contact link is optional.
 */
export function contactLinkError(type, raw) {
  const value = normalizeContactLink(type, raw);
  if (!value) return null;
  if (!CONTACT_LINK_KEYS.includes(type)) return "Pick where clients should reach you.";
  if (value.length > CONTACT_LINK_MAX) return `Keep it under ${CONTACT_LINK_MAX} characters.`;

  if (type === "discord") {
    if (DISCORD_HANDLE.test(value) || DISCORD_INVITE.test(value)) return null;
    return "Enter a Discord username (letters, numbers, . and _) or an https://discord.gg/… invite.";
  }
  if (type === "telegram") {
    if (TELEGRAM_HANDLE.test(value) || TELEGRAM_URL.test(value)) return null;
    return "Enter a Telegram @username (5–32 characters) or an https://t.me/… link.";
  }
  if (HTTPS_URL.test(value)) return null;
  return "Enter a full link starting with https:// — other kinds of links aren't allowed.";
}

export function isValidContactLink(type, raw) {
  const value = normalizeContactLink(type, raw);
  return Boolean(value) && contactLinkError(type, value) === null;
}

/**
 * Builds the jsonb value written to builder_profiles.contact_links. Returns an
 * empty object when there is nothing valid to store, so the column is never
 * left holding a half-typed value.
 */
export function buildContactLinks(type, raw) {
  const value = normalizeContactLink(type, raw);
  if (!value || !isValidContactLink(type, value)) return {};
  return { [type]: value };
}

/**
 * Reads a stored jsonb value back into { type, value }, dropping anything that
 * no longer validates. Rows written before this validation existed, or by a
 * future key we don't know, simply read as "no contact link".
 */
export function readContactLinks(contactLinks) {
  if (!contactLinks || typeof contactLinks !== "object" || Array.isArray(contactLinks)) {
    return { type: null, value: "" };
  }
  for (const key of CONTACT_LINK_KEYS) {
    const value = contactLinks[key];
    if (typeof value === "string" && isValidContactLink(key, value)) {
      return { type: key, value: normalizeContactLink(key, value) };
    }
  }
  return { type: null, value: "" };
}

/**
 * The https:// URL this contact link should open, or null when it is a bare
 * handle. A null href means "render as text" — callers must not invent one.
 */
export function contactLinkHref(type, value) {
  const v = normalizeContactLink(type, value);
  if (!v || !isValidContactLink(type, v)) return null;
  if (type === "telegram" && TELEGRAM_HANDLE.test(v)) {
    return `https://t.me/${v.slice(1)}`;
  }
  return HTTPS_URL.test(v) ? v : null;
}

/** Human-readable label for the link, e.g. "@pixelforge" or "pixelforge.dev". */
export function contactLinkText(type, value) {
  const v = normalizeContactLink(type, value);
  if (!v) return "";
  if (!HTTPS_URL.test(v)) return v;
  return v.replace(/^https:\/\//, "").replace(/\/$/, "");
}

export function contactLinkTypeMeta(type) {
  return CONTACT_LINK_TYPES.find((t) => t.key === type) || null;
}
