import assert from "node:assert/strict";
import test from "node:test";
import type {
  FixedServicePriceLookup,
  FixedServicePriceRepository,
  FixedServicePriceVersionRecord,
  FixedServicePricingItemRecord,
} from "./fixed-service-price.repository.js";
import { resolveFixedServicePrices } from "./fixed-service-price.resolver.js";

const ownerId = 11n;
const propertyId = 22n;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function version(versionNo: number, effectiveFrom: string, unitPrice: bigint, overrides: Partial<FixedServicePriceVersionRecord> = {}): FixedServicePriceVersionRecord {
  return {
    propertyPriceVersionId: BigInt(versionNo), versionNo, effectiveFrom: day(effectiveFrom), unitPrice,
    sourceName: "Owner price list", sourceReference: `price-${versionNo}`, publishedAt: day("2026-01-01"), ...overrides,
  };
}

function item(id: bigint, code: string, name: string, versions: FixedServicePriceVersionRecord[], overrides: Partial<FixedServicePricingItemRecord> = {}): FixedServicePricingItemRecord {
  return {
    propertyPricingItemId: id, ownerId, propertyId, kind: "FIXED_SERVICE", code, name,
    unit: "room-period", status: "active", versions, ...overrides,
  };
}

function repo(items: FixedServicePricingItemRecord[], overrides: Partial<FixedServicePriceRepository> = {}): FixedServicePriceRepository {
  return {
    propertyBelongsToOwner: async () => true,
    roomIsEligible: async () => true,
    findActiveFixedServices: async () => items,
    ...overrides,
  };
}

const lookup = (periodStart: string, roomId?: bigint): FixedServicePriceLookup => ({
  ownerId, propertyId, periodStart: day(periodStart), ...(roomId === undefined ? {} : { roomId }),
});

test("resolves a single Fixed Service using the version effective at period_start", async () => {
  const result = await resolveFixedServicePrices(repo([item(1n, "INTERNET", "Internet", [version(1, "2026-01-01", 30000n)])]), lookup("2026-02-01"));
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.deepEqual(result.services.map((service) => service.unitPrice), [30000n]);
});

test("old and new periods select their own versions; mid-period changes do not split", async () => {
  const services = [item(1n, "CLEAN", "Cleaning", [version(1, "2026-01-01", 30000n), version(2, "2026-10-15", 40000n)])];
  const oldPeriod = await resolveFixedServicePrices(repo(services), lookup("2026-10-01"));
  const newPeriod = await resolveFixedServicePrices(repo(services), lookup("2026-11-01"));
  assert.equal(oldPeriod.status, "RESOLVED");
  assert.equal(newPeriod.status, "RESOLVED");
  if (oldPeriod.status === "RESOLVED") assert.equal(oldPeriod.services[0].unitPrice, 30000n);
  if (newPeriod.status === "RESOLVED") assert.equal(newPeriod.services[0].unitPrice, 40000n);
});

test("a future or unpublished version is never selected", async () => {
  const result = await resolveFixedServicePrices(repo([item(1n, "NET", "Internet", [
    version(2, "2026-11-01", 40000n),
    version(1, "2026-01-01", 30000n, { publishedAt: null }),
  ])]), lookup("2026-10-01"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "PRICE_VERSION_MISSING" });
});

test("multiple Fixed Services are resolved independently with highest version number as same-date tie-breaker", async () => {
  const result = await resolveFixedServicePrices(repo([
    item(2n, "CLEAN", "Cleaning", [version(1, "2026-01-01", 25000n)]),
    item(1n, "NET", "Internet", [version(1, "2026-01-01", 30000n), version(2, "2026-01-01", 31000n)]),
  ]), lookup("2026-02-01"));
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.equal(result.services.length, 2);
    assert.deepEqual(result.services.map((service) => service.unitPrice), [25000n, 31000n]);
  }
});

test("Owner/Property scope mismatches fail closed before returning catalog rows", async () => {
  const ownerResult = await resolveFixedServicePrices(repo([], { propertyBelongsToOwner: async () => false }), lookup("2026-10-01"));
  const roomResult = await resolveFixedServicePrices(repo([], { roomIsEligible: async () => false }), lookup("2026-10-01", 33n));
  const leakedRowResult = await resolveFixedServicePrices(repo([item(1n, "CLEAN", "Cleaning", [version(1, "2026-01-01", 1n)], { ownerId: 99n })]), lookup("2026-10-01"));
  assert.deepEqual(ownerResult, { status: "UNRESOLVED", reason: "PROPERTY_SCOPE_MISMATCH" });
  assert.deepEqual(roomResult, { status: "UNRESOLVED", reason: "ROOM_NOT_ELIGIBLE" });
  assert.deepEqual(leakedRowResult, { status: "UNRESOLVED", reason: "INVALID_PRICING_ITEM" });
});

test("an active item without an eligible version fails closed", async () => {
  const result = await resolveFixedServicePrices(repo([item(1n, "CLEAN", "Cleaning", [])]), lookup("2026-10-01"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "PRICE_VERSION_MISSING" });
});

test("negative/invalid price, inactive item, and wrong kind fail closed", async () => {
  const negative = await resolveFixedServicePrices(repo([item(1n, "CLEAN", "Cleaning", [version(1, "2026-01-01", -1n)])]), lookup("2026-10-01"));
  const inactive = await resolveFixedServicePrices(repo([item(1n, "CLEAN", "Cleaning", [], { status: "retired" })]), lookup("2026-10-01"));
  const wrongKind = await resolveFixedServicePrices(repo([item(1n, "WATER", "Water", [version(1, "2026-01-01", 1n)], { kind: "FLEXIBLE_SERVICE" })]), lookup("2026-10-01"));
  assert.deepEqual(negative, { status: "UNRESOLVED", reason: "INVALID_PRICE_VERSION" });
  assert.deepEqual(inactive, { status: "UNRESOLVED", reason: "INVALID_PRICING_ITEM" });
  assert.deepEqual(wrongKind, { status: "UNRESOLVED", reason: "INVALID_PRICING_ITEM" });
});

test("same-period versions resolve deterministically and Property catalog supports multiple independent services", async () => {
  const result = await resolveFixedServicePrices(repo([item(1n, "NET", "Internet", [
    version(1, "2026-01-01", 100n), version(2, "2026-01-01", 200n),
  ])]), lookup("2026-01-01"));
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.equal(result.services[0].versionNo, 2);
});

test("invalid period start fails closed", async () => {
  const invalid = new Date(Number.NaN);
  const result = await resolveFixedServicePrices(repo([]), { ownerId, propertyId, periodStart: invalid });
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_PERIOD_START" });
});

test("Facility presence and Contract overrides are not resolver inputs", async () => {
  let readModels: string[] = [];
  const repository = repo([item(1n, "NET", "Internet", [version(1, "2026-01-01", 30000n)])], {
    findActiveFixedServices: async () => { readModels.push("propertyPricingItem"); return [item(1n, "NET", "Internet", [version(1, "2026-01-01", 30000n)])]; },
  });
  const noConfiguredPrices = await resolveFixedServicePrices(repo([]), lookup("2026-10-01"));
  const configured = await resolveFixedServicePrices(repository, lookup("2026-10-01"));
  assert.equal(noConfiguredPrices.status, "RESOLVED");
  if (noConfiguredPrices.status === "RESOLVED") assert.deepEqual(noConfiguredPrices.services, []);
  assert.equal(configured.status, "RESOLVED");
  assert.deepEqual(readModels, ["propertyPricingItem"]);
});
