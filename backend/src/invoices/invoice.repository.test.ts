import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { PrismaInvoiceRepository } from "./invoice.repository.js";
import { parseSqlDate } from "./invoice.billing.js";

const contract = (overrides: any = {}) => ({
  contractId: 77n, contractNo: "HD-77", roomId: 8n, propertyId: 4n, ownerId: 11n, representativeResidentId: 30n,
  startDate: parseSqlDate("2026-01-31"), endDate: parseSqlDate("2026-12-30"), terminationDate: null, status: "active",
  rentAmount: 3_500_000n, initialElectricKwh: "100.000", initialWaterM3: "20.000", room: { roomCode: "A01", property: { propertyId: 4n, name: "A", province: "HCM", address: "x" } }, ...overrides,
});
const invoice = (overrides: any = {}) => ({
  invoiceId: 501n, invoiceNo: "INV-77-20260228", contractId: 77n, propertyId: 4n, ownerId: 11n,
  periodStart: parseSqlDate("2026-02-28"), periodEnd: parseSqlDate("2026-03-30"), dueDate: null, rentAmount: 3_500_000n,
  electricityPreviousKwh: "100.000", electricityCurrentKwh: null, electricityAmount: 0n,
  waterPreviousM3: "20.000", waterCurrentM3: null, waterAmount: 0n, serviceAmount: 0n, totalAmount: 3_500_000n,
  status: "draft", snapshotKind: "NOT_FINALIZED", finalizedAt: null, revision: 1, createdAt: new Date("2026-03-01T00:00:00Z"), updatedAt: new Date("2026-03-01T00:00:00Z"),
  contract: contract(), paymentTransactions: [], ...overrides,
});
function fakePrisma(tx: any) { return { ...tx, $transaction: async (fnOrQueries: any) => typeof fnOrQueries === "function" ? fnOrQueries(tx) : Promise.all(fnOrQueries) } as any; }

test("draft generation locks Owner-scoped Contract and derives original-anchor period/context", async () => {
  const created: any[] = [];
  const tx: any = {
    $queryRaw: async () => [], contract: { findFirst: async () => contract() },
    invoice: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: any) => { created.push(data); return invoice({ ...data, periodStart: data.periodStart, periodEnd: data.periodEnd }); },
    },
  };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  const result = await repo.ensureNextDraft(11n, 77n, parseSqlDate("2026-03-01"));
  assert.equal(result.status, "draft");
  assert.equal(created.length, 1);
  assert.equal(created[0].ownerId, 11n);
  assert.equal(created[0].contractId, 77n);
  assert.equal(created[0].periodStart.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(created[0].periodEnd.toISOString().slice(0, 10), "2026-02-27");
  assert.equal(created[0].rentAmount, 3_500_000n);
  assert.equal(created[0].electricityPreviousKwh, "100.000");
  assert.equal(created[0].waterPreviousM3, "20.000");
  assert.equal(created[0].totalAmount, 3_500_000n);
  assert.equal(created[0].status, "draft");
  assert.equal(created[0].finalizedAt, null);
  assert.equal(created[0].dueDate, null);
});

test("generated draft openings use finalized same-Contract readings and exclude other continuity", async () => {
  const created: any[] = [];
  const queries: any[] = [];
  const previous = {
    invoiceId: 400n, ownerId: 11n, propertyId: 4n, contractId: 77n,
    periodStart: parseSqlDate("2026-01-31"), periodEnd: parseSqlDate("2026-02-27"),
    electricityCurrentKwh: "128.250", waterCurrentM3: "23.500",
  };
  const tx: any = {
    $queryRaw: async () => [], contract: { findFirst: async () => contract() },
    invoice: {
      findUnique: async () => null,
      findFirst: async (args: any) => { queries.push(args); return previous; },
      create: async ({ data }: any) => { created.push(data); return invoice(data); },
    },
  };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  await repo.ensureNextDraft(11n, 77n, parseSqlDate("2026-04-01"));
  assert.equal(created[0].electricityPreviousKwh, "128.250");
  assert.equal(created[0].waterPreviousM3, "23.500");
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.deepEqual(query.where, {
      ownerId: 11n, propertyId: 4n, contractId: 77n,
      status: { in: ["unpaid", "paid"] }, finalizedAt: { not: null },
      periodEnd: { lt: parseSqlDate("2026-02-28") },
    });
  }
});

