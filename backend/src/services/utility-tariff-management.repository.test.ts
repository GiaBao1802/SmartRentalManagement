import assert from "node:assert/strict";
import test from "node:test";
import { PrismaUtilityTariffManagementRepository } from "./utility-tariff-management.repository.js";

function setup(options: { propertyExists?: boolean; active?: any[]; sameDate?: boolean } = {}) {
  const calls: Array<{ operation: string; value?: any }> = [];
  const tx: any = {
    property: { findFirst: async () => options.propertyExists === false ? null : { propertyId: 5n } },
    $queryRaw: async () => { calls.push({ operation: "property-lock" }); return [{ property_id: 5n }]; },
    utilityTariff: {
      findMany: async () => options.active ?? [],
      create: async ({ data, include }: any) => { calls.push({ operation: "tariff-create", value: { data, include } }); return { utilityTariffId: 10n, versions: [] }; },
    },
    utilityTariffVersion: {
      findFirst: async () => options.sameDate ? { utilityTariffVersionId: 44n } : null,
      create: async ({ data }: any) => { calls.push({ operation: "version-create", value: data }); return { utilityTariffVersionId: 21n }; },
      update: async ({ data, include }: any) => { calls.push({ operation: "version-publish", value: { data, include } }); return { utilityTariffVersionId: 21n, ...data }; },
    },
    electricityTariffTier: { createMany: async ({ data }: any) => { calls.push({ operation: "tier-insert", value: data }); return { count: data.length }; } },
  };
  const prisma: any = { $transaction: async (fn: (client: any) => unknown, options: unknown) => { calls.push({ operation: "transaction", value: options }); return fn(tx); }, property: tx.property, utilityTariff: tx.utilityTariff };
  return { repository: new PrismaUtilityTariffManagementRepository(prisma), calls };
}

test("Electricity publication creates tariff, inserts all tiers and publishes within one serializable transaction", async () => {
  const { repository, calls } = setup();
  const result = await repository.publishVersion(101n, 5n, 11n, {
    utilityType: "ELECTRICITY", effectiveFrom: new Date("2026-11-01T00:00:00Z"), sourceName: null, sourceReference: null,
    tiers: [{ tierNo: 1, lowerKwh: "0.000", upperKwh: "50.000", unitPrice: 1984n }, { tierNo: 2, lowerKwh: "50.000", upperKwh: null, unitPrice: 2050n }],
  });
  assert.equal((result as any).publishedAt instanceof Date, true);
  assert.deepEqual(calls.map((call) => call.operation), ["transaction", "property-lock", "tariff-create", "version-create", "tier-insert", "version-publish"]);
  assert.equal(calls[0]?.value.isolationLevel, "Serializable");
  assert.equal(calls.find((call) => call.operation === "version-create")?.value.calculationMode, "PROGRESSIVE");
  assert.equal(calls.find((call) => call.operation === "version-create")?.value.createdByAccountId, 11n);
  assert.equal(calls.find((call) => call.operation === "tier-insert")?.value.length, 2);
  assert.equal(calls.find((call) => call.operation === "version-publish")?.value.data.publishedByAccountId, 11n);
});

test("Water publication fixes flat mode and creates no Electricity tiers", async () => {
  const { repository, calls } = setup({ active: [{ utilityTariffId: 10n, utilityType: "WATER", status: "active", versions: [{ utilityTariffVersionId: 19n, versionNo: 2 }] }] });
  await repository.publishVersion(101n, 5n, 11n, { utilityType: "WATER", effectiveFrom: new Date("2026-11-01T00:00:00Z"), sourceName: "Manual", sourceReference: null, flatUnitPrice: 15000n });
  const version = calls.find((call) => call.operation === "version-create")?.value;
  assert.equal(version.calculationMode, "FLAT"); assert.equal(version.unit, "m3"); assert.equal(version.flatUnitPrice, 15000n); assert.equal(version.supersedesVersionId, 19n);
  assert.equal(calls.some((call) => call.operation === "tier-insert"), false);
});

test("foreign Property and ambiguous active tariffs cannot publish", async () => {
  const foreign = setup({ propertyExists: false });
  assert.equal(await foreign.repository.publishVersion(202n, 5n, 12n, { utilityType: "WATER", effectiveFrom: new Date("2026-11-01T00:00:00Z"), sourceName: null, sourceReference: null, flatUnitPrice: 10n }), null);
  assert.equal(foreign.calls.some((call) => call.operation === "version-create"), false);

  const ambiguous = setup({ active: [
    { utilityTariffId: 10n, status: "active", versions: [] },
    { utilityTariffId: 11n, status: "active", versions: [] },
  ] });
  await assert.rejects(() => ambiguous.repository.publishVersion(101n, 5n, 11n, { utilityType: "WATER", effectiveFrom: new Date("2026-11-01T00:00:00Z"), sourceName: null, sourceReference: null, flatUnitPrice: 10n }), /nhiều biểu giá/);
  assert.equal(ambiguous.calls.some((call) => call.operation === "version-create"), false);
});

test("a published version cannot be created again with the same effective date", async () => {
  const { repository, calls } = setup({ active: [{ utilityTariffId: 10n, status: "active", versions: [{ utilityTariffVersionId: 19n, versionNo: 2 }] }], sameDate: true });
  await assert.rejects(() => repository.publishVersion(101n, 5n, 11n, { utilityType: "WATER", effectiveFrom: new Date("2026-11-01T00:00:00Z"), sourceName: null, sourceReference: null, flatUnitPrice: 10n }), /ngày hiệu lực này/);
  assert.equal(calls.some((call) => call.operation === "version-create"), false);
});
