import assert from "node:assert/strict";
import test from "node:test";
import type {
  FlexibleServiceChargeLookup,
  FlexibleServiceChargeRecord,
  FlexibleServiceChargeRepository,
  FlexibleServicePriceVersionRecord,
} from "./flexible-service-charge.repository.js";
import { resolveFlexibleServiceCharges } from "./flexible-service-charge.resolver.js";

const ownerId = 11n;
const propertyId = 22n;
const contractId = 44n;
const roomId = 33n;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const timestamp = (value: string) => new Date(value);
const fingerprint = () => new Uint8Array(32).fill(7);

function priceVersion(versionNo: number, effectiveFrom: string, unitPrice: bigint, overrides: Partial<FlexibleServicePriceVersionRecord> = {}): FlexibleServicePriceVersionRecord {
  return {
    propertyPriceVersionId: BigInt(versionNo), propertyPricingItemId: 70n, ownerId, propertyId,
    kind: "FLEXIBLE_SERVICE", versionNo, effectiveFrom: day(effectiveFrom), unitPrice,
    sourceName: "Service price list", sourceReference: `source-${versionNo}`, publishedAt: day("2026-01-01"), ...overrides,
  };
}

function charge(id: bigint, occurredAt: string, overrides: Partial<FlexibleServiceChargeRecord> = {}): FlexibleServiceChargeRecord {
  const versions = [priceVersion(1, "2026-10-01", 50000n), priceVersion(2, "2026-10-20", 70000n)];
  const chosen = new Date(occurredAt).toISOString() < "2026-10-19T17:00:00.000Z" ? versions[0] : versions[1];
  return {
    flexibleServiceChargeId: id, ownerId, propertyId, contractId, roomId, residentId: 55n,
    kind: "FLEXIBLE_SERVICE", propertyPricingItemId: 70n, propertyPriceVersionId: chosen.propertyPriceVersionId,
    occurredAt: timestamp(occurredAt), quantity: "2.500", unit: "visit",
    unitPriceSnapshot: chosen.unitPrice, amountSnapshot: 125000n, sourceSystem: "maintenance", sourceEventKey: `event-${id}`,
    payloadFingerprint: fingerprint(), status: "READY", invoiceId: null,
    pricingItem: {
      propertyPricingItemId: 70n, ownerId, propertyId, kind: "FLEXIBLE_SERVICE", code: "LOCK_REPAIR",
      name: "Sửa khóa", unit: "visit", status: "active", priceVersions: versions,
    },
    ...overrides,
  };
}

function repository(charges: FlexibleServiceChargeRecord[], overrides: Partial<FlexibleServiceChargeRepository> = {}): FlexibleServiceChargeRepository {
  return {
    propertyBelongsToOwner: async () => true,
    contractMatchesRoom: async () => true,
    findCharges: async () => charges,
    ...overrides,
  };
}

const lookup = (overrides: Partial<FlexibleServiceChargeLookup> = {}): FlexibleServiceChargeLookup => ({
  ownerId, propertyId, contractId, roomId, periodStart: day("2026-10-01"), periodEnd: day("2026-10-31"), ...overrides,
});