test("draft is still created with null openings when its Contract baseline is missing", async () => {
  let created: any;
  const incompleteContract = contract({ initialElectricKwh: null, initialWaterM3: null });
  const tx: any = {
    $queryRaw: async () => [], contract: { findFirst: async () => incompleteContract },
    invoice: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: any) => { created = data; return invoice(data); },
    },
  };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  const draft = await repo.createDraft(11n, {
    contractId: 77n,
    periodStart: parseSqlDate("2026-01-31"),
    periodEnd: parseSqlDate("2026-02-27"),
  });
  assert.equal(draft.status, "draft");
  assert.equal(created.electricityPreviousKwh, null);
  assert.equal(created.waterPreviousM3, null);
});

test("repeated generate for same business date returns existing unique period", async () => {
  let creates = 0;
  const existing = invoice({ periodStart: parseSqlDate("2026-01-31"), periodEnd: parseSqlDate("2026-02-27") });
  const tx: any = { $queryRaw: async () => [], contract: { findFirst: async () => contract() }, invoice: {
    findUnique: async () => existing, create: async () => { creates += 1; return existing; },
  } };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  const first = await repo.ensureNextDraft(11n, 77n, parseSqlDate("2026-03-01"));
  const second = await repo.ensureNextDraft(11n, 77n, parseSqlDate("2026-03-01"));
  assert.equal(first.invoiceId, second.invoiceId);
  assert.equal(creates, 0);
});

test("manual create rejects non-anchor or client-clamped drift period", async () => {
  const tx: any = {
    $queryRaw: async () => [], contract: { findFirst: async ({ where }: any) => where.ownerId === 11n ? contract() : null },
    invoice: { findUnique: async () => null, findFirst: async () => null },
  };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  await assert.rejects(repo.createDraft(11n, { contractId: 77n, periodStart: parseSqlDate("2026-02-27"), periodEnd: parseSqlDate("2026-03-30") }), (error: any) => error.code === "VALIDATION_ERROR");
  await assert.rejects(repo.createDraft(12n, { contractId: 77n, periodStart: parseSqlDate("2026-01-31"), periodEnd: parseSqlDate("2026-02-27") }), (error: any) => error.status === 404);
});

test("generate creates the terminated Contract's full-rent final period and never a later period", async () => {
  const created: any[] = [];
  const terminated = contract({ status: "terminated", terminationDate: parseSqlDate("2026-03-20"), endDate: parseSqlDate("2026-12-31") });
  const tx: any = {
    $queryRaw: async () => [], contract: { findFirst: async () => terminated },
    invoice: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: any) => { created.push(data); return invoice({ ...data, contract: terminated }); },
    },
  };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  const result = await repo.ensureNextDraft(11n, 77n, parseSqlDate("2026-04-01"));
  assert.equal(result.status, "draft");
  assert.equal(created.length, 1);
  assert.equal(created[0].periodStart.toISOString().slice(0, 10), "2026-02-28");
  assert.equal(created[0].periodEnd.toISOString().slice(0, 10), "2026-03-20");
  assert.equal(created[0].rentAmount, terminated.rentAmount); // Full period rent; no proration.
});

