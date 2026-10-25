import assert from "node:assert/strict";
import test from "node:test";
import {
  daysRange,
  experienceYears,
  formatCount,
  formatPrice,
  relativeAgo,
} from "../lib/works/format.mjs";

// Intl separates a number from its unit with a (narrow) no-break space in some
// locales; compare on plain spaces so the tests read like the UI.
const plain = (s) => s.replace(/[  ]/g, " ");

test("counters stay exact below a thousand and go compact above", () => {
  assert.equal(formatCount(0, "en"), "0");
  assert.equal(formatCount(980, "en"), "980");
  assert.equal(formatCount(9800, "en"), "9.8K");
  assert.equal(plain(formatCount(9800, "ru")), "9,8 тыс.");
  assert.equal(formatCount(undefined, "en"), "0");
});

test("prices are whole dollars unless they carry cents", () => {
  assert.equal(formatPrice(15000, "en"), "$150");
  assert.equal(formatPrice(4050, "en"), "$40.50");
  assert.equal(plain(formatPrice(15000, "ru")), "150 $");
});

test("experience counts full years from the year someone started building", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  assert.equal(experienceYears(2020, now), 6);
  assert.equal(experienceYears(2026, now), 0);
  assert.equal(experienceYears(null, now), null);
  assert.equal(experienceYears(2008, now), null); // before Minecraft existed
  assert.equal(experienceYears(2027, now), null); // in the future
});

test("a duration range renders as one number or a span, and pluralizes on its top end", () => {
  assert.deepEqual(daysRange(2, 4), { text: "2–4", count: 4 });
  assert.deepEqual(daysRange(3, null), { text: "3", count: 3 });
  assert.deepEqual(daysRange(null, 7), { text: "7", count: 7 });
  assert.deepEqual(daysRange(5, 5), { text: "5", count: 5 });
  assert.equal(daysRange(null, null), null);
});

test("relative dates read naturally in both languages", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  assert.equal(relativeAgo("2026-10-23T12:00:00Z", "en", now), "2 days ago");
  assert.equal(relativeAgo("2026-10-23T12:00:00Z", "ru", now), "позавчера");
  assert.equal(relativeAgo("2026-10-11T12:00:00Z", "en", now), "2 weeks ago");
  assert.equal(relativeAgo("2026-10-25T11:59:50Z", "en", now), "now");
  assert.equal(relativeAgo(null, "en", now), "");
});
