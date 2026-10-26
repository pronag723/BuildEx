import assert from "node:assert/strict";
import test from "node:test";
import { hexToHsv, hsvToHex, normalizeHex } from "../lib/ui/color.mjs";
import { HEADER_BG_PRESETS } from "../lib/profile/headerBg.mjs";

test("primaries convert both ways", () => {
  assert.equal(hsvToHex(0, 1, 1), "#FF0000");
  assert.equal(hsvToHex(120, 1, 1), "#00FF00");
  assert.equal(hsvToHex(240, 1, 1), "#0000FF");
  assert.equal(hsvToHex(0, 0, 0), "#000000");
  assert.equal(hsvToHex(0, 0, 1), "#FFFFFF");
  assert.deepEqual(hexToHsv("#FF0000"), { h: 0, s: 1, v: 1 });
});

test("every preset survives a round trip", () => {
  for (const hex of HEADER_BG_PRESETS) {
    const { h, s, v } = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex.toUpperCase());
  }
});

test("normalizeHex accepts short and unprefixed forms only", () => {
  assert.equal(normalizeHex("abc"), "#AABBCC");
  assert.equal(normalizeHex("#12ab9F"), "#12AB9F");
  assert.equal(normalizeHex("12345"), null);
  assert.equal(normalizeHex("#zzzzzz"), null);
});
