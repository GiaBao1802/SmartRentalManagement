import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { parseSqlDate } from "./invoice.billing.js";
import { PrismaBillingWorkspaceRepository } from "./billing-workspace.repository.js";
import { PrismaItemizedInvoicePricing } from "./invoice-itemized.pricing.js";

const databaseUrl = process.env.GOCTRO_BILLING_WORKSPACE_V18_DATABASE_URL;

test("PostgreSQL V1.8 workspace resolves readiness, lifecycle, missing draft, and Owner scope without inspection writes", { skip: !databaseUrl }, async () => {
  const target = new URL(databaseUrl!);
  assert.equal(target.hostname, "127.0.0.1", "integration only accepts loopback rehearsal targets");
  assert.equal(target.port, "55439", "integration only accepts its dedicated rehearsal port");
  assert.equal(target.pathname, "/goctro_billing_workspace_rehearsal", "integration refuses any non-disposable database name");

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const pricing = new PrismaItemizedInvoicePricing();
  const repository = new PrismaBillingWorkspaceRepository(prisma, pricing);
  const ownerId = 1n;
  const contractId = 3001n;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const invoiceNumbers = [`WS-E-${suffix}`.slice(0, 40), `WS-W-${suffix}`.slice(0, 40)];
  let anomalyContractId: bigint | null = null;
  let missingDraftResidentId: bigint | null = null;
  let invalidChargeId: bigint | null = null;
  try {
    const identity = await prisma.$queryRaw<Array<{ db: string; port: number }>>`SELECT current_database() AS db, inet_server_port() AS port`;
    assert.deepEqual(identity, [{ db: "goctro_billing_workspace_rehearsal", port: 55439 }]);
    const contract = await prisma.contract.findFirstOrThrow({
      where: { contractId, ownerId },
      include: { room: { select: { roomCode: true, property: { select: { name: true } } } } },
    });
    const makeDraft = (invoiceNo: string, periodStart: string, periodEnd: string, electric: string | null, water: string | null) => prisma.invoice.create({
      data: {
        invoiceNo, contractId, propertyId: contract.propertyId, ownerId,
        periodStart: parseSqlDate(periodStart), periodEnd: parseSqlDate(periodEnd),
        rentAmount: contract.rentAmount, electricityCurrentKwh: electric, waterCurrentM3: water,
        totalAmount: contract.rentAmount, status: "draft", snapshotKind: "NOT_FINALIZED", revision: 1,
      },
    });
    const electricityMissing = await makeDraft(invoiceNumbers[0]!, "2026-11-15", "2026-12-14", null, "82.000");
    const waterMissing = await makeDraft(invoiceNumbers[1]!, "2026-12-15", "2027-01-14", "1460.000", null);

    const inspect = (invoice: typeof electricityMissing) => pricing.inspect(invoice, contract, prisma);
    const electricityResult = await inspect(electricityMissing);
    assert.ok(electricityResult.missingOrInvalid.some((reason) => reason.code === "ELECTRICITY_ENDING_MISSING"));
    assert.ok(!electricityResult.missingOrInvalid.some((reason) => reason.code === "WATER_ENDING_MISSING"));
    const waterResult = await inspect(waterMissing);
    assert.ok(waterResult.missingOrInvalid.some((reason) => reason.code === "WATER_ENDING_MISSING"));
    assert.ok(!waterResult.missingOrInvalid.some((reason) => reason.code === "ELECTRICITY_ENDING_MISSING"));

    const itemCountBefore = await prisma.invoiceItem.count({ where: { invoiceId: electricityMissing.invoiceId } });
    const snapshotCountBefore = await prisma.invoiceMeterReadingSnapshot.count({ where: { invoiceId: electricityMissing.invoiceId } });
    const flexibleBefore = await prisma.flexibleServiceCharge.count({ where: { invoiceId: electricityMissing.invoiceId } });
    await prisma.invoice.update({ where: { invoiceId: electricityMissing.invoiceId }, data: { electricityCurrentKwh: "1460.000" } });
    const readyInvoice = await prisma.invoice.findUniqueOrThrow({ where: { invoiceId: electricityMissing.invoiceId } });
    const readyResult = await inspect(readyInvoice);
    assert.deepEqual(readyResult, { readyToFinalize: true, missingOrInvalid: [] }, "all existing seeded billing sources resolve for the ready fixture");
    assert.equal(await prisma.invoiceItem.count({ where: { invoiceId: electricityMissing.invoiceId } }), itemCountBefore, "readiness does not write Invoice Items");
    assert.equal(await prisma.invoiceMeterReadingSnapshot.count({ where: { invoiceId: electricityMissing.invoiceId } }), snapshotCountBefore, "readiness does not write meter snapshots");
    assert.equal(await prisma.flexibleServiceCharge.count({ where: { invoiceId: electricityMissing.invoiceId } }), flexibleBefore, "readiness does not consume charges");

    const flexibleVersion = await prisma.propertyPriceVersion.findFirstOrThrow({
      where: { propertyPricingItemId: 11004n, publishedAt: { gt: new Date("2000-01-01T00:00:00.000Z") }, effectiveFrom: { lte: parseSqlDate("2026-11-20") } },
      orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }],
    });
    const invalidCharge = await prisma.flexibleServiceCharge.create({ data: {
      ownerId, propertyId: 11n, roomId: contract.roomId, contractId,
      residentId: contract.representativeResidentId, propertyPricingItemId: 11004n, kind: "FLEXIBLE_SERVICE",
      propertyPriceVersionId: flexibleVersion.propertyPriceVersionId, occurredAt: new Date("2026-11-20T05:00:00.000Z"),
      quantity: "1.000", unit: "lần", unitPriceSnapshot: flexibleVersion.unitPrice, amount: flexibleVersion.unitPrice + 1n,
      sourceSystem: "billing-workspace-test", sourceEventKey: suffix, payloadFingerprint: Buffer.alloc(32, 0x47),
      status: "READY", actorAccountId: 1n,
    } });
    invalidChargeId = invalidCharge.flexibleServiceChargeId;
    const flexibleMismatch = await inspect(readyInvoice);
    assert.ok(flexibleMismatch.missingOrInvalid.some((reason) => reason.code === "FLEXIBLE_SERVICE_CHARGE_AMOUNT_MISMATCH"), "readiness catches a calculator blocker before showing Ready");

    const workspace = await repository.list(ownerId, { page: 1, pageSize: 50 }, new Date("2026-10-14T00:00:00.000Z"));
    assert.ok(workspace.data.some((row) => row.contract_no === "DEMO-HD-001" && row.invoice?.invoice_id === electricityMissing.invoiceId.toString()));
    assert.ok(workspace.data.every((row) => row.property.property_id === "11" || row.property.property_id === "12"), "Owner 1 never receives Owner 2 Property rows");
    assert.ok(workspace.data.some((row) => row.invoice?.status === "unpaid"), "latest finalized unpaid Invoice remains visible");
    assert.ok(workspace.data.every((row) => row.invoice?.status !== "paid"), "Owner 1 does not receive Owner 2's paid Invoice");

    const overdue = await repository.list(ownerId, { page: 1, pageSize: 50 }, new Date("2026-12-15T00:00:00.000Z"));
    assert.ok(overdue.summary.overdue >= 1, "overdue count is server-derived from the supplied Vietnam business date");
    assert.ok(overdue.summary.unpaid_preview.some((invoice) => invoice.is_overdue));

    const missingDraftResident = await prisma.resident.create({ data: { ownerId, fullName: `Resident workspace ${suffix}` } });
    missingDraftResidentId = missingDraftResident.residentId;
    const missingDraftContract = await prisma.contract.create({ data: {
      ownerId, propertyId: 12n, roomId: 111n, representativeResidentId: missingDraftResident.residentId,
      contractNo: `WS-ANOMALY-${suffix}`.slice(0, 40), startDate: parseSqlDate("2026-07-15"), endDate: parseSqlDate("2026-09-30"),
      status: "expired", revision: 1, rentAmount: 1_000_000n, depositAmount: 0n, residentCapacity: 1,
    } });
    anomalyContractId = missingDraftContract.contractId;
    assert.ok(missingDraftContract.contractId > 0n);
    const anomaly = await repository.list(ownerId, { page: 1, pageSize: 50, state: "MISSING_DRAFT" }, new Date("2026-10-14T00:00:00.000Z"));
    assert.ok(anomaly.data.some((row) => row.contract_no === missingDraftContract.contractNo && row.state.code === "MISSING_DRAFT" && row.draft_expected));

    const foreign = await repository.list(2n, { page: 1, pageSize: 50 }, new Date("2026-10-14T00:00:00.000Z"));
    assert.ok(foreign.data.every((row) => row.property.property_id === "21" || row.property.property_id === "22"), "Owner 2 sees only their own Property data");
    assert.ok(foreign.data.some((row) => row.invoice?.status === "paid"), "Owner 2 can see its own latest paid Invoice");
  } finally {
    if (invalidChargeId !== null) await prisma.flexibleServiceCharge.deleteMany({ where: { flexibleServiceChargeId: invalidChargeId, ownerId } });
    await prisma.invoice.deleteMany({ where: { invoiceNo: { in: invoiceNumbers } } });
    if (anomalyContractId !== null) await prisma.contract.deleteMany({ where: { contractId: anomalyContractId, ownerId } });
    if (missingDraftResidentId !== null) await prisma.resident.deleteMany({ where: { residentId: missingDraftResidentId, ownerId } });
    await prisma.$disconnect();
  }
});