test("Resident Invoice detail scope is authenticated Owner plus own Contract relation", async () => {
  let args: any;
  const prisma: any = { invoice: { findFirst: async (input: any) => { args = input; return null; } } };
  const repo = new PrismaInvoiceRepository(prisma);
  await repo.findForResident(11n, 30n, 501n);
  assert.deepEqual(args.where, {
    ownerId: 11n, invoiceId: 501n,
    contract: { ownerId: 11n, OR: [{ representativeResidentId: 30n }, { roomResidents: { some: { residentId: 30n, ownerId: 11n } } }] },
  });
});

test("Admin Invoice detail keeps Owner scope and loads Invoice Items with ordered Electricity tier children", async () => {
  let args: any;
  const prisma: any = { invoice: { findFirst: async (input: any) => { args = input; return null; } } };
  const repo = new PrismaInvoiceRepository(prisma);
  await repo.findForOwner(11n, 501n);
  assert.deepEqual(args.where, { ownerId: 11n, invoiceId: 501n });
  assert.deepEqual(args.include.invoiceItems, { include: { electricityTiers: { orderBy: { tierNo: "asc" } } }, orderBy: [{ invoiceItemId: "asc" }] });
});

test("Resident Zalo send history is scoped to their own Invoice and omits recipient/provider error fields", async () => {
  let invoiceWhere: any; let logArgs: any;
  const prisma: any = {
    invoice: { findFirst: async ({ where }: any) => { invoiceWhere = where; return { invoiceId: 501n }; } },
    invoiceZaloOaSendLog: { findMany: async (args: any) => { logArgs = args; return []; } },
  };
  const repo = new PrismaInvoiceRepository(prisma);
  await repo.listSendLogs(11n, 501n, 30n);
  assert.equal(invoiceWhere.ownerId, 11n);
  assert.equal(invoiceWhere.contract.OR[0].representativeResidentId, 30n);
  assert.deepEqual(logArgs.select, { sendLogId: true, invoiceId: true, invoiceRevision: true, status: true, providerMessageId: true, errorMessage: false, createdAt: true, sentAt: true });
  assert.equal(logArgs.select.recipientResidentId, undefined);
  assert.equal(logArgs.select.recipientPhone, undefined);
  assert.equal(logArgs.select.providerResponse, undefined);
});

test("successor Invoice recipient validation uses that Invoice Contract, never predecessor link", async () => {
  let recipientWhere: any;
  const tx: any = {
    $queryRaw: async () => [],
    invoice: { findFirst: async () => ({ invoiceId: 900n, contractId: 88n, propertyId: 4n, ownerId: 11n, revision: 1, status: "unpaid", finalizedAt: new Date(), contract: { contractId: 88n, propertyId: 4n, ownerId: 11n, representativeResidentId: 301n } }) },
    resident: { findFirst: async ({ where }: any) => { recipientWhere = where; return where.residentId === 301n ? { residentId: 301n, phone: "0900000000" } : null; } },
    invoiceZaloOaSendLog: { create: async ({ data }: any) => ({ sendLogId: 1000n, invoiceId: data.invoiceId, invoiceRevision: data.invoiceRevision, status: data.status, createdAt: new Date(), recipientResidentId: data.recipientResidentId, recipientPhone: data.recipientPhone }) },
  };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  const resolver = async () => ({ residentId: 201n, phone: "old-predecessor-phone" });
  await assert.rejects(repo.createQueuedZaloLog(11n, 900n, resolver), (error: any) => error.status === 503);
  assert.equal(recipientWhere.residentId, 201n);
  assert.equal(recipientWhere.ownerId, 11n);
  assert.deepEqual(recipientWhere.OR, [
    { residentId: 301n },
    { roomResidents: { some: { ownerId: 11n, contractId: 88n, residentId: 201n } } },
  ]);
});

test("finalize leaves draft unchanged when approved tariff/pricing configuration is missing", async () => {
  let updates = 0;
  const current = invoice({ electricityCurrentKwh: "120.000", waterCurrentM3: "24.000" });
  const tx: any = { $queryRaw: async () => [], invoice: { findFirst: async () => current, update: async () => { updates += 1; return current; } } };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  await assert.rejects(repo.finalize(11n, 501n, {}, { calculate: async () => null }, 99n, new Date("2026-10-08T12:00:00Z")), (error: any) => error.code === "INVOICE_DATA_INCOMPLETE");
  assert.equal(updates, 0);
  assert.equal(current.status, "draft");
});

