import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, effectiveVatRate, scheduleTotals, singleRateSetup, vatOnBases } from "./vat";
import { distributeCents, fromCents } from "./money";

const c = (euros: number) => Math.round(euros * 100);

const plan = (n: number, locked: Record<number, { net: number; vat: number; rate: number }> = {}) =>
  Array.from({ length: n }, (_, i) => {
    const seq = i + 1;
    const l = locked[seq];
    return {
      seq,
      label: `Stage ${seq}`,
      percentage: 100 / n,
      locked: Boolean(l),
      lockedNetCents: l ? c(l.net) : undefined,
      lockedVatCents: l ? c(l.vat) : undefined,
      lockedRate: l?.rate,
    };
  });

test("single rate. 200000 at 5 percent over four installments", () => {
  const setup = singleRateSetup(c(200000), 5);
  const lines = buildSchedule(setup, plan(4));
  assert.equal(lines.length, 4);
  for (const l of lines) {
    assert.equal(fromCents(l.netCents), "50000.00");
    assert.equal(fromCents(l.vatCents), "2500.00");
    assert.equal(fromCents(l.totalCents), "52500.00");
  }
  const t = scheduleTotals(lines);
  assert.equal(fromCents(t.netCents), "200000.00");
  assert.equal(fromCents(t.vatCents), "10000.00");
});

test("split rate. 150000 at 5 percent plus 50000 at 19 percent", () => {
  const setup = {
    netCents: c(200000),
    reducedBaseCents: c(150000),
    reducedRate: 5,
    standardBaseCents: c(50000),
    standardRate: 19,
  };
  assert.equal(fromCents(vatOnBases(setup)), "17000.00");
  assert.equal(effectiveVatRate(setup).toFixed(2), "8.50");
  const lines = buildSchedule(setup, plan(4));
  for (const l of lines) {
    assert.equal(fromCents(l.netCents), "50000.00");
    assert.equal(fromCents(l.vatCents), "4250.00");
    assert.equal(fromCents(l.totalCents), "54250.00");
  }
  assert.equal(fromCents(scheduleTotals(lines).vatCents), "17000.00");
});

test("a paid installment keeps the rate it was invoiced at when the rate changes", () => {
  // First installment was invoiced and paid at 19 percent, then the Tax Department
  // approved the reduced rate, so the rest of the schedule moves to 5 percent.
  const setup = singleRateSetup(c(200000), 5);
  const lines = buildSchedule(setup, plan(4, { 1: { net: 50000, vat: 9500, rate: 19 } }));
  assert.equal(fromCents(lines[0].vatCents), "9500.00");
  assert.equal(lines[0].locked, true);
  assert.equal(lines[0].rateApplied, 19);
  for (const l of lines.slice(1)) {
    assert.equal(fromCents(l.netCents), "50000.00");
    assert.equal(fromCents(l.vatCents), "2500.00");
    assert.equal(l.locked, false);
  }
  // The net price still ties out exactly.
  assert.equal(fromCents(scheduleTotals(lines).netCents), "200000.00");
});

test("the net price always ties out, even with awkward percentages", () => {
  const setup = singleRateSetup(c(100000), 5);
  const lines = buildSchedule(setup, plan(3));
  assert.equal(fromCents(scheduleTotals(lines).netCents), "100000.00");
  assert.deepEqual(lines.map((l) => fromCents(l.netCents)), ["33333.34", "33333.33", "33333.33"]);
});

test("distributeCents never loses or invents a cent", () => {
  for (const total of [1, 7, 99, 100003, 987654321]) {
    for (const weights of [[1, 1, 1], [5, 25, 20, 20, 20, 10], [33.3333, 33.3333, 33.3334]]) {
      const parts = distributeCents(total, weights);
      assert.equal(parts.reduce((a, b) => a + b, 0), total);
    }
  }
});

test("a change of net price after part payment only moves the open installments", () => {
  const setup = singleRateSetup(c(210000), 5); // price increased by 10000
  const lines = buildSchedule(setup, plan(4, { 1: { net: 50000, vat: 2500, rate: 5 } }));
  assert.equal(fromCents(lines[0].netCents), "50000.00");
  const openTotal = lines.slice(1).reduce((a, l) => a + l.netCents, 0);
  assert.equal(fromCents(openTotal), "160000.00");
  assert.equal(fromCents(scheduleTotals(lines).netCents), "210000.00");
});
