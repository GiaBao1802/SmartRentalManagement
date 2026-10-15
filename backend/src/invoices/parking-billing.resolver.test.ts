import assert from "node:assert/strict";
import test from "node:test";
import type { ParkingAssignmentRecord, ParkingBillingLookup, ParkingBillingRepository } from "./parking-billing.repository.js";
import { resolveParkingBilling } from "./parking-billing.resolver.js";

const input: ParkingBillingLookup = { ownerId: 1n, propertyId: 2n, contractId: 3n, roomId: 4n, periodStart: new Date("2026-10-01T00:00:00.000Z") };
const version = (id: bigint, price: bigint, effectiveFrom: string, versionNo: number) => ({
  propertyPriceVersionId: id, propertyPricingItemId: 20n, ownerId: 1n, propertyId: 2n,
  kind: "PARKING", versionNo, effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`), unitPrice: price,
  sourceName: "catalog", sourceReference: null, publishedAt: new Date(`${effectiveFrom}T00:00:00.000Z`),
});

function assignment(id: bigint, options: { startedAt?: string; endedAt?: string | null; status?: string; type?: string; billability?: string; entitlement?: boolean; versions?: ReturnType<typeof version>[]; itemStatus?: string; itemKind?: string; itemPropertyId?: bigint; itemOwnerId?: bigint; itemId?: bigint } = {}): ParkingAssignmentRecord {
  const entitlementId = options.entitlement === false ? null : id + 100n;
  const paid = options.billability ?? (options.type === "FREE_SLOT" ? "FREE" : options.type === "LEGACY_UNCLASSIFIED" ? "UNCLASSIFIED" : "PAID");
  const entitlementType = options.type ?? (paid === "FREE" ? "FREE_SLOT" : paid === "UNCLASSIFIED" ? "LEGACY_UNCLASSIFIED" : "PAID_SLOT");
  const itemId = options.itemId ?? 20n;
  return {
    assignmentId: id, parkingSlotId: id + 200n, ownerId: 1n, propertyId: 2n, vehicleId: id + 300n,
    residentId: 5n, roomId: 4n, contractId: 3n,
    startedAt: new Date(`${options.startedAt ?? "2026-09-01"}T00:00:00.000Z`),
    endedAt: options.endedAt ? new Date(`${options.endedAt}T00:00:00.000Z`) : null,
    status: options.status ?? "active", entitlementId,
    vehicle: { vehicleId: id + 300n, residentId: 5n, ownerId: 1n, vehicleType: "motorcycle", plateNumber: `DEV-${id}` },
    resident: { residentId: 5n, ownerId: 1n },
    parkingSlot: { parkingSlotId: id + 200n, propertyId: 2n, ownerId: 1n },
    entitlement: entitlementId === null ? null : {
      parkingEntitlementId: entitlementId, ownerId: 1n, propertyId: 2n,
      entitlementType, billability: paid, propertyPricingItemId: paid === "PAID" ? itemId : null,
      pricingKind: paid === "PAID" ? "PARKING" : null, code: `PARK-${id}`, name: `Parking ${id}`, active: true,
      pricingItem: paid === "PAID" ? {
        propertyPricingItemId: itemId, ownerId: options.itemOwnerId ?? 1n, propertyId: options.itemPropertyId ?? 2n,
        kind: options.itemKind ?? "PARKING", code: "MOTORCYCLE", name: "Motorcycle parking", unit: "vehicle-period",
        status: options.itemStatus ?? "active", priceVersions: options.versions ?? [version(21n, 50000n, "2026-01-01", 1)],
      } : null,
    },
  };
}

function repository(assignments: ParkingAssignmentRecord[] = [], overrides: Partial<ParkingBillingRepository> = {}): ParkingBillingRepository {
  return {
    propertyBelongsToOwner: async () => true,
    contractMatchesRoom: async () => true,
    residentHasOccupancyAtPeriodStart: async () => true,
    findAssignments: async () => assignments,
    ...overrides,
  };
}

test("valid paid slot entitlement resolves with the Property Parking price version at period_start", async () => {
  const result = await resolveParkingBilling(repository([assignment(1n, { versions: [
    version(21n, 50000n, "2026-01-01", 1), version(22n, 60000n, "2026-10-01", 2), version(23n, 70000n, "2026-11-01", 3),
  ] })]), input);
  assert.equal(result.status, "RESOLVED");
  if (result.status !== "RESOLVED") return;
  assert.equal(result.entitlements[0].status, "RESOLVED_BILLABLE");
  assert.equal(result.entitlements[0].unitPrice, 60000n);
  assert.equal(result.entitlements[0].priceVersionId, 22n);
  assert.equal(result.entitlements[0].effectiveFrom?.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("free entitlement resolves without a price or charge", async () => {
  const result = await resolveParkingBilling(repository([assignment(1n, { type: "FREE_SLOT" })]), input);
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.equal(result.entitlements[0].status, "RESOLVED_FREE");
});

test("legacy unclassified entitlement resolves without inferring paid or free", async () => {
  const result = await resolveParkingBilling(repository([assignment(1n, { type: "LEGACY_UNCLASSIFIED" })]), input);
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.equal(result.entitlements[0].status, "RESOLVED_UNCLASSIFIED");
    assert.equal(result.entitlements[0].unitPrice, null);
  }
});

test("assignment with NULL entitlement remains unclassified and is never inferred billable", async () => {
  const result = await resolveParkingBilling(repository([assignment(1n, { entitlement: false })]), input);
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.equal(result.entitlements[0].status, "RESOLVED_UNCLASSIFIED");
    assert.equal(result.entitlements[0].reason, "UNCLASSIFIED_OR_MISSING_ENTITLEMENT_NO_INFERENCE");
  }
});

test("assignment starting after period_start is excluded for this Invoice", async () => {
  const result = await resolveParkingBilling(repository([assignment(1n, { startedAt: "2026-10-15" })]), input);
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.deepEqual(result.entitlements, []);
});

test("same paid assignment bills in the next eligible period after activation", async () => {
  const next = { ...input, periodStart: new Date("2026-11-01T00:00:00.000Z") };
  const result = await resolveParkingBilling(repository([assignment(1n, { startedAt: "2026-10-15" })]), next);
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.equal(result.entitlements[0].status, "RESOLVED_BILLABLE");
});

test("ended mid-period assignment is charged as a full period if active at period_start, without proration", async () => {
  const row = assignment(1n, { status: "ended", endedAt: "2026-10-15" });
  const result = await resolveParkingBilling(repository([row]), input);
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.equal(result.entitlements[0].status, "RESOLVED_BILLABLE");
    assert.equal(result.entitlements[0].unitPrice, 50000n);
  }
});

test("old/new Invoice periods select old/new price; a mid-period price change does not split", async () => {
  const row = assignment(1n, { versions: [version(21n, 50000n, "2026-01-01", 1), version(22n, 60000n, "2026-10-15", 2)] });
  const old = await resolveParkingBilling(repository([row]), input);
  const newPeriod = await resolveParkingBilling(repository([row]), { ...input, periodStart: new Date("2026-11-01T00:00:00.000Z") });
  assert.equal(old.status === "RESOLVED" && old.entitlements[0].unitPrice, 50000n);
  assert.equal(newPeriod.status === "RESOLVED" && newPeriod.entitlements[0].unitPrice, 60000n);
});

test("future, unpublished, missing or malformed price configuration fails closed", async (t) => {
  await t.test("future only", async () => {
    assert.deepEqual(await resolveParkingBilling(repository([assignment(1n, { versions: [version(21n, 50000n, "2026-11-01", 1)] })]), input), { status: "UNRESOLVED", reason: "PRICE_VERSION_MISSING" });
  });
  await t.test("missing", async () => {
    assert.deepEqual(await resolveParkingBilling(repository([assignment(1n, { versions: [] })]), input), { status: "UNRESOLVED", reason: "PRICE_VERSION_MISSING" });
  });
  await t.test("unpublished", async () => {
    const row = assignment(1n);
    row.entitlement!.pricingItem!.priceVersions = [{ ...version(21n, 50000n, "2026-01-01", 1), publishedAt: null }];
    assert.deepEqual(await resolveParkingBilling(repository([row]), input), { status: "UNRESOLVED", reason: "PRICE_VERSION_MISSING" });
  });
  await t.test("negative", async () => {
    assert.deepEqual(await resolveParkingBilling(repository([assignment(1n, { versions: [version(21n, -1n, "2026-01-01", 1)] })]), input), { status: "UNRESOLVED", reason: "INVALID_PRICE_VERSION" });
  });
});

test("mismatched Owner, Property, Contract, Room or vehicle/resident context fails closed", async (t) => {
  const cases: Array<[string, (row: ParkingAssignmentRecord) => void, string]> = [
    ["Owner", (row) => { row.ownerId = 99n; }, "ASSIGNMENT_SCOPE_MISMATCH"],
    ["Property", (row) => { row.propertyId = 99n; }, "ASSIGNMENT_SCOPE_MISMATCH"],
    ["Contract", (row) => { row.contractId = 99n; }, "ASSIGNMENT_SCOPE_MISMATCH"],
    ["Room", (row) => { row.roomId = 99n; }, "ASSIGNMENT_SCOPE_MISMATCH"],
    ["vehicle to another Resident", (row) => { row.vehicle.residentId = 99n; }, "ASSIGNMENT_SCOPE_MISMATCH"],
    ["pricing item wrong Property", (_row) => {}, "INVALID_PRICING_ITEM"],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, async () => {
    const row = assignment(1n, label === "pricing item wrong Property" ? { itemPropertyId: 99n } : {});
    mutate(row);
    const result = await resolveParkingBilling(repository([row]), input);
    assert.deepEqual(result, { status: "UNRESOLVED", reason: expected });
  });
});

test("Owner/Property and Contract/Room repository authorization failures stop before assignment reads", async (t) => {
  await t.test("wrong Owner", async () => assert.deepEqual(await resolveParkingBilling(repository([], { propertyBelongsToOwner: async () => false }), input), { status: "UNRESOLVED", reason: "PROPERTY_SCOPE_MISMATCH" }));
  await t.test("wrong Contract or Room", async () => assert.deepEqual(await resolveParkingBilling(repository([], { contractMatchesRoom: async () => false }), input), { status: "UNRESOLVED", reason: "CONTRACT_ROOM_SCOPE_MISMATCH" }));
  await t.test("Resident not occupying at period start", async () => assert.deepEqual(await resolveParkingBilling(repository([assignment(1n)], { residentHasOccupancyAtPeriodStart: async () => false }), input), { status: "UNRESOLVED", reason: "RESIDENT_NOT_OCCUPYING_ROOM_AT_PERIOD_START" }));
});

test("multiple paid, free and unclassified vehicles resolve independently", async () => {
  const result = await resolveParkingBilling(repository([
    assignment(1n), assignment(2n, { type: "FREE_SLOT" }), assignment(3n, { type: "LEGACY_UNCLASSIFIED" }),
  ]), input);
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.deepEqual(result.entitlements.map((entry) => entry.status), [
    "RESOLVED_BILLABLE", "RESOLVED_FREE", "RESOLVED_UNCLASSIFIED",
  ]);
});

test("invalid entitlement/type/billability and inactive entitlement fail closed", async () => {
  const mismatch = assignment(1n, { type: "PAID_SLOT", billability: "FREE" });
  const inactive = assignment(2n);
  inactive.entitlement!.active = false;
  for (const row of [mismatch, inactive]) {
    assert.deepEqual(await resolveParkingBilling(repository([row]), input), { status: "UNRESOLVED", reason: "INVALID_ENTITLEMENT" });
  }
});

test("wrong-kind/inactive pricing item and malformed period start fail closed", async () => {
  assert.deepEqual(await resolveParkingBilling(repository([assignment(1n, { itemKind: "FIXED_SERVICE" })]), input), { status: "UNRESOLVED", reason: "INVALID_PRICING_ITEM" });
  assert.deepEqual(await resolveParkingBilling(repository([assignment(1n, { itemStatus: "retired" })]), input), { status: "UNRESOLVED", reason: "INVALID_PRICING_ITEM" });
  assert.deepEqual(await resolveParkingBilling(repository(), { ...input, periodStart: new Date("invalid") }), { status: "UNRESOLVED", reason: "INVALID_PERIOD_START" });
});

test("no assignments is a resolved empty result", async () => {
  assert.deepEqual(await resolveParkingBilling(repository(), input), {
    status: "RESOLVED", ownerId: 1n, propertyId: 2n, contractId: 3n, roomId: 4n,
    periodStart: input.periodStart, entitlements: [],
  });
});
