import assert from "node:assert/strict";
import test from "node:test";
import { PrismaUtilityTariffRepository } from "./utility-tariff.repository.js";

test("tariff repository applies Owner, Property, utility, active status, and period_start publication filters", async () => {
  let where: any;
  let select: any;
  const prisma: any = {
    property: { findFirst: async () => ({ propertyId: 22n }) },
    utilityTariff: { findMany: async (args: any) => { where = args.where; select = args.select; return []; } },
  };
  const repository = new PrismaUtilityTariffRepository(prisma);
  const periodStart = new Date("2026-02-01T00:00:00.000Z");
  await repository.findActiveTariffs({ ownerId: 11n, propertyId: 22n, utilityType: "ELECTRICITY", periodStart });

  assert.deepEqual(where, { ownerId: 11n, propertyId: 22n, utilityType: "ELECTRICITY", status: "active" });
  assert.deepEqual(select.versions.where, { publishedAt: { not: null }, effectiveFrom: { lte: periodStart } });
  assert.deepEqual(select.versions.orderBy, [{ effectiveFrom: "desc" }, { versionNo: "desc" }]);
  assert.equal(select.versions.take, 1);
  assert.deepEqual(select.versions.select.tiers.orderBy, { tierNo: "asc" });
});

test("property ownership lookup is scoped by both Owner and Property", async () => {
  let where: any;
  const repository = new PrismaUtilityTariffRepository({
    property: { findFirst: async (args: any) => { where = args.where; return null; } },
    utilityTariff: { findMany: async () => [] },
  } as any);
  const matched = await repository.propertyBelongsToOwner(11n, 22n);
  assert.equal(matched, false);
  assert.deepEqual(where, { ownerId: 11n, propertyId: 22n });
});
