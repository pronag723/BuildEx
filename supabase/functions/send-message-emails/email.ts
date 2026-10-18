// The "you have an unread message" email, in the recipient's language.
//
// Email clients are a hostile place for CSS: no variables, no <style> that
// Gmail keeps reliably, Outlook rendering through Word. So this is tables and
// inline styles only, with the brand colours written out as hex. They are the
// LIGHT theme tokens from app/globals.css — an email reads on a white page.
//
// Everything a user typed (their display name, the message) is escaped before
// it goes near the HTML. The preview is text only: a photo becomes "Sent a
// photo", never an <img> pointing at user content.
//
// These strings live here rather than in lib/i18n: Edge Functions are bundled
// from supabase/functions/ alone and cannot import the site's dictionaries.
// Keep the two languages in step, as tests/message-emails.test.mjs checks.

export type EmailLocale = "en" | "ru";
export type PreviewKind = "text" | "photo" | "photo_caption";

export interface MessageEmailInput {
  locale: string | null | undefined;
  senderName: string | null | undefined;
  previewKind: string | null | undefined;
  previewText: string | null | undefined;
  unreadCount: number | null | undefined;
  chatUrl: string;
  unsubscribeUrl: string;
  settingsUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// app/globals.css, `.light` tokens.
const COLOR = {
  canvas: "#F0F1ED", // --canvas 240 241 237
  surface: "#FFFFFF", // --surface
  raised: "#F6F6F3", // --raised 246 246 243
  ink: "#111827", // --ink 17 24 39
  ink2: "#475569", // --ink-2 71 85 105
  ink3: "#5E6B7D", // --ink-3 94 107 125
  line: "#E9EAEC", // --line 15 23 42 at 9% over white (the .card border)
  accent: "#4ADE80", // --accent 74 222 128
  accentInk: "#15803D", // --accent-ink 21 128 61
  onAccent: "#052E16", // --on-accent 5 46 22
};

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const NAME_MAX = 60;
const PREVIEW_MAX = 160;

interface Strings {
  someone: string;
  subject: (name: string) => string;
  heading: (name: string, count: number) => string;
  photo: string;
  photoCaption: (caption: string) => string;
  button: string;
  linkFallback: string;
  why: string;
  unsubscribe: string;
  settings: string;
}

const ruPlural = new Intl.PluralRules("ru-RU");

export const STRINGS: Record<EmailLocale, Strings> = {
  en: {
    someone: "someone",
    subject: (name) => `New message from ${name} on BuildEx`,
    heading: (name, count) =>
      count > 1 ? `${count} new messages from ${name}` : `New message from ${name}`,
    photo: "Sent a photo",
    photoCaption: (caption) => `Photo · ${caption}`,
    button: "Open chat",
    linkFallback: "If the button doesn't work, copy this link into your browser:",
    why:
      "You're receiving this because someone messaged you on BuildEx and you haven't read it yet. We send at most one email per conversation until you open it.",
    unsubscribe: "Unsubscribe from message emails",
    settings: "Email settings",
  },
  ru: {
    // Genitive: it always follows «от».
    someone: "собеседника",
    subject: (name) => `Новое сообщение от ${name} на BuildEx`,
    heading: (name, count) => {
      if (count <= 1) return `Новое сообщение от ${name}`;
      switch (ruPlural.select(count)) {
        case "one":
          return `${count} новое сообщение от ${name}`;
        case "few":
          return `${count} новых сообщения от ${name}`;
        default:
          return `${count} новых сообщений от ${name}`;
      }
    },
    photo: "Отправлено фото",
    photoCaption: (caption) => `Фото · ${caption}`,
    button: "Открыть чат",
    linkFallback: "Если кнопка не работает, скопируйте ссылку в браузер:",
    why:
      "Вы получили это письмо, потому что вам написали на BuildEx, а сообщение ещё не прочитано. Мы присылаем не больше одного письма на разговор, пока вы его не откроете.",
    unsubscribe: "Отписаться от писем о сообщениях",
    settings: "Настройки писем",
  },
};

export function normalizeLocale(value: unknown): EmailLocale {
  return value === "ru" ? "ru" : "en";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Drop control characters and bidi overrides (which could make a name render
// as something it is not), collapse whitespace, cap the length.
export function cleanText(value: unknown, max: number): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function previewFor(input: MessageEmailInput, s: Strings): string {
  const kind = input.previewKind as PreviewKind;
  const caption = cleanText(input.previewText, PREVIEW_MAX);
  if (kind === "photo" || (kind === "photo_caption" && !caption)) return s.photo;
  if (kind === "photo_caption") return s.photoCaption(caption);
  return caption;
}

export function renderMessageEmail(input: MessageEmailInput): RenderedEmail {
  const locale = normalizeLocale(input.locale);
  const s = STRINGS[locale];
  const name = cleanText(input.senderName, NAME_MAX) || s.someone;
  const count = Math.max(1, Math.floor(Number(input.unreadCount) || 1));
  const preview = previewFor(input, s);

  const subject = s.subject(name);
  const heading = s.heading(name, count);

  const e = escapeHtml;
  const chatUrl = e(input.chatUrl);
  const unsubscribeUrl = e(input.unsubscribeUrl);
  const settingsUrl = e(input.settingsUrl);

  const previewBlock = preview
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-left:3px solid ${COLOR.accent};background-color:${COLOR.raised};border-radius:0 8px 8px 0;padding:12px 14px;font-family:${FONT};font-size:15px;line-height:1.5;color:${COLOR.ink2};word-break:break-word;">${e(preview)}</td>
              </tr>
            </table>`
    : "";

  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${e(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.canvas};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(preview || heading)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.canvas};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 16px;font-family:'Chakra Petch',${FONT};font-size:22px;font-weight:700;letter-spacing:-0.01em;color:${COLOR.ink};">build<span style="color:${COLOR.accentInk};">ex</span></td>
            </tr>
            <tr>
              <td style="background-color:${COLOR.surface};border:1px solid ${COLOR.line};border-radius:12px;padding:28px 28px 24px;">
                <h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:700;color:${COLOR.ink};">${e(heading)}</h1>
                ${previewBlock}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                  <tr>
                    <td style="border-radius:10px;background-color:${COLOR.accent};">
                      <a href="${chatUrl}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:${COLOR.onAccent};text-decoration:none;border-radius:10px;">${e(s.button)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLOR.ink3};">${e(s.linkFallback)}<br><a href="${chatUrl}" style="color:${COLOR.accentInk};word-break:break-all;">${chatUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLOR.ink3};">
                ${e(s.why)}<br>
                <a href="${unsubscribeUrl}" style="color:${COLOR.ink3};text-decoration:underline;">${e(s.unsubscribe)}</a>
                &nbsp;·&nbsp;
                <a href="${settingsUrl}" style="color:${COLOR.ink3};text-decoration:underline;">${e(s.settings)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  const text = [
    heading,
    "",
    ...(preview ? [`“${preview}”`, ""] : []),
    `${s.button}: ${input.chatUrl}`,
    "",
    "—",
    s.why,
    `${s.unsubscribe}: ${input.unsubscribeUrl}`,
    `${s.settings}: ${input.settingsUrl}`,
    "",
  ].join("\n");

  return { subject, html, text };
}
