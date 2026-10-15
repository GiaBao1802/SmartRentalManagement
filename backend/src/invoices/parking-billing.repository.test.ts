import assert from "node:assert/strict";
import test from "node:test";
import { PrismaParkingBillingRepository } from "./parking-billing.repository.js";

const input = { ownerId: 1n, propertyId: 2n, contractId: 3n, roomId: 4n, periodStart: new Date("2026-10-01T00:00:00.000Z") };

test("repository scopes property, Contract, occupancy and assignments to rental context and period start", async () => {
  const calls: any = {};
  const prisma: any = {
    property: { findFirst: async ({ where }: any) => { calls.property = where; return { propertyId: 2n }; } },
    contract: { findFirst: async ({ where }: any) => { calls.contract = where; return { contractId: 3n }; } },
    roomResident: { findFirst: async ({ where }: any) => { calls.occupancy = where; return { occupancyId: 8n }; } },
    parkingSlotAssignment: { findMany: async (args: any) => { calls.assignments = args; return []; } },
  };
  const repository = new PrismaParkingBillingRepository(prisma);
  assert.equal(await repository.propertyBelongsToOwner(1n, 2n), true);
  assert.equal(await repository.contractMatchesRoom(input), true);
  assert.equal(await repository.residentHasOccupancyAtPeriodStart(input, 5n), true);
  await repository.findAssignments(input);

  assert.deepEqual(calls.property, { ownerId: 1n, propertyId: 2n });
  assert.deepEqual(calls.contract, { ownerId: 1n, propertyId: 2n, contractId: 3n, roomId: 4n });
  assert.deepEqual(calls.occupancy, {
    ownerId: 1n, propertyId: 2n, roomId: 4n, contractId: 3n, residentId: 5n,
    startedAt: { lte: input.periodStart },
    OR: [{ status: "active", endedAt: null }, { status: "ended", endedAt: { gte: input.periodStart } }],
  });
  assert.deepEqual(calls.assignments.where, {
    ownerId: 1n, propertyId: 2n, contractId: 3n, roomId: 4n,
    startedAt: { lte: input.periodStart },
    OR: [
      { status: "active", endedAt: null },
      { status: { in: ["ended", "revoked"] }, endedAt: { gte: input.periodStart } },
    ],
  });
  assert.deepEqual(calls.assignments.select.entitlement.select.pricingItem.select.priceVersions.where, {
    effectiveFrom: { lte: input.periodStart },
  });
  assert.deepEqual(calls.assignments.select.entitlement.select.pricingItem.select.priceVersions.orderBy, [
    { effectiveFrom: "desc" }, { versionNo: "desc" },
  ]);
  assert.equal(calls.assignments.select.entitlement.select.pricingItem.select.priceVersions.take, 1);
});

test("repository returns false when requested Property, Contract or occupancy is absent", async () => {
  const repository = new PrismaParkingBillingRepository({
    property: { findFirst: async () => null },
    contract: { findFirst: async () => null },
    roomResident: { findFirst: async () => null },
    parkingSlotAssignment: { findMany: async () => [] },
  } as any);
  assert.equal(await repository.propertyBelongsToOwner(1n, 2n), false);
  assert.equal(await repository.contractMatchesRoom(input), false);
  assert.equal(await repository.residentHasOccupancyAtPeriodStart(input, 5n), false);
});

test("repository performs reads only and does not query Invoice or write assignment data", async () => {
  const prisma: any = {
    property: { findFirst: async () => ({ propertyId: 2n }) },
    contract: { findFirst: async () => ({ contractId: 3n }) },
    roomResident: { findFirst: async () => ({ occupancyId: 8n }) },
    parkingSlotAssignment: { findMany: async () => [] },
  };
  const repository = new PrismaParkingBillingRepository(prisma);
  await repository.propertyBelongsToOwner(1n, 2n);
  await repository.contractMatchesRoom(input);
  await repository.residentHasOccupancyAtPeriodStart(input, 5n);
  await repository.findAssignments(input);
  assert.equal(prisma.parkingSlotAssignment.update, undefined);
  assert.equal(prisma.parkingSlotAssignment.create, undefined);
  assert.equal(prisma.invoiceItem, undefined);
});
