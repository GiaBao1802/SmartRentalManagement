import assert from "node:assert/strict";
import test from "node:test";
import type {
  MeterContinuityLookup,
  MeterContinuityRepository,
  MeterContractRecord,
  MeterUtilityType,
  PreviousFinalizedInvoiceRecord,
} from "./meter-continuity.repository.js";
import { resolveMeterContinuity } from "./meter-continuity.resolver.js";

const ownerId = 11n;
const contractId = 22n;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function contract(overrides: Partial<MeterContractRecord> = {}): MeterContractRecord {
  return { contractId, ownerId, propertyId: 33n, initialElectricKwh: "1000.000", initialWaterM3: "100.000", ...overrides };
}

function invoice(overrides: Partial<PreviousFinalizedInvoiceRecord> = {}): PreviousFinalizedInvoiceRecord {
  return {
    invoiceId: 44n,
    ownerId,
    propertyId: 33n,
    contractId,
    periodStart: day("2026-01-01"),
    periodEnd: day("2026-01-31"),
    electricityCurrentKwh: "1120.500",
    waterCurrentM3: "115.250",
    ...overrides,
  };
}

function repository(options: { contract?: MeterContractRecord | null; previous?: PreviousFinalizedInvoiceRecord | null } = {}): MeterContinuityRepository {
  return {
    findContract: async () => options.contract === undefined ? contract() : options.contract,
    findPreviousFinalizedInvoice: async () => options.previous ?? null,
  };
}

function lookup(utilityType: MeterUtilityType, invoicePeriodStart = "2026-02-01"): MeterContinuityLookup {
  return { ownerId, contractId, utilityType, invoicePeriodStart: day(invoicePeriodStart) };
}

test("first Invoice reads Electricity opening from this Contract initial reading with provenance", async () => {
  const result = await resolveMeterContinuity(repository(), lookup("ELECTRICITY"));
  assert.deepEqual(result, {
    status: "RESOLVED", ownerId, contractId, utilityType: "ELECTRICITY", invoicePeriodStart: day("2026-02-01"),
    openingReading: "1000.000", source: "CONTRACT_INITIAL_READING", reference: { contractId },
  });
});

test("first Invoice resolves Water independently from this Contract initial reading", async () => {
  const result = await resolveMeterContinuity(repository(), lookup("WATER"));
  assert.equal(result.status === "RESOLVED" ? result.openingReading : null, "100.000");
  assert.equal(result.status === "RESOLVED" ? result.source : null, "CONTRACT_INITIAL_READING");
});

test("later Invoice uses the nearest prior finalized same-Contract ending reading", async () => {
  const result = await resolveMeterContinuity(repository({ previous: invoice() }), lookup("ELECTRICITY"));
  assert.equal(result.status, "RESOLVED");
  if (result.status !== "RESOLVED") return;
  assert.equal(result.openingReading, "1120.500");
  assert.equal(result.source, "PREVIOUS_FINALIZED_INVOICE");
  assert.deepEqual(result.reference, { invoiceId: 44n, periodStart: day("2026-01-01"), periodEnd: day("2026-01-31") });
});

test("previous finalized reading is resolved independently for Water", async () => {
  const result = await resolveMeterContinuity(repository({ previous: invoice() }), lookup("WATER"));
  assert.equal(result.status === "RESOLVED" ? result.openingReading : null, "115.250");
});

test("a draft-only history is ignored and the Contract initial reading is used", async () => {
  // The repository query excludes draft rows; null models no eligible finalized Invoice.
  const result = await resolveMeterContinuity(repository({ previous: null }), lookup("ELECTRICITY"));
  assert.equal(result.status === "RESOLVED" ? result.openingReading : null, "1000.000");
  assert.equal(result.status === "RESOLVED" ? result.source : null, "CONTRACT_INITIAL_READING");
});

test("a cross-Contract invoice cannot be used even if a repository violates its scoped contract", async () => {
  const repo: MeterContinuityRepository = {
    findContract: async (_owner, askedContract) => askedContract === contractId ? contract() : null,
    findPreviousFinalizedInvoice: async () => invoice({ contractId: 999n }),
  };
  const result = await resolveMeterContinuity(repo, lookup("ELECTRICITY"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "SCOPE_MISMATCH", reference: { invoiceId: 44n } });
});

test("Owner mismatch is hidden as Contract not found and stops Invoice reads", async () => {
  let previousReads = 0;
  const repo: MeterContinuityRepository = {
    findContract: async () => null,
    findPreviousFinalizedInvoice: async () => { previousReads += 1; return invoice(); },
  };
  assert.deepEqual(await resolveMeterContinuity(repo, { ...lookup("WATER"), ownerId: 999n }), { status: "UNRESOLVED", reason: "CONTRACT_NOT_FOUND" });
  assert.equal(previousReads, 0);
});

test("missing initial data is unresolved when no finalized Invoice exists", async () => {
  const result = await resolveMeterContinuity(repository({ contract: contract({ initialElectricKwh: null }) }), lookup("ELECTRICITY"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "NO_PREVIOUS_FINALIZED_INVOICE_AND_NO_INITIAL_READING", reference: { contractId } });
});

test("Electricity can resolve while Water independently remains unresolved", async () => {
  const repo = repository({ contract: contract({ initialWaterM3: null }) });
  const electricity = await resolveMeterContinuity(repo, lookup("ELECTRICITY"));
  const water = await resolveMeterContinuity(repo, lookup("WATER"));
  assert.equal(electricity.status, "RESOLVED");
  assert.deepEqual(water, { status: "UNRESOLVED", reason: "NO_PREVIOUS_FINALIZED_INVOICE_AND_NO_INITIAL_READING", reference: { contractId } });
});

test("latest finalized Invoice with a missing or invalid ending value fails closed without stale fallback", async () => {
  for (const value of [null, "-1", "1.2345", "1000000000.000"]) {
    const result = await resolveMeterContinuity(repository({ previous: invoice({ electricityCurrentKwh: value }) }), lookup("ELECTRICITY"));
    assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_PREVIOUS_READING", reference: { invoiceId: 44n } });
  }
});

test("invalid Contract initial reading fails closed", async () => {
  const result = await resolveMeterContinuity(repository({ contract: contract({ initialWaterM3: "1.2345" }) }), lookup("WATER"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_INITIAL_READING", reference: { contractId } });
});

test("previous Invoice at or after the requested period is rejected", async () => {
  const result = await resolveMeterContinuity(repository({ previous: invoice({ periodEnd: day("2026-02-01") }) }), lookup("ELECTRICITY"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_PREVIOUS_READING", reference: { invoiceId: 44n } });
});

test("invalid Invoice period is unresolved", async () => {
  const result = await resolveMeterContinuity(repository(), { ...lookup("WATER"), invoicePeriodStart: new Date(Number.NaN) });
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_PERIOD_START" });
});
