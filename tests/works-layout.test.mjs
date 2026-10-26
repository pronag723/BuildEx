import assert from "node:assert/strict";
import test from "node:test";
import {
  moveItem,
  normalizeWorkSize,
  resizeOutline,
  sizeFor,
  snapSize,
  spanMetrics,
} from "../lib/works/layout.mjs";

test("unknown or missing sizes read as small", () => {
  assert.equal(normalizeWorkSize("l"), "l");
  assert.equal(normalizeWorkSize(undefined), "s");
  assert.equal(normalizeWorkSize("xl"), "s");
  assert.equal(normalizeWorkSize("constructor"), "s");
});

test("sizeFor maps spans to keys", () => {
  assert.equal(sizeFor(2, 2), "s");
  assert.equal(sizeFor(4, 2), "w");
  assert.equal(sizeFor(2, 4), "t");
  assert.equal(sizeFor(4, 4), "l");
});

test("a resize snaps once the outline passes halfway between spans", () => {
  const m = spanMetrics(84, 6); // phone: span2 = 174, span4 = 354, halfway 264
  assert.deepEqual(m, { span2: 174, span4: 354 });
  assert.equal(snapSize(174, 174, m), "s");
  assert.equal(snapSize(264, 174, m), "s");
  assert.equal(snapSize(265, 174, m), "w");
  assert.equal(snapSize(174, 300, m), "t");
  assert.equal(snapSize(354, 354, m), "l");
});

test("the resize outline is clamped", () => {
  const m = spanMetrics(94, 8);
  const tiny = resizeOutline(196, 196, -500, -500, m);
  assert.equal(tiny.w, m.span2 * 0.75);
  const huge = resizeOutline(196, 196, 5000, 5000, m);
  assert.equal(huge.h, m.span4 * 1.06);
});

test("moveItem moves into the target's slot", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(moveItem(list, "a", "c").map((x) => x.id), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(list, "d", "b").map((x) => x.id), ["a", "d", "b", "c"]);
  assert.equal(moveItem(list, "a", "a"), list);
  assert.equal(moveItem(list, "a", "zz"), list);
});
