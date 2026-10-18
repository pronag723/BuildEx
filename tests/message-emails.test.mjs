import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// Node strips the TypeScript types on import, so the Edge Functions' pure
// modules are tested here exactly as Deno runs them.
import { STRINGS, renderMessageEmail } from "../supabase/functions/send-message-emails/email.ts";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../supabase/functions/_shared/unsubscribeToken.ts";
import { safeEqual } from "../supabase/functions/_shared/safeEqual.ts";

const USER = "8d0f6c1e-2b7a-4c3d-9e5f-0a1b2c3d4e5f";
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

const base = {
  locale: "en",
  senderName: "Alice",
  previewKind: "text",
  previewText: "Can you build a castle?",
  unreadCount: 1,
  chatUrl: "https://buildex.builders/chats/?c=11111111-2222-3333-4444-555555555555",
  unsubscribeUrl: "https://buildex.builders/unsubscribe/?token=abc.def",
  settingsUrl: "https://buildex.builders/account/?section=danger",
};

test("unsubscribe tokens verify, and nothing else does", async () => {
  const token = await signUnsubscribeToken(USER, SECRET);
  assert.match(token, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
  assert.equal(await verifyUnsubscribeToken(token, SECRET), USER);
  assert.equal(await verifyUnsubscribeToken(` ${token} `, SECRET), USER);
  // The id is case-insensitive; the signature is not.
  assert.equal(await signUnsubscribeToken(USER.toUpperCase(), SECRET), token);

  const [id, sig] = token.split(".");
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  const otherUser = "8d0f6c1e-2b7a-4c3d-9e5f-0a1b2c3d4e50";
  for (const bad of [
    `${id}.${flipped}`,
    `${otherUser}.${sig}`,
    `${id}.${sig}.extra`,
    `${id}`,
    `not-a-uuid.${sig}`,
    `${id}.***`,
    "",
    null,
    123,
    `${id}.${"A".repeat(300)}`,
  ]) {
    assert.equal(await verifyUnsubscribeToken(bad, SECRET), null, `rejects ${String(bad).slice(0, 40)}`);
  }
  assert.equal(await verifyUnsubscribeToken(token, `${SECRET}x`), null, "wrong secret");
  await assert.rejects(signUnsubscribeToken(USER, ""), /UNSUBSCRIBE_SECRET/);
});

test("the cron secret comparison", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abd", "abc"), false);
  assert.equal(safeEqual("ab", "abc"), false);
  assert.equal(safeEqual("", ""), false, "an unset secret never matches");
});

test("both email languages carry the same strings", () => {
  assert.deepEqual(Object.keys(STRINGS.ru).sort(), Object.keys(STRINGS.en).sort());
});

test("the email says who wrote, previews the text, and links back", () => {
  const { subject, html, text } = renderMessageEmail(base);
  assert.equal(subject, "New message from Alice on BuildEx");
  assert.match(html, /New message from Alice/);
  assert.match(html, /Can you build a castle\?/);
  assert.match(html, /href="https:\/\/buildex\.builders\/chats\/\?c=11111111-2222-3333-4444-555555555555"/);
  assert.match(html, />Open chat</);
  assert.match(html, /href="https:\/\/buildex\.builders\/unsubscribe\/\?token=abc\.def"/);
  assert.match(html, /<html lang="en">/);
  assert.match(text, /Open chat: https:\/\/buildex\.builders\/chats\/\?c=/);
  assert.match(text, /Unsubscribe from message emails: https:\/\/buildex\.builders\/unsubscribe\//);
  assert.match(text, /Email settings: https:\/\/buildex\.builders\/account\//);
  assert.match(text, /haven't read it yet/);
});

test("user content is escaped and cleaned", () => {
  const { subject, html } = renderMessageEmail({
    ...base,
    senderName: "<img src=x onerror=alert(1)>‮evil\nname",
    previewText: `"quoted" & <script>alert('x')</script>`,
  });
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&quot;quoted&quot; &amp; &lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(subject, /[‮\n]/, "no bidi override or newline in the subject");
});

test("photos are described, never embedded", () => {
  const photo = renderMessageEmail({ ...base, previewKind: "photo", previewText: "" });
  assert.match(photo.html, /Sent a photo/);
  assert.match(photo.text, /“Sent a photo”/);
  const captioned = renderMessageEmail({ ...base, previewKind: "photo_caption", previewText: "my castle" });
  assert.match(captioned.html, /Photo · my castle/);
  const ru = renderMessageEmail({ ...base, locale: "ru", previewKind: "photo", previewText: "" });
  assert.match(ru.html, /Отправлено фото/);
  for (const { html } of [photo, captioned, ru]) {
    assert.equal((html.match(/<img/g) || []).length, 0);
  }
});

test("Russian emails pick the right plural", () => {
  const heading = (count) => renderMessageEmail({ ...base, locale: "ru", unreadCount: count }).text.split("\n")[0];
  assert.equal(heading(1), "Новое сообщение от Alice");
  assert.equal(heading(2), "2 новых сообщения от Alice");
  assert.equal(heading(5), "5 новых сообщений от Alice");
  assert.equal(heading(21), "21 новое сообщение от Alice");
  const ru = renderMessageEmail({ ...base, locale: "ru" });
  assert.equal(ru.subject, "Новое сообщение от Alice на BuildEx");
  assert.match(ru.html, /<html lang="ru">/);
  assert.match(ru.html, />Открыть чат</);
});

test("fallbacks: unknown language, missing name, long previews", () => {
  const de = renderMessageEmail({ ...base, locale: "de" });
  assert.equal(de.subject, "New message from Alice on BuildEx");
  assert.equal(renderMessageEmail({ ...base, senderName: "   " }).subject, "New message from someone on BuildEx");
  assert.equal(
    renderMessageEmail({ ...base, locale: "ru", senderName: null }).subject,
    "Новое сообщение от собеседника на BuildEx",
  );
  assert.match(renderMessageEmail({ ...base, unreadCount: 4 }).subject, /^New message from Alice/);
  assert.match(renderMessageEmail({ ...base, unreadCount: 4 }).html, /4 new messages from Alice/);
  const long = renderMessageEmail({ ...base, previewText: "word ".repeat(100) });
  const quoted = long.text.split("\n")[2];
  assert.ok(quoted.length <= 162, "preview is capped");
  assert.match(quoted, /…”$/);
});

test("the sender asks Resend for one-click unsubscribe and an idempotent send", () => {
  const source = readFileSync("supabase/functions/send-message-emails/index.ts", "utf8");
  assert.match(source, /"List-Unsubscribe": `<\$\{oneClickUrl\}>`/);
  assert.match(source, /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
  assert.match(source, /"Idempotency-Key": `message-email\/\$\{row\.email_id\}`/);
  assert.match(source, /\/chats\/\?c=/);
  assert.match(source, /x-cron-secret/);
});
