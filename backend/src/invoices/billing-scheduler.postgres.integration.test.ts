import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { BillingScheduler } from "./billing-scheduler.js";
import { PrismaBillingScheduleStore } from "./billing-scheduler.repository.js";
import { PrismaInvoiceRepository } from "./invoice.repository.js";
import { parseSqlDate } from "./invoice.billing.js";

const databaseUrl = process.env.GOCTRO_V18_REHEARSAL_DATABASE_URL;

test("PostgreSQL V1.8 scheduler persists period reminders and catch-up drafts once across workers", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  let ownerId: bigint | undefined;
  let propertyId: bigint | undefined;
  let roomId: bigint | undefined;
  let residentId: bigint | undefined;
  let accountId: bigint | undefined;
  let contractId: bigint | undefined;
  let immutableInvoiceCreated = false;
  try {
    const targetUrl = new URL(databaseUrl!);
    assert.equal(targetUrl.hostname, "127.0.0.1", "integration refuses any non-loopback target");
    const identity = await prisma.$queryRaw<Array<{ db: string; port: number }>>`SELECT current_database() AS db, inet_server_port() AS port`;
    assert.deepEqual(identity, [{ db: "goctro_v18_rehearsal", port: Number(targetUrl.port) }], "only the dedicated disposable V1.8 database is allowed");

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const owner = await prisma.owner.create({ data: { displayName: `Scheduler integration ${suffix}` } });
    ownerId = owner.ownerId;
    const account = await prisma.account.create({ data: {
      ownerId, role: "admin", email: `billing-scheduler-${suffix}@example.test`, passwordHash: "integration-only-unused",
    } });
    accountId = account.accountId;
    const property = await prisma.property.create({ data: {
      ownerId, propertyCode: `SCH-${suffix}`.slice(0, 40), name: `Scheduler ${suffix}`.slice(0, 150),
      province: "Đồng Nai", address: `Integration ${suffix}`,
    } });
    propertyId = property.propertyId;
    const room = await prisma.room.create({ data: {
      ownerId, propertyId, roomCode: "SCHEDULER-01", areaM2: "20.00", defaultRent: 1_000_000n, defaultCapacity: 1,
    } });
    roomId = room.roomId;
    const resident = await prisma.resident.create({ data: { ownerId, fullName: `Scheduler resident ${suffix}` } });
    residentId = resident.residentId;
    const contract = await prisma.contract.create({ data: {
      ownerId, propertyId, roomId, representativeResidentId: residentId,
      contractNo: `SCH-${suffix}`.slice(0, 40), startDate: parseSqlDate("2026-01-15"), endDate: parseSqlDate("2026-04-15"),
      status: "expired", revision: 1, rentAmount: 1_000_000n, depositAmount: 0n, residentCapacity: 1,
    } });
    contractId = contract.contractId;

    const repository = new PrismaInvoiceRepository(prisma);
    const store = new PrismaBillingScheduleStore(prisma, repository);
    const schedulerLogs: { errors: Record<string, unknown>[] } = { errors: [] };
    const quiet = { info() {}, warn() {}, error(entry: Record<string, unknown>) { schedulerLogs.errors.push(entry); } };
    const reminderFailureDetails: string[] = [];
    const originalEnsureReminder = store.ensurePeriodEndReminder.bind(store);
    store.ensurePeriodEndReminder = async (...args) => {
      try { return await originalEnsureReminder(...args); }
      catch (error) {
        reminderFailureDetails.push(error instanceof Error ? error.message : String(error));
        throw error;
      }
    };
    const periodEndDate = () => new BillingScheduler(store, () => new Date("2026-02-14T05:00:00.000Z"), quiet);
    await Promise.all([periodEndDate().runOnce(), periodEndDate().runOnce()]);
    assert.equal(schedulerLogs.errors.length, 0, `period-end reminder run has no repository failures: ${reminderFailureDetails.join("; ")}`);
    assert.equal(await prisma.notification.count({ where: { accountId, notificationType: "billing_period_closeout" } }), 1, "period-end run persists one reminder");
    assert.equal(await prisma.invoice.count({ where: { contractId } }), 0, "draft is not generated on period_end itself");

    const nextDayScheduler = new BillingScheduler(store, () => new Date("2026-02-15T05:00:00.000Z"), quiet);
    await Promise.all([nextDayScheduler.runOnce(), repository.ensureNextDraft(ownerId, contractId, parseSqlDate("2026-02-15"))]);
    const firstPeriodInvoice = await prisma.invoice.findUniqueOrThrow({ where: {
      contractId_periodStart_periodEnd: { contractId, periodStart: parseSqlDate("2026-01-15"), periodEnd: parseSqlDate("2026-02-14") },
    } });
    assert.equal(await prisma.invoice.count({ where: { contractId, periodStart: parseSqlDate("2026-01-15"), periodEnd: parseSqlDate("2026-02-14") } }), 1,
      "scheduler and Admin manual generation converge on the unique period");
    // Simulate an Admin finalizing this first draft between scheduler executions.
    await prisma.invoice.update({ where: { invoiceId: firstPeriodInvoice.invoiceId }, data: {
      status: "unpaid", snapshotKind: "LEGACY_AGGREGATE", finalizedAt: new Date("2026-02-15T05:00:00.000Z"), dueDate: parseSqlDate("2026-02-20"),
    } });
    immutableInvoiceCreated = true;

    const catchUpDate = () => new BillingScheduler(store, () => new Date("2026-04-16T05:00:00.000Z"), quiet);
    // Independent scheduler objects model separate backend workers.
    const originalEnsureDraft = store.ensurePeriodDraft.bind(store);
    let failOnePeriod = true;
    store.ensurePeriodDraft = async (scheduledContract, period, today) => {
      if (failOnePeriod && period.periodStart.toISOString().slice(0, 10) === "2026-02-15") {
        failOnePeriod = false;
        throw Object.assign(new Error("injected disposable DB retry"), { code: "INTEGRATION_RETRY" });
      }
      return originalEnsureDraft(scheduledContract, period, today);
    };
    await catchUpDate().runOnce();
    assert.equal(await prisma.invoice.count({ where: { contractId } }), 1, "a failed missing period does not let later periods hide the gap");
    assert.ok(schedulerLogs.errors.some((entry) => entry.event === "billing_period_draft_failed" && entry.period_start === "2026-02-15"), "failed period is observable and retriable");
    store.ensurePeriodDraft = originalEnsureDraft;
    await Promise.all([catchUpDate().runOnce(), catchUpDate().runOnce()]);
    const invoices = await prisma.invoice.findMany({ where: { contractId }, orderBy: { periodStart: "asc" } });
    assert.deepEqual(invoices.map((row) => [row.periodStart.toISOString().slice(0, 10), row.periodEnd.toISOString().slice(0, 10)]), [
      ["2026-01-15", "2026-02-14"], ["2026-02-15", "2026-03-14"], ["2026-03-15", "2026-04-14"], ["2026-04-15", "2026-04-15"],
    ], "all missed periods are inserted chronologically through effective Contract end");
    assert.equal(invoices[0].status, "unpaid", "an existing finalized Invoice is reused without state reset");
    assert.ok(invoices.slice(1).every((row) => row.status === "draft" && row.snapshotKind === "NOT_FINALIZED" && row.finalizedAt === null && row.dueDate === null),
      "the scheduler creates only non-finalized drafts for missing periods");
    assert.equal(await prisma.invoice.count({ where: { contractId } }), 4, "concurrent runs do not duplicate Contract periods");
    assert.equal(await prisma.notification.count({ where: { accountId, notificationType: "billing_period_closeout" } }), 4, "catch-up reminders are persisted once per period");

    await Promise.all([catchUpDate().runOnce(), catchUpDate().runOnce()]);
    assert.equal(await prisma.invoice.count({ where: { contractId } }), 4, "retries remain idempotent");
    assert.equal(await prisma.notification.count({ where: { accountId, notificationType: "billing_period_closeout" } }), 4, "reminder retries remain idempotent");
  } finally {
    // Finalized Invoice history is immutable in V1.8. When this test creates one,
    // leave the fixture intact for the disposable database harness to drop wholesale.
    if (!immutableInvoiceCreated) {
      if (contractId !== undefined) {
        await prisma.notification.deleteMany({ where: { notificationType: "billing_period_closeout", body: { contains: `Mã kỳ: ${ownerId}:${contractId}:` } } });
        await prisma.invoice.deleteMany({ where: { contractId } });
        await prisma.contract.deleteMany({ where: { contractId } });
      }
      if (accountId !== undefined) await prisma.account.deleteMany({ where: { accountId } });
      if (roomId !== undefined) await prisma.room.deleteMany({ where: { roomId } });
      if (propertyId !== undefined) await prisma.property.deleteMany({ where: { propertyId } });
      if (residentId !== undefined) await prisma.resident.deleteMany({ where: { residentId } });
      if (ownerId !== undefined) await prisma.owner.deleteMany({ where: { ownerId } });
    }
    await prisma.$disconnect();
  }
});