test("valid READY charge resolves its server price at occurred_at", async () => {
  const result = await resolveFlexibleServiceCharges(repository([charge(1n, "2026-10-15T03:00:00.000Z")]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.equal(result.eligibleCharges.length, 1);
    assert.equal(result.eligibleCharges[0].unitPrice, 50000n);
    assert.equal(result.eligibleCharges[0].versionNo, 1);
    assert.equal(result.eligibleCharges[0].quantity, "2.500");
    assert.equal(result.eligibleCharges[0].contractId, contractId);
    assert.equal(result.eligibleCharges[0].roomId, roomId);
  }
});

test("charges before and after a price change resolve independently even in one Invoice period", async () => {
  const result = await resolveFlexibleServiceCharges(repository([
    charge(1n, "2026-10-19T12:00:00.000Z"),
    charge(2n, "2026-10-20T12:00:00.000Z"),
  ]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.deepEqual(result.eligibleCharges.map((item) => item.unitPrice), [50000n, 70000n]);
});

test("effective_from applies on that Vietnam calendar date and same-date versions use highest version number", async () => {
  const row = charge(1n, "2026-10-20T00:00:00.000Z"); // 07:00 Vietnam, effective date 20 Oct
  const v1 = priceVersion(1, "2026-10-20", 60000n);
  const v2 = priceVersion(2, "2026-10-20", 70000n);
  row.propertyPriceVersionId = v2.propertyPriceVersionId;
  row.unitPriceSnapshot = v2.unitPrice;
  row.pricingItem!.priceVersions = [v1, v2];
  const result = await resolveFlexibleServiceCharges(repository([row]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.equal(result.eligibleCharges[0].priceVersionId, v2.propertyPriceVersionId);
});

test("period membership includes the full period_end Vietnam date, including its last instant", async () => {
  const lastInstant = charge(1n, "2026-10-31T16:59:59.999Z");
  const nextMidnight = charge(2n, "2026-10-31T17:00:00.000Z");
  const result = await resolveFlexibleServiceCharges(repository([lastInstant, nextMidnight]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.deepEqual(result.eligibleCharges.map((item) => item.chargeId), [1n]);
    assert.deepEqual(result.excludedCharges, [{ chargeId: 2n, reason: "OUTSIDE_INVOICE_PERIOD" }]);
  }
});

test("events before period_start are excluded using the Vietnam calendar date", async () => {
  const before = charge(1n, "2026-09-30T16:59:59.999Z");
  const atStart = charge(2n, "2026-09-30T17:00:00.000Z");
  const result = await resolveFlexibleServiceCharges(repository([before, atStart]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.deepEqual(result.eligibleCharges.map((item) => item.chargeId), [2n]);
    assert.deepEqual(result.excludedCharges, [{ chargeId: 1n, reason: "OUTSIDE_INVOICE_PERIOD" }]);
  }
});

test("Owner, Property, Contract and Room mismatches fail closed", async () => {
  const owner = await resolveFlexibleServiceCharges(repository([], { propertyBelongsToOwner: async () => false }), lookup());
  const contract = await resolveFlexibleServiceCharges(repository([], { contractMatchesRoom: async () => false }), lookup());
  const foreignRoom = charge(1n, "2026-10-15T03:00:00.000Z", { roomId: 999n });
  const foreignOwner = charge(2n, "2026-10-15T03:00:00.000Z", { ownerId: 999n });
  const foreignProperty = charge(3n, "2026-10-15T03:00:00.000Z", { propertyId: 999n });
  const foreignContract = charge(4n, "2026-10-15T03:00:00.000Z", { contractId: 999n });
  const badRoomResult = await resolveFlexibleServiceCharges(repository([foreignRoom]), lookup());
  const badOwnerResult = await resolveFlexibleServiceCharges(repository([foreignOwner]), lookup());
  const badPropertyResult = await resolveFlexibleServiceCharges(repository([foreignProperty]), lookup());
  const badContractResult = await resolveFlexibleServiceCharges(repository([foreignContract]), lookup());
  assert.deepEqual(owner, { status: "UNRESOLVED", reason: "PROPERTY_SCOPE_MISMATCH" });
  assert.deepEqual(contract, { status: "UNRESOLVED", reason: "CONTRACT_ROOM_SCOPE_MISMATCH" });
  assert.deepEqual(badRoomResult, { status: "UNRESOLVED", reason: "CHARGE_SCOPE_MISMATCH" });
  assert.deepEqual(badOwnerResult, { status: "UNRESOLVED", reason: "CHARGE_SCOPE_MISMATCH" });
  assert.deepEqual(badPropertyResult, { status: "UNRESOLVED", reason: "CHARGE_SCOPE_MISMATCH" });
  assert.deepEqual(badContractResult, { status: "UNRESOLVED", reason: "CHARGE_SCOPE_MISMATCH" });
});

test("READY unlinked charges are eligible; invoiced and VOID charges are excluded", async () => {
  const ready = charge(1n, "2026-10-15T03:00:00.000Z");
  const invoiced = charge(2n, "2026-10-15T03:00:00.000Z", { status: "INVOICED", invoiceId: 88n });
  const voided = charge(3n, "2026-10-15T03:00:00.000Z", { status: "VOID" });
  const result = await resolveFlexibleServiceCharges(repository([ready, invoiced, voided]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.deepEqual(result.eligibleCharges.map((item) => item.chargeId), [1n]);
    assert.deepEqual(result.excludedCharges, [
      { chargeId: 2n, reason: "ALREADY_INVOICED" },
      { chargeId: 3n, reason: "VOID" },
    ]);
  }
});

test("READY charge linked to an invoice or INVOICED without invoice link fails closed", async () => {
  const linkedReady = charge(1n, "2026-10-15T03:00:00.000Z", { invoiceId: 88n });
  const invoicedNoLink = charge(2n, "2026-10-15T03:00:00.000Z", { status: "INVOICED", invoiceId: null });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([linkedReady]), lookup()), { status: "UNRESOLVED", reason: "READY_CHARGE_ALREADY_LINKED" });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([invoicedNoLink]), lookup()), { status: "UNRESOLVED", reason: "INVOICED_CHARGE_MISSING_INVOICE" });
});

test("missing/wrong-kind pricing item and missing eligible version fail closed", async () => {
  const missing = charge(1n, "2026-10-15T03:00:00.000Z", { pricingItem: null });
  const wrongKind = charge(2n, "2026-10-15T03:00:00.000Z", { pricingItem: { ...charge(3n, "2026-10-15T03:00:00.000Z").pricingItem!, kind: "PARKING" } });
  const futureOnly = charge(3n, "2026-10-15T03:00:00.000Z");
  futureOnly.pricingItem!.priceVersions = [priceVersion(3, "2026-10-16", 90000n)];
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([missing]), lookup()), { status: "UNRESOLVED", reason: "PRICING_ITEM_MISSING" });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([wrongKind]), lookup()), { status: "UNRESOLVED", reason: "INVALID_PRICING_ITEM" });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([futureOnly]), lookup()), { status: "UNRESOLVED", reason: "PRICE_VERSION_MISSING" });
});