test("finalize does not fall back to Contract initial readings when a draft opening is unresolved", async () => {
  for (const missing of [null, undefined]) {
    let updates = 0;
    const current = invoice({
      electricityPreviousKwh: missing,
      waterPreviousM3: missing,
      electricityCurrentKwh: "120.000",
      waterCurrentM3: "24.000",
    });
    const tx: any = { $queryRaw: async () => [], invoice: { findFirst: async () => current, update: async () => { updates += 1; return current; } } };
    const repo = new PrismaInvoiceRepository(fakePrisma(tx));
    await assert.rejects(repo.finalize(11n, 501n, {}, {
      calculate: async () => ({ electricityAmount: 1000n, waterAmount: 2000n, serviceAmount: 3000n }),
    }, 99n), (error: any) => error.status === 409 && error.code === "INVOICE_DATA_INCOMPLETE");
    assert.equal(updates, 0);
  }
});

test("finalize persists item snapshots and atomically derives totals, unpaid state and due date", async () => {
  let updateData: any;
  const current = invoice({ electricityCurrentKwh: "120.000", waterCurrentM3: "24.000" });
  const writes: string[] = [];
  const tx: any = { $queryRaw: async () => [], meterReading: { create: async ({ data }: any) => { writes.push(`meter:${data.utilityType}`); return { meterReadingId: data.utilityType === "ELECTRICITY" ? 701n : 702n }; } }, invoiceMeterReadingSnapshot: { createMany: async ({ data }: any) => { writes.push(`snapshots:${data.length}`); } }, invoiceItem: { create: async ({ data }: any) => { writes.push(`item:${data.category}`); return { invoiceItemId: BigInt(writes.length + 800) }; } }, invoiceItemElectricityTier: { createMany: async ({ data }: any) => { writes.push(`tiers:${data.length}`); } }, flexibleServiceCharge: { updateMany: async () => ({ count: 0 }) }, invoice: {
    findFirst: async () => current,
    update: async ({ data }: any) => { updateData = data; return { ...current, ...data }; },
  } };
  const repo = new PrismaInvoiceRepository(fakePrisma(tx));
  const result = await repo.finalize(11n, 501n, {}, { calculate: async (draft, context) => {
    assert.equal(draft.electricityPreviousKwh, "100.000");
    assert.equal(context.contractId, 77n);
    return { rentAmount: 3_500_000n, electricityAmount: 1000n, waterAmount: 2000n, serviceAmount: 3000n, totalAmount: 3_506_000n,
      electricityOpening: { value: "100.000", source: { sourceKind: "CONTRACT_INITIAL", sourceContractId: 77n, readingAt: null } }, waterOpening: { value: "20.000", source: { sourceKind: "CONTRACT_INITIAL", sourceContractId: 77n, readingAt: null } }, electricityEnding: "120.000", waterEnding: "24.000", flexibleChargeIds: [],
      items: [
        { itemKey: "RENT", category: "RENT", amount: 3_500_000n },
        { itemKey: "ELECTRICITY", category: "ELECTRICITY", amount: 1000n, utilityTariffVersionId: 1n, electricityTiers: [{ electricityTariffTierId: 11n, tierNo: 1, lowerKwh: "0.000", upperKwh: null, quantity: "20.000", unitPrice: 50n, amount: 1000n }] },
        { itemKey: "WATER", category: "WATER", amount: 2000n },
        { itemKey: "FIXED_SERVICE:1", category: "FIXED_SERVICE", amount: 3000n },
      ] };
  } }, 99n, new Date("2026-10-08T18:00:00.000Z"));
  assert.ok(result);
  assert.equal(updateData.status, "unpaid");
  assert.equal(updateData.snapshotKind, "ITEMIZED");
  assert.equal(updateData.totalAmount, 3_506_000n);
  assert.equal(updateData.dueDate.toISOString().slice(0, 10), "2026-10-14");
  assert.equal(updateData.finalizedAt.toISOString(), "2026-10-08T18:00:00.000Z");
  assert.equal(result.isOverdue, false);
  assert.deepEqual(writes.slice(0, 3), ["meter:ELECTRICITY", "meter:WATER", "snapshots:4"]);
  assert.ok(writes.includes("tiers:1"));
  assert.equal(writes.at(-1), "item:FIXED_SERVICE");
});

