import test from "node:test";
import assert from "node:assert/strict";
import { BillingScheduler, dueBillingPeriods, type BillingScheduleStore, type ScheduledContract } from "./billing-scheduler.js";
import { businessDate, parseSqlDate } from "./invoice.billing.js";

const d = parseSqlDate;
const contract = (overrides: Partial<ScheduledContract> = {}): ScheduledContract => ({
  ownerId: 1n, contractId: 10n, startDate: d("2026-01-31"), endDate: d("2026-06-30"), terminationDate: null, status: "active", ...overrides,
});
const quiet = { info() {}, warn() {}, error() {} };

test("period-end reminder runs on the Vietnam calendar end date; draft waits until the next date", async () => {
  const calls: string[] = [];
  const store: BillingScheduleStore = {
    async listEligibleContracts() { return [contract()]; },
    async ensurePeriodEndReminder(_contract, period) { calls.push(`reminder:${period.periodEnd.toISOString().slice(0, 10)}`); return true; },
    async ensurePeriodDraft(_contract, period) { calls.push(`draft:${period.periodEnd.toISOString().slice(0, 10)}`); return true; },
  };
  const periodEnd = new Date("2026-02-27T00:00:00.000Z");
  const atEndDate = businessDate(new Date("2026-02-26T17:00:00.000Z"));
  assert.equal(atEndDate.toISOString().slice(0, 10), "2026-02-27");
  assert.deepEqual(dueBillingPeriods(contract(), atEndDate).periods.map((period) => period.periodEnd), [periodEnd]);
  await new BillingScheduler(store, () => new Date("2026-02-26T17:00:00.000Z"), quiet).runOnce();
  assert.deepEqual(calls, ["reminder:2026-02-27"]);

  calls.length = 0;
  await new BillingScheduler(store, () => new Date("2026-02-27T17:00:00.000Z"), quiet).runOnce();
  assert.deepEqual(calls, ["reminder:2026-02-27", "draft:2026-02-27"]);
});

test("catch-up returns every ended period chronologically and keeps the original month-end anchor", () => {
  const result = dueBillingPeriods(contract(), d("2026-05-31"));
  assert.equal(result.malformed, false);
  assert.deepEqual(result.periods.map((period) => [period.periodStart.toISOString().slice(0, 10), period.periodEnd.toISOString().slice(0, 10)]), [
    ["2026-01-31", "2026-02-27"], ["2026-02-28", "2026-03-30"], ["2026-03-31", "2026-04-29"], ["2026-04-30", "2026-05-30"],
  ]);
});

test("normal and terminated Contracts stop at their effective end and never generate a later period", () => {
  const normal = dueBillingPeriods(contract({ startDate: d("2026-01-15"), endDate: d("2026-03-20"), status: "expired" }), d("2026-04-01"));
  assert.deepEqual(normal.periods.map((period) => period.periodEnd.toISOString().slice(0, 10)), ["2026-02-14", "2026-03-14", "2026-03-20"]);
  const terminated = dueBillingPeriods(contract({ startDate: d("2026-01-15"), endDate: d("2026-12-31"), terminationDate: d("2026-03-10"), status: "terminated" }), d("2026-04-01"));
  assert.deepEqual(terminated.periods.map((period) => period.periodEnd.toISOString().slice(0, 10)), ["2026-02-14", "2026-03-10"]);
});

test("invalid and draft Contracts are skipped instead of receiving an Invoice", async () => {
  const calls: string[] = [];
  const store: BillingScheduleStore = {
    async listEligibleContracts() { return [contract({ status: "draft" }), contract({ contractId: 11n, status: "terminated", terminationDate: d("2025-12-31") })]; },
    async ensurePeriodEndReminder() { calls.push("reminder"); return false; },
    async ensurePeriodDraft() { calls.push("draft"); return false; },
  };
  await new BillingScheduler(store, () => new Date("2026-04-01T00:00:00.000Z"), quiet).runOnce();
  assert.deepEqual(calls, []);
});

test("one period reminder failure does not block its draft or other Contracts", async () => {
  const events: string[] = [];
  const store: BillingScheduleStore = {
    async listEligibleContracts() { return [contract(), contract({ contractId: 11n, startDate: d("2026-02-01"), endDate: d("2026-03-31") })]; },
    async ensurePeriodEndReminder(_contract, period) { events.push(`reminder:${period.periodEnd.toISOString().slice(0, 10)}`); throw new Error("private details not logged"); },
    async ensurePeriodDraft(value) { events.push(`draft:${value.contractId}`); return true; },
  };
  const errors: Record<string, unknown>[] = [];
  await new BillingScheduler(store, () => new Date("2026-04-01T00:00:00.000Z"), { ...quiet, error: (entry) => errors.push(entry) }).runOnce();
  assert.ok(events.includes("draft:10"));
  assert.ok(events.includes("draft:11"));
  assert.ok(errors.length > 0);
  assert.ok(errors.every((entry) => !JSON.stringify(entry).includes("private details")));
});

test("overlapping calls in one process share the same run and do not duplicate work", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let scans = 0;
  const store: BillingScheduleStore = {
    async listEligibleContracts() { scans += 1; await gate; return []; },
    async ensurePeriodEndReminder() { return false; },
    async ensurePeriodDraft() { return false; },
  };
  const scheduler = new BillingScheduler(store, () => d("2026-04-01"), quiet);
  const first = scheduler.runOnce();
  const second = scheduler.runOnce();
  assert.equal(scans, 1);
  release();
  await Promise.all([first, second]);
});

test("shutdown waits for an in-flight run and prevents later scheduler work", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let scans = 0;
  const store: BillingScheduleStore = {
    async listEligibleContracts() { scans += 1; await gate; return []; },
    async ensurePeriodEndReminder() { return false; },
    async ensurePeriodDraft() { return false; },
  };
  const scheduler = new BillingScheduler(store, () => d("2026-04-01"), quiet);
  const run = scheduler.runOnce();
  const shutdown = scheduler.stop();
  let shutdownCompleted = false;
  void shutdown.then(() => { shutdownCompleted = true; });
  await Promise.resolve();
  assert.equal(shutdownCompleted, false, "shutdown waits for the active run");
  release();
  await Promise.all([run, shutdown]);
  await scheduler.runOnce();
  assert.equal(scans, 1, "stopped scheduler does not start another run");
});

test("a restarted scheduler resumes after a failed period without skipping it", async () => {
  const completed = new Set<string>();
  const attempts: string[] = [];
  let failOnce = true;
  const store: BillingScheduleStore = {
    async listEligibleContracts() { return [contract({ startDate: d("2026-01-15"), endDate: d("2026-04-14") })]; },
    async ensurePeriodEndReminder(_contract, period) { completed.add(`r:${period.periodStart.toISOString()}`); return true; },
    async ensurePeriodDraft(_contract, period) {
      const key = `d:${period.periodStart.toISOString()}`; attempts.push(key);
      if (failOnce) { failOnce = false; throw new Error("injected"); }
      const isNew = !completed.has(key); completed.add(key); return isNew;
    },
  };
  const now = () => new Date("2026-04-15T00:00:00.000Z");
  await new BillingScheduler(store, now, quiet).runOnce();
  await new BillingScheduler(store, now, quiet).runOnce();
  assert.equal(attempts.length, 4);
  assert.equal(attempts[0], attempts[1]);
  assert.deepEqual(attempts.slice(1), [...new Set(attempts.slice(1))]);
});