test("unpublished or negative price versions fail closed", async () => {
  const unpublished = charge(1n, "2026-10-15T03:00:00.000Z");
  unpublished.pricingItem!.priceVersions = [priceVersion(1, "2026-10-01", 50000n, { publishedAt: null })];
  const negative = charge(2n, "2026-10-15T03:00:00.000Z");
  negative.pricingItem!.priceVersions = [priceVersion(1, "2026-10-01", -1n)];
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([unpublished]), lookup()), { status: "UNRESOLVED", reason: "PRICE_VERSION_MISSING" });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([negative]), lookup()), { status: "UNRESOLVED", reason: "INVALID_PRICE_VERSION" });
});

test("charge's recorded version and price snapshot must agree with the occurred_at price", async () => {
  const badVersion = charge(1n, "2026-10-15T03:00:00.000Z", { propertyPriceVersionId: 2n });
  const badSnapshot = charge(2n, "2026-10-15T03:00:00.000Z", { unitPriceSnapshot: 99000n });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([badVersion]), lookup()), { status: "UNRESOLVED", reason: "CHARGE_PRICE_VERSION_MISMATCH" });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([badSnapshot]), lookup()), { status: "UNRESOLVED", reason: "CHARGE_PRICE_SNAPSHOT_MISMATCH" });
});

test("valid quantity is normalized without floating-point math; zero, negative and invalid values fail closed", async () => {
  const valid = charge(1n, "2026-10-15T03:00:00.000Z", { quantity: "3.125" });
  const zero = charge(2n, "2026-10-15T03:00:00.000Z", { quantity: "0" });
  const negative = charge(3n, "2026-10-15T03:00:00.000Z", { quantity: "-1" });
  const invalid = charge(4n, "2026-10-15T03:00:00.000Z", { quantity: "1.0001" });
  const result = await resolveFlexibleServiceCharges(repository([valid]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") assert.equal(result.eligibleCharges[0].quantity, "3.125");
  for (const row of [zero, negative, invalid]) {
    assert.deepEqual(await resolveFlexibleServiceCharges(repository([row]), lookup()), { status: "UNRESOLVED", reason: "INVALID_CHARGE_DATA" });
  }
});

test("source event uniqueness/fingerprint are validated and duplicate source events fail closed", async () => {
  const badFingerprint = charge(1n, "2026-10-15T03:00:00.000Z", { payloadFingerprint: new Uint8Array(31) });
  const duplicate1 = charge(2n, "2026-10-15T03:00:00.000Z", { sourceEventKey: "same-event" });
  const duplicate2 = charge(3n, "2026-10-16T03:00:00.000Z", { sourceEventKey: "same-event" });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([badFingerprint]), lookup()), { status: "UNRESOLVED", reason: "INVALID_SOURCE_IDENTITY" });
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([duplicate1, duplicate2]), lookup()), { status: "UNRESOLVED", reason: "DUPLICATE_SOURCE_EVENT" });
});

test("invalid Invoice period and invalid occurrence timestamp fail closed", async () => {
  const reversed = await resolveFlexibleServiceCharges(repository([]), lookup({ periodStart: day("2026-11-01"), periodEnd: day("2026-10-31") }));
  const invalidOccurrence = charge(1n, "2026-10-15T03:00:00.000Z", { occurredAt: new Date(Number.NaN) });
  const badEvent = await resolveFlexibleServiceCharges(repository([invalidOccurrence]), lookup());
  assert.deepEqual(reversed, { status: "UNRESOLVED", reason: "INVALID_INVOICE_PERIOD" });
  assert.deepEqual(badEvent, { status: "UNRESOLVED", reason: "INVALID_CHARGE_DATA" });
});

test("wrong pricing-version tenant context fails closed", async () => {
  const row = charge(1n, "2026-10-15T03:00:00.000Z");
  row.pricingItem!.priceVersions[0].ownerId = 900n;
  assert.deepEqual(await resolveFlexibleServiceCharges(repository([row]), lookup()), { status: "UNRESOLVED", reason: "INVALID_PRICE_VERSION" });
});

test("retired catalog item does not erase a previously recorded valid charge", async () => {
  const row = charge(1n, "2026-10-15T03:00:00.000Z");
  row.pricingItem!.status = "retired";
  const result = await resolveFlexibleServiceCharges(repository([row]), lookup());
  assert.equal(result.status, "RESOLVED");
});

test("multiple charges preserve individual quantity, event time and price metadata", async () => {
  const first = charge(1n, "2026-10-19T12:00:00.000Z", { quantity: "1.250" });
  const second = charge(2n, "2026-10-20T12:00:00.000Z", { quantity: "4" });
  const result = await resolveFlexibleServiceCharges(repository([first, second]), lookup());
  assert.equal(result.status, "RESOLVED");
  if (result.status === "RESOLVED") {
    assert.deepEqual(result.eligibleCharges.map((item) => [item.occurredAt.toISOString(), item.quantity, item.unitPrice]), [
      [first.occurredAt.toISOString(), "1.250", 50000n],
      [second.occurredAt.toISOString(), "4.000", 70000n],
    ]);
  }
});