test("finalize retries Prisma and PostgreSQL serialization conflicts so the loser observes committed state", async () => {
  const serializationErrors = [
    new Prisma.PrismaClientKnownRequestError("serialization conflict", { code: "P2034", clientVersion: "test" }),
    new Prisma.PrismaClientKnownRequestError("raw lock query serialization conflict", { code: "P2010", clientVersion: "test", meta: { code: "40001", message: "could not serialize access due to concurrent update" } }),
  ];
  for (const serializationError of serializationErrors) {
    let attempts = 0;
    const current = invoice({ status: "draft", electricityCurrentKwh: "120.000", waterCurrentM3: "24.000" });
    const tx: any = { $queryRaw: async () => [], invoice: { findFirst: async () => current } };
    const prisma: any = { $transaction: async (callback: (transaction: any) => Promise<unknown>) => {
      attempts += 1;
      if (attempts === 1) {
        current.status = "unpaid";
        current.snapshotKind = "ITEMIZED";
        current.finalizedAt = new Date("2026-10-08T18:00:00Z");
        throw serializationError;
      }
      return callback(tx);
    } };
    const repo = new PrismaInvoiceRepository(prisma);
    await assert.rejects(repo.finalize(11n, 501n, {}, { calculate: async () => null }, 99n), (error: any) => error.code === "INVOICE_ALREADY_FINALIZED");
    assert.equal(attempts, 2);
  }
});

test("finalized amendment and paid financial mutation are rejected", async () => {
  for (const [status, expected] of [["unpaid", "INVOICE_AMENDMENT_NOT_ALLOWED"], ["paid", "INVOICE_ALREADY_PAID"]] as const) {
    let updates = 0;
    const tx: any = { $queryRaw: async () => [], invoice: { findFirst: async () => invoice({ status, finalizedAt: new Date(), dueDate: parseSqlDate("2026-10-01") }), update: async () => { updates += 1; } } };
    const repo = new PrismaInvoiceRepository(fakePrisma(tx));
    await assert.rejects(repo.patchDraft(11n, 501n, { electricityCurrentKwh: "130" }), (error: any) => error.code === expected);
    assert.equal(updates, 0);
  }
});

test("Zalo sends reject draft/paid/unfinalized Invoice before recipient lookup", async () => {
  for (const row of [invoice(), invoice({ status: "paid", finalizedAt: new Date(), dueDate: parseSqlDate("2026-10-01") }), invoice({ status: "unpaid", finalizedAt: null })]) {
    let recipientReads = 0; let logCreates = 0;
    const tx: any = {
      $queryRaw: async () => [],
      invoice: { findFirst: async () => ({ ...row, contract: contract() }) },
      resident: { findFirst: async () => { recipientReads += 1; return null; } },
      invoiceZaloOaSendLog: { create: async () => { logCreates += 1; } },
    };
    const repo = new PrismaInvoiceRepository(fakePrisma(tx));
    await assert.rejects(repo.createQueuedZaloLog(11n, 501n, async () => ({ residentId: 30n, phone: null })), (error: any) => error.code === "INVOICE_NOT_SENDABLE");
    assert.equal(recipientReads, 0); assert.equal(logCreates, 0);
  }
});
