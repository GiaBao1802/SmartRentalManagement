import test from "node:test";
import assert from "node:assert/strict";
import { billingAnniversary, billingPeriod, dueDateFromFinalizedAt, isOverdue, parseSqlDate, resolveEffectiveContractEndDate } from "./invoice.billing.js";

const d = (value: string) => parseSqlDate(value);

test("monthly invoice anchor uses Contract start date, not calendar month", () => {
  const anchor = d("2026-10-15");
  const october = billingPeriod(anchor, d("2027-10-14"), 0)!;
  const november = billingPeriod(anchor, d("2027-10-14"), 1)!;
  assert.equal(october.periodStart.toISOString().slice(0, 10), "2026-10-15");
  assert.equal(october.periodEnd.toISOString().slice(0, 10), "2026-11-14");
  assert.equal(november.periodStart.toISOString().slice(0, 10), "2026-11-15");
});

test("day 31 clamps in February and returns to original anchor in March", () => {
  const anchor = d("2026-01-31");
  assert.equal(billingAnniversary(anchor, 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(billingAnniversary(anchor, 2).toISOString().slice(0, 10), "2026-03-31");
  assert.equal(billingAnniversary(anchor, 3).toISOString().slice(0, 10), "2026-04-30");
  assert.equal(billingAnniversary(anchor, 4).toISOString().slice(0, 10), "2026-05-31");
});

test("leap February clamps without causing cumulative drift", () => {
  const anchor = d("2024-01-31");
  assert.equal(billingAnniversary(anchor, 1).toISOString().slice(0, 10), "2024-02-29");
  assert.equal(billingAnniversary(anchor, 2).toISOString().slice(0, 10), "2024-03-31");
});

test("normal Contract uses end_date as the final billing boundary", () => {
  const effectiveEnd = resolveEffectiveContractEndDate({ status: "expired", endDate: d("2026-03-20"), terminationDate: null });
  const period = billingPeriod(d("2026-01-15"), effectiveEnd, 2)!;
  assert.equal(period.periodStart.toISOString().slice(0, 10), "2026-03-15");
  assert.equal(period.periodEnd.toISOString().slice(0, 10), "2026-03-20");
  assert.equal(billingPeriod(d("2026-01-15"), effectiveEnd, 3), null);
});

test("final partial period truncates normal period end without prorating rent", () => {
  const period = billingPeriod(d("2026-01-15"), d("2026-03-20"), 2)!;
  assert.equal(period.periodStart.toISOString().slice(0, 10), "2026-03-15");
  assert.equal(period.periodEnd.toISOString().slice(0, 10), "2026-03-20");
});

test("terminated Contract uses termination_date instead of later end_date", () => {
  const effectiveEnd = resolveEffectiveContractEndDate({ status: "terminated", endDate: d("2026-12-31"), terminationDate: d("2026-03-20") });
  const period = billingPeriod(d("2026-01-15"), effectiveEnd, 2)!;
  assert.equal(period.periodEnd.toISOString().slice(0, 10), "2026-03-20");
  assert.equal(billingPeriod(d("2026-01-15"), effectiveEnd, 3), null);
});

test("Contracts without an effective termination date use end_date", () => {
  const effectiveEnd = resolveEffectiveContractEndDate({ status: "active", endDate: d("2026-12-31"), terminationDate: d("2026-03-20") });
  assert.equal(effectiveEnd.toISOString().slice(0, 10), "2026-12-31");
  assert.equal(billingPeriod(d("2026-01-15"), effectiveEnd, 2)!.periodEnd.toISOString().slice(0, 10), "2026-04-14");
  const terminatedWithoutDate = resolveEffectiveContractEndDate({ status: "terminated", endDate: d("2026-12-31"), terminationDate: null });
  assert.equal(terminatedWithoutDate.toISOString().slice(0, 10), "2026-12-31");
});

test("due date adds five business calendar days and is not overdue on its own date", () => {
  const due = dueDateFromFinalizedAt(new Date("2026-10-08T18:00:00.000Z"));
  assert.equal(due.toISOString().slice(0, 10), "2026-10-14");
  assert.equal(isOverdue("unpaid", due, new Date("2026-10-14T16:59:59.000Z")), false);
  assert.equal(isOverdue("unpaid", due, new Date("2026-10-14T17:00:00.000Z")), true);
  assert.equal(isOverdue("unpaid", due, new Date("2026-10-15T00:00:00.000Z")), true);
  assert.equal(isOverdue("paid", due, new Date("2026-10-16T00:00:00.000Z")), false);
  assert.equal(isOverdue("draft", null, new Date("2026-10-16T00:00:00.000Z")), false);
});
