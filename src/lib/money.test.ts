import test from "node:test";
import assert from "node:assert/strict";
import { amountForInput, formatAmount, formatMoney, fromCents, toCents } from "./money";

test("whole euro amounts are shown without cents", () => {
  assert.equal(formatAmount(toCents("140000"), "en"), "€140,000");
  assert.equal(formatAmount(toCents("1920000"), "en"), "€1,920,000");
  assert.equal(formatAmount(0, "en"), "€0");
});

test("cents are still shown when there are any", () => {
  assert.equal(formatAmount(toCents("140000.50"), "en"), "€140,000.50");
  assert.equal(formatAmount(toCents("52500.01"), "en"), "€52,500.01");
});

test("the payment side keeps its cents", () => {
  assert.equal(formatMoney(toCents("52500"), "en"), "€52,500.00");
});

test("a form field gets the plain number, with cents only when they exist", () => {
  assert.equal(amountForInput("140000.00"), "140000");
  assert.equal(amountForInput("140000.50"), "140000.50");
  assert.equal(amountForInput(0), "0");
  assert.equal(fromCents(toCents("140000")), "140000.00");
});
