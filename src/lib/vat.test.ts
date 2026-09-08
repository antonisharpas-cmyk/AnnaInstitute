import assert from "node:assert/strict";
import test from "node:test";
import { toCents } from "./money";
import { buildSchedule, DEFAULT_STAGES, periodicPlan, scheduleTotals, vatOn } from "./vat";

const planFrom = (stages: { label: string; percentage: number }[]) =>
  stages.map((s, i) => ({ seq: i + 1, label: s.label, percentage: s.percentage, locked: false }));

test("VAT is the rate on the price before VAT", () => {
  assert.equal(vatOn(toCents("200000"), 5), toCents("10000"));
  assert.equal(vatOn(toCents("200000"), 19), toCents("38000"));
});

test("the classic stages add up to the price and its VAT", () => {
  const setup = { netCents: toCents("200000"), rate: 5 };
  const lines = buildSchedule(setup, planFrom(DEFAULT_STAGES));
  const totals = scheduleTotals(lines);

  assert.equal(lines.length, 6);
  assert.equal(totals.netCents, toCents("200000"));
  assert.equal(totals.vatCents, toCents("10000"));
  assert.equal(totals.totalCents, toCents("210000"));
});

test("a paid installment keeps the figures it was invoiced at", () => {
  const before = buildSchedule(
    { netCents: toCents("200000"), rate: 8.5 },
    planFrom(DEFAULT_STAGES),
  );
  const first = before[0];

  const plan = planFrom(DEFAULT_STAGES).map((p, i) =>
    i === 0
      ? {
          ...p,
          locked: true,
          lockedNetCents: first.netCents,
          lockedVatCents: first.vatCents,
          lockedRate: 8.5,
        }
      : p,
  );

  const after = buildSchedule({ netCents: toCents("200000"), rate: 5 }, plan);

  assert.equal(after[0].netCents, first.netCents);
  assert.equal(after[0].vatCents, first.vatCents);
  assert.equal(after[0].rateApplied, 8.5);
  assert.equal(after[1].rateApplied, 5);

  // The rest of the price is still spread over the open lines, to the cent.
  const totals = scheduleTotals(after);
  assert.equal(totals.netCents, toCents("200000"));
});

test("equal periodic payments split the price to the cent", () => {
  const net = toCents("100000");
  const plan = periodicPlan(net, 7, 1, new Date("2026-01-31T00:00:00Z"));
  const lines = buildSchedule({ netCents: net, rate: 5 }, planFrom(plan));
  const totals = scheduleTotals(lines);

  assert.equal(plan.length, 7);
  assert.equal(totals.netCents, net);
  assert.equal(totals.vatCents, toCents("5000"));
  assert.equal(plan[0].dueDate?.getUTCMonth(), 0);
  assert.equal(plan[1].dueDate?.getUTCMonth(), 1);
});

test("quarterly dates step three months at a time", () => {
  const plan = periodicPlan(toCents("120000"), 4, 3, new Date("2026-01-15T00:00:00Z"));
  assert.deepEqual(
    plan.map((p) => p.dueDate?.getUTCMonth()),
    [0, 3, 6, 9],
  );
});
