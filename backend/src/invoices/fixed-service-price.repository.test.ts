import assert from "node:assert/strict";
import test from "node:test";
import { PrismaFixedServicePriceRepository } from "./fixed-service-price.repository.js";

test("Fixed Service repository applies Owner/Property/kind/status and period_start publication filters", async () => {
  let where: any;
  let select: any;
  const periodStart = new Date("2026-10-01T00:00:00.000Z");
  const prisma: any = {
    property: { findFirst: async (args: any) => { assert.deepEqual(args.where, { ownerId: 11n, propertyId: 22n }); return { propertyId: 22n }; } },
    room: { findFirst: async () => ({ roomId: 33n }) },
    propertyPricingItem: { findMany: async (args: any) => { where = args.where; select = args.select; return []; } },
  };
  const repository = new PrismaFixedServicePriceRepository(prisma);
  await repository.findActiveFixedServices({ ownerId: 11n, propertyId: 22n, periodStart, roomId: 33n });

  assert.deepEqual(where, { ownerId: 11n, propertyId: 22n, kind: "FIXED_SERVICE", status: "active" });
  assert.deepEqual(select.priceVersions.where, { effectiveFrom: { lte: periodStart } });
  assert.deepEqual(select.priceVersions.orderBy, [{ effectiveFrom: "desc" }, { versionNo: "desc" }]);
  assert.equal(select.priceVersions.take, 1);
});

test("Room charge context requires an active Room in the requested Owner and Property", async () => {
  let where: any;
  const repository = new PrismaFixedServicePriceRepository({
    property: { findFirst: async () => ({ propertyId: 22n }) },
    room: { findFirst: async (args: any) => { where = args.where; return null; } },
    propertyPricingItem: { findMany: async () => [] },
  } as any);
  const eligible = await repository.roomIsEligible({ ownerId: 11n, propertyId: 22n, roomId: 33n, periodStart: new Date("2026-10-01") });
  assert.equal(eligible, false);
  assert.deepEqual(where, { ownerId: 11n, propertyId: 22n, roomId: 33n, isActive: true, status: { not: "inactive" } });
});

test("catalog lookup can omit Room context and never queries Contract or Facility models", async () => {
  const prisma: any = {
    property: { findFirst: async () => ({ propertyId: 22n }) },
    room: { findFirst: async () => assert.fail("Room should not be queried without roomId") },
    propertyPricingItem: { findMany: async () => [] },
  };
  const repository = new PrismaFixedServicePriceRepository(prisma);
  assert.equal(await repository.roomIsEligible({ ownerId: 11n, propertyId: 22n, periodStart: new Date("2026-10-01") }), true);
});
