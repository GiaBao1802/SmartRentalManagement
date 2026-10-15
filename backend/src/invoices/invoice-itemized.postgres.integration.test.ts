import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaAuthRepository } from "../auth/account-repository.js";
import { InMemorySessionStore, createOpaqueSessionToken, hashSessionToken } from "../auth/session-store.js";
import { createSessionRecord } from "../middleware/auth.js";
import { makeCsrfToken } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { loadEnv } from "../config/env.js";
import { createV1Router } from "../auth/v1.router.js";
import { PrismaInvoiceRepository } from "./invoice.repository.js";
import { PrismaItemizedInvoicePricing } from "./invoice-itemized.pricing.js";
import { dueDateFromFinalizedAt, formatSqlDate, parseSqlDate } from "./invoice.billing.js";
import { InvoiceZaloService } from "../zalo/invoice-zalo.service.js";
import { UnconfiguredZaloProvider } from "../zalo/zalo-provider.js";

const databaseUrl = process.env.GOCTRO_V18_REHEARSAL_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const adminAccountId = 1n;
const ownerId = 1n;
const contractId = 3001n;

test("PostgreSQL V1.8 itemized finalize supports recurring Parking and rolls back failures", { skip: !enabled }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const repository = new PrismaInvoiceRepository(prisma);
  const pricing = new PrismaItemizedInvoicePricing();
  const servers: Server[] = [];
  try {
    const identity = await prisma.$queryRaw<Array<{ db: string; port: number }>>`SELECT current_database() AS db, inet_server_port() AS port`;
    assert.deepEqual(identity, [{ db: "goctro_v18_rehearsal", port: 55432 }], "integration safety guard: only the dedicated V1.8 disposable rehearsal database is allowed");

    // Exercise the same V1 router, auth middleware, repository, and pricing adapter
    // that production app.ts wires, over a real HTTP request and PostgreSQL transaction.
    const config = loadEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl!, FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "invoice-v18-route-test-secret-with-32-bytes" });
    const sessions = new InMemorySessionStore();
    const authRepository = new PrismaAuthRepository(prisma);
    const admin = await authRepository.findCurrentAccount(adminAccountId);
    assert.ok(admin && admin.role === "admin" && admin.ownerId === ownerId && admin.status === "active", "fixture Admin must be active and scoped to the invoice Owner");
    const resident = await prisma.account.findFirst({ where: { role: "resident", status: "active" }, select: { accountId: true } });
    assert.ok(resident, "fixture must contain an active Resident for role authorization coverage");
    const installSession = async (accountId: bigint) => {
      const token = createOpaqueSessionToken();
      const csrf = makeCsrfToken(config.sessionSecret);
      await sessions.set(createSessionRecord(accountId, hashSessionToken(token, config.sessionSecret), config));
      return { cookie: `gt_session=${token}; gt_csrf=${csrf}`, csrf };
    };
    let adminSession = await installSession(adminAccountId);
    const residentSession = await installSession(resident.accountId);
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    app.use("/api/v1", createV1Router({
      config, repository: authRepository, sessions, invoiceRepository: repository, invoicePricing: pricing,
      invoiceZalo: new InvoiceZaloService(repository, new UnconfiguredZaloProvider()),
    } as any));
    app.use(errorHandler);
    const server: Server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const csrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`);
    assert.equal(csrfResponse.status, 200);
    const csrfBody = await csrfResponse.json() as { data: { csrf_token: string } };
    const csrfCookie = csrfResponse.headers.get("set-cookie")?.match(/gt_csrf=([^;]+)/)?.[1];
    assert.ok(csrfCookie && csrfBody.data.csrf_token);
    const sessionCookie = adminSession.cookie.match(/gt_session=([^;]+)/)?.[1];
    assert.ok(sessionCookie);
    adminSession = { csrf: csrfBody.data.csrf_token, cookie: `gt_session=${sessionCookie}; gt_csrf=${csrfCookie}` };
    const postFinalize = async (invoiceId: bigint, session = adminSession, key = `finalize-${invoiceId}-${Date.now()}-${Math.random()}`, body: unknown = {}) => fetch(`${baseUrl}/api/v1/invoices/${invoiceId}/finalize`, {
      method: "POST",
      headers: { Cookie: session.cookie, Origin: config.frontendOrigin, "X-CSRF-Token": session.csrf, "Idempotency-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const makeDraft = async (periodStart: string, periodEnd: string, invoiceNo: string, currentElectric: string, currentWater: string, occurredAt: string) => prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findFirst({ where: { contractId, ownerId }, select: { contractId: true, roomId: true, propertyId: true, rentAmount: true } });
      assert.ok(contract);
      const invoice = await tx.invoice.create({ data: {
        invoiceNo, contractId, propertyId: contract.propertyId, ownerId,
        periodStart: parseSqlDate(periodStart), periodEnd: parseSqlDate(periodEnd),
        rentAmount: contract.rentAmount, electricityPreviousKwh: periodStart === "2026-11-15" ? "1450.000" : "1460.000", electricityCurrentKwh: currentElectric,
        electricityAmount: 0n, waterPreviousM3: periodStart === "2026-11-15" ? "81.000" : "82.000", waterCurrentM3: currentWater,
        waterAmount: 0n, serviceAmount: 0n, totalAmount: contract.rentAmount, status: "draft", snapshotKind: "NOT_FINALIZED", revision: 1,
      }, select: { invoiceId: true } });
      const suffix = `${periodStart}-${periodEnd}`;
      await tx.flexibleServiceCharge.create({ data: {
        ownerId, propertyId: contract.propertyId, roomId: contract.roomId, contractId, residentId: 1001n,
        propertyPricingItemId: 11004n, kind: "FLEXIBLE_SERVICE", propertyPriceVersionId: 4n,
        occurredAt: new Date(occurredAt), quantity: "1.000", unit: "lần", unitPriceSnapshot: 20000n, amount: 20000n,
        sourceSystem: "itemized-integration", sourceEventKey: suffix, payloadFingerprint: Buffer.alloc(32, 0x5a), status: "READY", actorAccountId: adminAccountId,
      } });
      return invoice.invoiceId;
    });

    const successId = await makeDraft("2026-11-15", "2026-12-14", "INV-ITEMIZED-IT-SUCCESS", "1460.000", "82.000", "2026-11-20T05:00:00.000Z");
    const finalizedResponse = await postFinalize(successId, adminSession, "route-success-1");
    assert.equal(finalizedResponse.status, 200, await finalizedResponse.clone().text());
    const finalizedBody = await finalizedResponse.json() as { data: { status: string; snapshot_kind: string; finalized_at: string | null; due_date: string | null } };
    assert.equal(finalizedBody.data.status, "unpaid");
    assert.equal(finalizedBody.data.snapshot_kind, "ITEMIZED");
    assert.ok(finalizedBody.data.finalized_at);
    const success = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: successId }, include: { invoiceItems: { include: { electricityTiers: true } }, meterReadingSnapshots: true } });
    assert.equal(success.snapshotKind, "ITEMIZED");
    assert.ok(success.finalizedAt instanceof Date);
    assert.equal(finalizedBody.data.due_date, formatSqlDate(dueDateFromFinalizedAt(success.finalizedAt!)), "API due date follows five calendar days in the business timezone");
    assert.equal(formatSqlDate(success.dueDate!), finalizedBody.data.due_date, "persisted due date matches the route result");
    assert.equal(success.invoiceItems.length, 8); // Rent, 2 utilities, 3 fixed, 1 flexible, 1 paid parking.
    assert.equal(success.invoiceItems.filter((item) => item.category === "RENT").length, 1);
    assert.equal(success.invoiceItems.filter((item) => item.category === "ELECTRICITY").length, 1);
    assert.equal(success.invoiceItems.filter((item) => item.category === "WATER").length, 1);
    assert.equal(success.invoiceItems.filter((item) => item.category === "FIXED_SERVICE").length, 3);
    assert.equal(success.invoiceItems.filter((item) => item.category === "FLEXIBLE_SERVICE").length, 1);
    const recurringParking = success.invoiceItems.find((item) => item.category === "PARKING");
    assert.ok(recurringParking);
    assert.equal(recurringParking.parkingAssignmentId, 8404n, "the active assignment already billed on an earlier invoice recurs on this invoice");
    assert.equal(recurringParking.invoiceId, successId);
    assert.equal(success.meterReadingSnapshots.length, 4);
    const electric = success.invoiceItems.find((item) => item.category === "ELECTRICITY");
    assert.ok(electric);
    assert.equal(electric.electricityTiers.length, 3);
    assert.equal(success.totalAmount, success.invoiceItems.reduce((sum, item) => sum + item.amount, 0n));
    assert.equal(success.rentAmount, success.invoiceItems.filter((item) => item.category === "RENT").reduce((sum, item) => sum + item.amount, 0n));
    assert.equal(success.electricityAmount, success.invoiceItems.filter((item) => item.category === "ELECTRICITY").reduce((sum, item) => sum + item.amount, 0n));
    assert.equal(success.waterAmount, success.invoiceItems.filter((item) => item.category === "WATER").reduce((sum, item) => sum + item.amount, 0n));
    assert.equal(success.serviceAmount, success.invoiceItems.filter((item) => ["FIXED_SERVICE", "FLEXIBLE_SERVICE", "PARKING"].includes(item.category)).reduce((sum, item) => sum + item.amount, 0n));
    const consumed = await prisma.flexibleServiceCharge.findFirstOrThrow({ where: { sourceSystem: "itemized-integration", sourceEventKey: "2026-11-15-2026-12-14" } });
    assert.equal(consumed.status, "INVOICED");
    assert.equal(consumed.invoiceId, successId);
    assert.equal(success.meterReadingSnapshots.find((row) => row.utilityType === "ELECTRICITY" && row.snapshotRole === "OPENING")?.sourceInvoiceId, 5010n);
    assert.ok(success.meterReadingSnapshots.filter((row) => row.snapshotRole === "ENDING").every((row) => row.sourceMeterReadingId !== null));

    const retryResponse = await postFinalize(successId, adminSession, "route-success-retry");
    assert.equal(retryResponse.status, 409);
    assert.equal((await retryResponse.json()).error.code, "INVOICE_ALREADY_FINALIZED");
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: successId } }), 8, "re-finalize does not duplicate invoice lines");
    assert.equal(await prisma.invoiceMeterReadingSnapshot.count({ where: { invoiceId: successId } }), 4, "re-finalize does not duplicate meter snapshots");
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: successId, category: "FLEXIBLE_SERVICE" } }), 1, "re-finalize does not duplicate Flexible consumption line");

    const noSession = { cookie: `gt_csrf=${csrfCookie}`, csrf: csrfBody.data.csrf_token };
    const unauthenticatedResponse = await postFinalize(successId, noSession, "route-no-session");
    assert.equal(unauthenticatedResponse.status, 401, "missing session is rejected");
    const invalidCsrfResponse = await postFinalize(successId, { ...adminSession, csrf: "invalid-token" }, "route-invalid-csrf");
    assert.equal(invalidCsrfResponse.status, 403, "invalid CSRF token is rejected");

    const residentResponse = await postFinalize(successId, residentSession, "route-resident-denied");
    assert.equal(residentResponse.status, 403, "Resident cannot finalize an Invoice");
    const foreignResponse = await postFinalize(999999999999n, adminSession, "route-owner-not-found");
    assert.equal(foreignResponse.status, 404, "Invoice outside/missing from the Admin Owner scope is indistinguishable");
    const foreignInvoice = await prisma.invoice.findFirst({ where: { ownerId: { not: ownerId } }, select: { invoiceId: true } });
    if (foreignInvoice) {
      const foreignOwnerResponse = await postFinalize(foreignInvoice.invoiceId, adminSession, "route-foreign-owner");
      assert.equal(foreignOwnerResponse.status, 404, "a real Invoice belonging to another Owner is not disclosed");
    }

    const duplicateInvoiceId = await makeDraft("2027-01-15", "2027-02-14", "INV-ITEMIZED-IT-CONCURRENT", "1480.000", "84.000", "2027-01-20T05:00:00.000Z");
    const parkingItemData = {
      ownerId: recurringParking.ownerId, propertyId: recurringParking.propertyId, contractId: recurringParking.contractId,
      category: recurringParking.category, sourceType: recurringParking.sourceType, sourceReference: recurringParking.sourceReference,
      propertyPriceVersionId: recurringParking.propertyPriceVersionId, pricingKind: recurringParking.pricingKind,
      parkingAssignmentId: recurringParking.parkingAssignmentId, parkingEntitlementId: recurringParking.parkingEntitlementId,
      labelSnapshot: recurringParking.labelSnapshot, descriptionSnapshot: recurringParking.descriptionSnapshot,
      quantity: recurringParking.quantity, unit: recurringParking.unit, unitPriceSnapshot: recurringParking.unitPriceSnapshot,
      amount: recurringParking.amount, calculationRuleVersion: recurringParking.calculationRuleVersion,
      applicablePeriodStart: recurringParking.applicablePeriodStart, applicablePeriodEnd: recurringParking.applicablePeriodEnd,
    };
    const duplicateAttempts = await Promise.allSettled([1, 2].map((attempt) => prisma.$transaction((tx) => tx.invoiceItem.create({
      data: { ...parkingItemData, invoiceId: duplicateInvoiceId, itemKey: `concurrent-parking-${attempt}` },
    }))));
    assert.equal(duplicateAttempts.filter((result) => result.status === "fulfilled").length, 1, "concurrent duplicate assignment attempts have exactly one winner");
    assert.equal(duplicateAttempts.filter((result) => result.status === "rejected").length, 1, "the partial unique index rejects the losing concurrent insert");
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: duplicateInvoiceId, parkingAssignmentId: recurringParking.parkingAssignmentId } }), 1);
    const duplicateParkingResponse = await postFinalize(duplicateInvoiceId, adminSession, "route-parking-duplicate");
    assert.equal(duplicateParkingResponse.status, 409, "duplicate Parking linkage is mapped to a safe conflict");
    assert.equal((await duplicateParkingResponse.json()).error.code, "CONFLICT");
    const duplicateParkingInvoice = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: duplicateInvoiceId } });
    assert.equal(duplicateParkingInvoice.status, "draft", "duplicate Parking failure rolls back lifecycle changes");
    assert.equal(duplicateParkingInvoice.snapshotKind, "NOT_FINALIZED");
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: duplicateInvoiceId } }), 1, "only the pre-existing conflicting Parking item remains");

    const invalidReadingId = await makeDraft("2027-03-15", "2027-04-14", "INV-ITEMIZED-IT-BAD-READING", "1500.000", "86.000", "2027-03-20T05:00:00.000Z");
    const invalidReadingResponse = await postFinalize(invalidReadingId, adminSession, "route-invalid-reading", { electricity_current_kwh: "1459", water_current_m3: "82" });
    assert.equal(invalidReadingResponse.status, 400);
    const invalidReadingInvoice = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: invalidReadingId } });
    assert.equal(invalidReadingInvoice.status, "draft");
    assert.equal(invalidReadingInvoice.snapshotKind, "NOT_FINALIZED");

    const concurrentFinalizeId = await makeDraft("2027-02-15", "2027-03-14", "INV-ITEMIZED-IT-FINALIZE-RACE", "1490.000", "85.000", "2027-02-20T05:00:00.000Z");
    const concurrentResponses = await Promise.all([
      postFinalize(concurrentFinalizeId, adminSession, "route-finalize-race-a"),
      postFinalize(concurrentFinalizeId, adminSession, "route-finalize-race-b"),
    ]);
    assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [200, 409], "one concurrent request finalizes; the other re-reads and returns a conflict");
    const concurrentErrors = await Promise.all(concurrentResponses.map(async (response) => response.status === 409 ? (await response.json()).error.code : null));
    assert.ok(concurrentErrors.includes("INVOICE_ALREADY_FINALIZED"));
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: concurrentFinalizeId } }), 8, "concurrent finalize persists one set of itemized rows");

    const rollbackId = await makeDraft("2026-12-15", "2027-01-14", "INV-ITEMIZED-IT-ROLLBACK", "1470.000", "83.000", "2027-01-05T05:00:00.000Z");
    const readingsBeforeRollback = await prisma.meterReading.count({ where: { ownerId, contractId } });
    const injectedApp = express();
    injectedApp.use(requestIdMiddleware);
    injectedApp.use(express.json());
    const injectedPricing = {
      calculate: async (invoice: any, contract: any, tx: unknown) => {
        const plan = await pricing.calculate(invoice, contract, tx);
        assert.ok(plan);
        const parking = plan.items.find((item: any) => item.category === "PARKING");
        assert.ok(parking);
        // Force the actual invoice item source trigger to reject after snapshots/charge consumption.
        parking.parkingEntitlementId = 13001n;
        return plan;
      },
    };
    injectedApp.use("/api/v1", createV1Router({
      config, repository: authRepository, sessions, invoiceRepository: repository, invoicePricing: injectedPricing,
      invoiceZalo: new InvoiceZaloService(repository, new UnconfiguredZaloProvider()),
    } as any));
    injectedApp.use(errorHandler);
    const injectedServer: Server = createServer(injectedApp);
    servers.push(injectedServer);
    await new Promise<void>((resolve) => injectedServer.listen(0, "127.0.0.1", resolve));
    const injectedAddress = injectedServer.address();
    assert.ok(injectedAddress && typeof injectedAddress !== "string");
    const injectedResponse = await fetch(`http://127.0.0.1:${injectedAddress.port}/api/v1/invoices/${rollbackId}/finalize`, {
      method: "POST", headers: { Cookie: adminSession.cookie, Origin: config.frontendOrigin, "X-CSRF-Token": adminSession.csrf, "Idempotency-Key": "route-rollback-injected", "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(injectedResponse.status, 500);
    const injectedBody = await injectedResponse.json() as { error: { code: string; message: string } };
    assert.equal(injectedBody.error.code, "INTERNAL_ERROR");
    assert.doesNotMatch(JSON.stringify(injectedBody), /23514|constraint|trigger|parking_entitlement/i, "database internals must not leak through the API");
    const untouched = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: rollbackId } });
    assert.equal(untouched.status, "draft");
    assert.equal(untouched.snapshotKind, "NOT_FINALIZED");
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: rollbackId } }), 0);
    assert.equal(await prisma.invoiceMeterReadingSnapshot.count({ where: { invoiceId: rollbackId } }), 0);
    assert.equal(await prisma.invoiceItemElectricityTier.count({ where: { invoiceItem: { invoiceId: rollbackId } } }), 0);
    assert.equal(await prisma.meterReading.count({ where: { ownerId, contractId } }), readingsBeforeRollback, "failed finalization leaves no meter-reading residue");
    const readyCharge = await prisma.flexibleServiceCharge.findFirstOrThrow({ where: { sourceSystem: "itemized-integration", sourceEventKey: "2026-12-15-2027-01-14" } });
    assert.equal(readyCharge.status, "READY");
    assert.equal(readyCharge.invoiceId, null);

    const missingPricingId = await makeDraft("2027-04-15", "2027-05-14", "INV-ITEMIZED-IT-NO-PRICING", "1510.000", "87.000", "2027-04-20T05:00:00.000Z");
    const missingPricingApp = express();
    missingPricingApp.use(requestIdMiddleware);
    missingPricingApp.use(express.json());
    missingPricingApp.use("/api/v1", createV1Router({
      config, repository: authRepository, sessions, invoiceRepository: repository,
      invoicePricing: { calculate: async () => null },
      invoiceZalo: new InvoiceZaloService(repository, new UnconfiguredZaloProvider()),
    } as any));
    missingPricingApp.use(errorHandler);
    const missingPricingServer: Server = createServer(missingPricingApp);
    servers.push(missingPricingServer);
    await new Promise<void>((resolve) => missingPricingServer.listen(0, "127.0.0.1", resolve));
    const missingPricingAddress = missingPricingServer.address();
    assert.ok(missingPricingAddress && typeof missingPricingAddress !== "string");
    const missingPricingResponse = await fetch(`http://127.0.0.1:${missingPricingAddress.port}/api/v1/invoices/${missingPricingId}/finalize`, {
      method: "POST", headers: { Cookie: adminSession.cookie, Origin: config.frontendOrigin, "X-CSRF-Token": adminSession.csrf, "Idempotency-Key": "route-no-pricing", "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(missingPricingResponse.status, 409);
    assert.equal((await missingPricingResponse.json()).error.code, "INVOICE_DATA_INCOMPLETE");
    const missingPricingInvoice = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: missingPricingId } });
    assert.equal(missingPricingInvoice.status, "draft");
    assert.equal(missingPricingInvoice.snapshotKind, "NOT_FINALIZED");

    const flexibleConflictId = await makeDraft("2027-05-15", "2027-06-14", "INV-ITEMIZED-IT-FLEX-CONFLICT", "1520.000", "88.000", "2027-05-20T05:00:00.000Z");
    const conflictingCharge = await prisma.flexibleServiceCharge.findFirstOrThrow({ where: { sourceSystem: "itemized-integration", sourceEventKey: "2027-05-15-2027-06-14" } });
    const conflictPricing = {
      calculate: async (invoice: any, contract: any, tx: any) => {
        const plan = await pricing.calculate(invoice, contract, tx);
        assert.ok(plan?.flexibleChargeIds.includes(conflictingCharge.flexibleServiceChargeId));
        // Model another eligible Invoice claiming the charge between resolution and atomic consumption.
        await tx.flexibleServiceCharge.updateMany({ where: { flexibleServiceChargeId: conflictingCharge.flexibleServiceChargeId, status: "READY", invoiceId: null }, data: { status: "INVOICED", invoiceId: successId } });
        return plan;
      },
    };
    const conflictApp = express();
    conflictApp.use(requestIdMiddleware);
    conflictApp.use(express.json());
    conflictApp.use("/api/v1", createV1Router({
      config, repository: authRepository, sessions, invoiceRepository: repository, invoicePricing: conflictPricing,
      invoiceZalo: new InvoiceZaloService(repository, new UnconfiguredZaloProvider()),
    } as any));
    conflictApp.use(errorHandler);
    const conflictServer = createServer(conflictApp);
    servers.push(conflictServer);
    await new Promise<void>((resolve) => conflictServer.listen(0, "127.0.0.1", resolve));
    const conflictAddress = conflictServer.address();
    assert.ok(conflictAddress && typeof conflictAddress !== "string");
    const flexibleConflictResponse = await fetch(`http://127.0.0.1:${conflictAddress.port}/api/v1/invoices/${flexibleConflictId}/finalize`, {
      method: "POST", headers: { Cookie: adminSession.cookie, Origin: config.frontendOrigin, "X-CSRF-Token": adminSession.csrf, "Idempotency-Key": "route-flexible-conflict", "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(flexibleConflictResponse.status, 409);
    assert.equal((await flexibleConflictResponse.json()).error.code, "INVOICE_DATA_INCOMPLETE");
    const flexibleConflictInvoice = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: flexibleConflictId } });
    assert.equal(flexibleConflictInvoice.status, "draft");
    assert.equal(flexibleConflictInvoice.snapshotKind, "NOT_FINALIZED");
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: flexibleConflictId } }), 0);
    assert.equal(await prisma.invoiceMeterReadingSnapshot.count({ where: { invoiceId: flexibleConflictId } }), 0);
    assert.equal(await prisma.invoiceItemElectricityTier.count({ where: { invoiceItem: { invoiceId: flexibleConflictId } } }), 0);
    const unconsumedAfterRollback = await prisma.flexibleServiceCharge.findUniqueOrThrow({ where: { flexibleServiceChargeId: conflictingCharge.flexibleServiceChargeId } });
    assert.equal(unconsumedAfterRollback.status, "READY", "failed Flexible consumption transaction rolls back the competing claim");
    assert.equal(unconsumedAfterRollback.invoiceId, null);
  } finally {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await prisma.$disconnect();
  }
});
