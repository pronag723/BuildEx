import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeOrder,
  briefErrors,
  briefPayload,
  budgetText,
  emptyBrief,
  insideBrief,
  parseRub,
  sizeText,
} from "../lib/orders/brief.mjs";

const t = (key, vars) => (vars ? `${key}:${vars.amount}` : key);

test("parseRub reads spaced and dotted amounts", () => {
  assert.equal(parseRub("25 000"), 25000);
  assert.equal(parseRub("30.000"), 30000);
  assert.equal(parseRub(""), null);
});

test("a brief needs a build type and an ordered budget", () => {
  const form = { ...emptyBrief(), budget_min_rub: "40000", budget_max_rub: "30000" };
  const errors = briefErrors(form);
  assert.equal(errors.build_type, "needType");
  assert.equal(errors.budget, "budgetOrder");
  assert.deepEqual(briefErrors({ ...form, build_type: "spawn", budget_max_rub: "50000" }), {});
});

test("past deadlines are rejected, today is fine", () => {
  const today = new Date("2026-10-31T12:00:00");
  const base = { ...emptyBrief(), build_type: "spawn" };
  assert.equal(briefErrors({ ...base, deadline: "2026-10-30" }, today).deadline, "pastDeadline");
  assert.equal(briefErrors({ ...base, deadline: "2026-10-31" }, today).deadline, undefined);
});

test("the payload drops the budget when the builder prices it", () => {
  const p = briefPayload(
    { ...emptyBrief(), build_type: "spawn", budget_open: true, budget_max_rub: "30000" },
    "Spawn"
  );
  assert.equal(p.title, "Spawn");
  assert.equal(p.budget_max_rub, null);
  assert.equal(p.budget_open, true);
});

test("budget and size read as one line", () => {
  const plain = (s) => s.replace(/[  ]/g, " ");
  assert.equal(plain(budgetText({ budget_min_rub: 25000, budget_max_rub: 35000 }, "ru", t)), "25 000–35 000 ₽");
  assert.equal(budgetText({ budget_max_rub: 10000 }, "en", t), "orders.budget.upTo:₽10,000");
  assert.equal(budgetText({ budget_open: true }, "en", t), "orders.budget.open");
  assert.equal(budgetText({}, "en", t), null);
  assert.equal(sizeText({ size_w: 200, size_l: 200 }), "200 × 200");
  assert.equal(sizeText({ size_w: 200 }), null);
});

test("taking an order starts it only inside the brief", () => {
  const brief = { budget_min_rub: 25000, budget_max_rub: 35000, deadline: "2026-11-15" };
  assert.equal(insideBrief(brief, 30000, "2026-11-06"), true);
  assert.equal(insideBrief(brief, 40000, "2026-11-06"), false);
  assert.equal(insideBrief(brief, 30000, "2026-11-20"), false);
  assert.equal(insideBrief({ budget_open: true }, 1, "2026-11-01"), false);
});

test("the strip shows the newest open order", () => {
  const orders = [
    { id: "a", status: "completed" },
    { id: "b", status: "in_progress" },
    { id: "c", status: "pending" },
  ];
  assert.equal(activeOrder(orders).id, "c");
  assert.equal(activeOrder([{ id: "a", status: "cancelled" }]), null);
});
