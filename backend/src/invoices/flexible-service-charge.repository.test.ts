import assert from "node:assert/strict";
import test from "node:test";
import { flexibleChargePeriodBounds, PrismaFlexibleServiceChargeRepository } from "./flexible-service-charge.repository.js";

test("repository scopes the Invoice context and reads charges over inclusive HCM calendar dates", async () => {
  let contractWhere: any;
  let chargeWhere: any;
  let select: any;
  const prisma: any = {
    property: { findFirst: async (args: any) => { assert.deepEqual(args.where, { ownerId: 11n, propertyId: 22n }); return { propertyId: 22n }; } },
    contract: { findFirst: async (args: any) => { contractWhere = args.where; return { contractId: 44n }; } },
    flexibleServiceCharge: { findMany: async (args: any) => { chargeWhere = args.where; select = args.select; return []; } },
  };
  const repository = new PrismaFlexibleServiceChargeRepository(prisma);
  const input = { ownerId: 11n, propertyId: 22n, contractId: 44n, roomId: 33n, periodStart: new Date("2026-10-01Z"), periodEnd: new Date("2026-10-31Z") };
  await repository.contractMatchesRoom(input);
  await repository.findCharges(input);

  assert.deepEqual(contractWhere, { ownerId: 11n, propertyId: 22n, contractId: 44n, roomId: 33n });
  assert.deepEqual(chargeWhere, {
    ownerId: 11n, propertyId: 22n, contractId: 44n, roomId: 33n,
    occurredAt: { gte: new Date("2026-09-30T17:00:00.000Z"), lt: new Date("2026-10-31T17:00:00.000Z") },
  });
  assert.deepEqual(select.pricingItem.select.priceVersions.where, { effectiveFrom: { lte: new Date("2026-10-31T00:00:00.000Z") } });
  assert.deepEqual(select.pricingItem.select.priceVersions.orderBy, [{ effectiveFrom: "desc" }, { versionNo: "desc" }]);
});

test("period bounds include all of period_end in Asia/Ho_Chi_Minh and exclude next local midnight", () => {
  const bounds = flexibleChargePeriodBounds(new Date("2026-10-01Z"), new Date("2026-10-31Z"));
  assert.equal(bounds.startInclusive.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(bounds.endExclusive.toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(bounds.startDate.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(bounds.endDate.toISOString(), "2026-10-31T00:00:00.000Z");
});

test("Property ownership is checked by Owner and Property", async () => {
  let where: any;
  const repository = new PrismaFlexibleServiceChargeRepository({
    property: { findFirst: async (args: any) => { where = args.where; return null; } },
    contract: { findFirst: async () => null }, flexibleServiceCharge: { findMany: async () => [] },
  } as any);
  assert.equal(await repository.propertyBelongsToOwner(11n, 22n), false);
  assert.deepEqual(where, { ownerId: 11n, propertyId: 22n });
});
