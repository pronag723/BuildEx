import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyVisit,
  deviceClass,
  landingPath,
  looksAutomated,
  referrerHost,
  shouldReplaceTouch,
} from "../lib/traffic/classify.mjs";

const HOST = "buildex.builders";
const visit = (href, referrer = "") =>
  classifyVisit({ href: `https://${HOST}${href}`, referrer, host: HOST });

test("a tagged link is a campaign, whatever the referrer", () => {
  const t = visit("/?ref=MC_Building", "https://t.me/");
  assert.equal(t.channel, "campaign");
  assert.equal(t.source, "mc_building");
  assert.equal(t.referrer_host, "t.me");
  assert.equal(t.landing_path, "/");

  const utm = visit("/builders/?utm_source=Telegram&utm_medium=post&utm_campaign=oct_test");
  assert.deepEqual(
    [utm.channel, utm.source, utm.medium, utm.campaign],
    ["campaign", "telegram", "post", "oct_test"]
  );

  // Both: utm_source names the network, ?ref= the post.
  const both = visit("/?utm_source=telegram&ref=kbakeh");
  assert.deepEqual([both.source, both.campaign], ["telegram", "kbakeh"]);

  assert.deepEqual(
    [visit("/?gclid=abc").source, visit("/?gclid=abc").medium],
    ["google", "cpc"]
  );
  assert.equal(visit("/?yclid=1").source, "yandex");
});

test("search engines resolve to one name across their domains", () => {
  for (const ref of [
    "https://www.google.com/",
    "https://www.google.ru/",
    "https://google.co.uk/search?q=x",
    "android-app://com.google.android.googlequicksearchbox/",
  ]) {
    const t = visit("/", ref);
    assert.equal(t.channel, "search", ref);
    assert.equal(t.source, "google", ref);
  }
  assert.equal(visit("/", "https://yandex.ru/").source, "yandex");
  assert.equal(visit("/", "https://ya.ru/").source, "yandex");
  assert.equal(visit("/", "https://www.bing.com/").source, "bing");
  assert.equal(visit("/", "https://duckduckgo.com/").source, "duckduckgo");
});

test("Google products that are not search are referrals", () => {
  const t = visit("/", "https://mail.google.com/");
  assert.equal(t.channel, "referral");
  assert.equal(t.source, "mail.google.com");
});

test("social networks and messengers are social", () => {
  assert.deepEqual(
    [visit("/", "https://t.me/").channel, visit("/", "https://t.me/").source],
    ["social", "telegram"]
  );
  assert.equal(visit("/", "https://web.telegram.org/").source, "telegram");
  assert.equal(visit("/", "https://m.vk.com/").source, "vk");
  assert.equal(visit("/", "https://away.vk.com/").source, "vk");
  assert.equal(visit("/", "https://www.youtube.com/").source, "youtube");
  assert.equal(visit("/", "https://t.co/abc").source, "x");
  assert.equal(visit("/?fbclid=1").source, "facebook");
});

test("whole labels only: a look-alike host is a plain referral", () => {
  const t = visit("/", "https://notvk.com/");
  assert.equal(t.channel, "referral");
  assert.equal(t.source, "notvk.com");
});

test("anything else with a referrer is a referral by host", () => {
  const t = visit("/about/", "https://www.planetminecraft.com/forums/x");
  assert.equal(t.channel, "referral");
  assert.equal(t.source, "planetminecraft.com");
  assert.equal(t.landing_path, "/about");
});

test("no referrer and no tag is direct", () => {
  const t = visit("/builders/");
  assert.equal(t.channel, "direct");
  assert.equal(t.source, null);
});

test("arriving from BuildEx itself is not a new visit", () => {
  assert.equal(visit("/", `https://${HOST}/builders/`), null);
  assert.equal(visit("/", `https://www.${HOST}/`), null);
});

test("a builder profile landing names the builder", () => {
  const params = new URLSearchParams("u=Steve_01&w=123");
  assert.equal(landingPath("/builders/profile/", params), "/builders/profile/@steve_01");
  assert.equal(landingPath("/builders/profile", new URLSearchParams()), "/builders/profile");
  assert.equal(landingPath("/", null), "/");
});

test("referrer hosts are bare and lower-case", () => {
  assert.equal(referrerHost("https://WWW.Example.COM:8080/x"), "example.com");
  assert.equal(referrerHost(""), null);
  assert.equal(referrerHost("not a url"), null);
});

test("device classes", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36";
  const androidTab = "Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/120 Safari/537.36";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";
  assert.equal(deviceClass(iphone), "mobile");
  assert.equal(deviceClass(android), "mobile");
  assert.equal(deviceClass(androidTab), "tablet");
  assert.equal(deviceClass(mac, 0), "desktop");
  assert.equal(deviceClass(mac, 5), "tablet"); // iPadOS
});

test("crawlers and automation are not visitors", () => {
  assert.equal(looksAutomated("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(looksAutomated("Mozilla/5.0 (compatible; YandexBot/3.0)"), true);
  assert.equal(looksAutomated("HeadlessChrome/120"), true);
  assert.equal(looksAutomated("Mozilla/5.0 (Windows NT 10.0) Chrome/120"), false);
  assert.equal(looksAutomated("Mozilla/5.0 (Windows NT 10.0) Chrome/120", true), true);
});

test("sign-up attribution keeps the last non-direct touch", () => {
  const ad = { channel: "campaign", source: "kbakeh" };
  const direct = { channel: "direct", source: null };
  const search = { channel: "search", source: "google" };
  assert.equal(shouldReplaceTouch(null, direct), true);
  assert.equal(shouldReplaceTouch(ad, direct), false);
  assert.equal(shouldReplaceTouch(direct, ad), true);
  assert.equal(shouldReplaceTouch(ad, search), true);
  assert.equal(shouldReplaceTouch(ad, null), false);
});
