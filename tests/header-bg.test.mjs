import assert from "node:assert/strict";
import test from "node:test";
import { headerBgOverlay, headerBgRow, readHeaderBg, storagePathFromUrl } from "../lib/profile/headerBg.mjs";

const UID = "8f0c2a5e-1111-2222-3333-444455556666";
const URL = `https://abc.supabase.co/storage/v1/object/public/portfolios/${UID}/k3j2-1700000000.webp`;

test("rows from before 0110 read as no background", () => {
  assert.deepEqual(readHeaderBg({ id: UID }), { kind: "none", color: null, imageUrl: null, dim: 45 });
  assert.equal(readHeaderBg(null).kind, "none");
});

test("a valid row reads back", () => {
  const bg = readHeaderBg({ header_bg_kind: "image", header_bg_image_url: URL, header_bg_color: "#123222", header_bg_dim: 30 });
  assert.deepEqual(bg, { kind: "image", color: "#123222", imageUrl: URL, dim: 30 });
});

test("an incomplete or unsafe row falls back to none", () => {
  assert.equal(readHeaderBg({ header_bg_kind: "color", header_bg_color: "red" }).kind, "none");
  assert.equal(readHeaderBg({ header_bg_kind: "image", header_bg_image_url: "javascript:alert(1)" }).kind, "none");
  assert.equal(readHeaderBg({ header_bg_kind: "image", header_bg_image_url: 'https://x.y/a"b' }).kind, "none");
  assert.equal(readHeaderBg({ header_bg_kind: "weird" }).kind, "none");
});

test("headerBgRow clamps and normalizes", () => {
  assert.deepEqual(headerBgRow({ kind: "color", color: "#abcdef", dim: 120 }), {
    header_bg_kind: "color",
    header_bg_color: "#ABCDEF",
    header_bg_image_url: null,
    header_bg_dim: 90,
  });
  assert.equal(headerBgRow({ kind: "image", imageUrl: "" }).header_bg_kind, "none");
  assert.equal(headerBgRow({ kind: "none", dim: -3 }).header_bg_dim, 0);
});

test("overlay uses the canvas token", () => {
  assert.match(headerBgOverlay(45), /rgb\(var\(--canvas\) \/ 0\.45\) 0%, rgb\(var\(--canvas\) \/ 0\.75\) 60%/);
  assert.match(headerBgOverlay(90), /\/ 1\.00\) 60%/);
});

test("storagePathFromUrl only accepts the user's own flat path", () => {
  assert.equal(storagePathFromUrl(URL, UID), `${UID}/k3j2-1700000000.webp`);
  assert.equal(storagePathFromUrl(URL, "someone-else"), null);
  assert.equal(storagePathFromUrl(`https://abc.supabase.co/storage/v1/object/public/portfolios/${UID}/a/b.webp`, UID), null);
  assert.equal(storagePathFromUrl("https://evil.example/x.png", UID), null);
});
