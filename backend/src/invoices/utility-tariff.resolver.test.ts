import assert from "node:assert/strict";
import test from "node:test";
import type {
  UtilityTariffLookup,
  UtilityTariffRecord,
  UtilityTariffRepository,
  ElectricityTariffTierRecord,
  UtilityTariffVersionRecord,
} from "./utility-tariff.repository.js";
import { resolveUtilityTariff } from "./utility-tariff.resolver.js";

const ownerId = 11n;
const propertyId = 22n;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function electricityVersion(
  versionNo: number,
  effectiveFrom: string,
  overrides: Partial<UtilityTariffVersionRecord> = {},
): UtilityTariffVersionRecord {
  return {
    utilityTariffVersionId: BigInt(versionNo),
    versionNo,
    effectiveFrom: day(effectiveFrom),
    unit: "kWh",
    calculationMode: "PROGRESSIVE",
    flatUnitPrice: null,
    sourceName: "Test tariff source",
    sourceReference: `version-${versionNo}`,
    publishedAt: day("2026-01-01"),
    tiers: [
      { electricityTariffTierId: BigInt(versionNo * 10 + 1), tierNo: 1, lowerKwh: "0.000", upperKwh: "50.000", unitPrice: 1000n },
      { electricityTariffTierId: BigInt(versionNo * 10 + 2), tierNo: 2, lowerKwh: "50.000", upperKwh: null, unitPrice: 2000n },
    ],
    ...overrides,
  };
}

function waterVersion(overrides: Partial<UtilityTariffVersionRecord> = {}): UtilityTariffVersionRecord {
  return {
    utilityTariffVersionId: 30n,
    versionNo: 1,
    effectiveFrom: day("2026-01-01"),
    unit: "m3",
    calculationMode: "FLAT",
    flatUnitPrice: 12000n,
    sourceName: null,
    sourceReference: null,
    publishedAt: day("2026-01-01"),
    tiers: [],
    ...overrides,
  };
}

function tariff(utilityType: "ELECTRICITY" | "WATER", versions: UtilityTariffVersionRecord[]): UtilityTariffRecord {
  return { utilityTariffId: utilityType === "ELECTRICITY" ? 101n : 102n, code: utilityType, name: `${utilityType} tariff`, status: "active", versions };
}

function repository(tariffs: UtilityTariffRecord[], propertyInScope = true): UtilityTariffRepository {
  return {
    propertyBelongsToOwner: async () => propertyInScope,
    findActiveTariffs: async () => tariffs,
  };
}

const lookup = (utilityType: UtilityTariffLookup["utilityType"], periodStart: string): UtilityTariffLookup => ({
  ownerId, propertyId, utilityType, periodStart: day(periodStart),
});

test("electricity selects the version effective on period_start and retains all validated tiers", async () => {
  const result = await resolveUtilityTariff(repository([tariff("ELECTRICITY", [
    electricityVersion(1, "2026-01-01"),
    electricityVersion(2, "2026-02-01"),
  ])]), lookup("ELECTRICITY", "2026-02-01"));
  assert.equal(result.status, "RESOLVED");
  if (result.status !== "RESOLVED" || result.utilityType !== "ELECTRICITY") return;
  assert.equal(result.version.versionNo, 2);
  assert.equal(result.version.effectiveFrom.toISOString().slice(0, 10), "2026-02-01");
  assert.deepEqual(result.tiers.map(({ lowerKwh, upperKwh, unitPrice }) => ({ lowerKwh, upperKwh, unitPrice })), [
    { lowerKwh: "0.000", upperKwh: "50.000", unitPrice: 1000n },
    { lowerKwh: "50.000", upperKwh: null, unitPrice: 2000n },
  ]);
});

test("old and new Invoice periods resolve their own effective tariff versions", async () => {
  const repo = repository([tariff("ELECTRICITY", [electricityVersion(1, "2026-01-01"), electricityVersion(2, "2026-02-01")])]);
  const oldPeriod = await resolveUtilityTariff(repo, lookup("ELECTRICITY", "2026-01-31"));
  const newPeriod = await resolveUtilityTariff(repo, lookup("ELECTRICITY", "2026-02-01"));
  assert.equal(oldPeriod.status === "RESOLVED" ? oldPeriod.version.versionNo : null, 1);
  assert.equal(newPeriod.status === "RESOLVED" ? newPeriod.version.versionNo : null, 2);
});

test("a tariff starting during an Invoice period does not split or replace its period_start version", async () => {
  const result = await resolveUtilityTariff(repository([tariff("ELECTRICITY", [
    electricityVersion(1, "2026-01-01"),
    electricityVersion(2, "2026-02-15"),
  ])]), lookup("ELECTRICITY", "2026-02-01"));
  assert.equal(result.status === "RESOLVED" ? result.version.versionNo : null, 1);
});

test("future and unpublished versions are not eligible", async () => {
  const result = await resolveUtilityTariff(repository([tariff("ELECTRICITY", [
    electricityVersion(1, "2026-02-15"),
    electricityVersion(2, "2026-01-01", { publishedAt: null }),
  ])]), lookup("ELECTRICITY", "2026-02-01"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "VERSION_MISSING" });
});

test("Owner/Property scope mismatch fails closed before tariff rows are read", async () => {
  let tariffReads = 0;
  let scopeInput: [bigint, bigint] | null = null;
  const repo: UtilityTariffRepository = {
    propertyBelongsToOwner: async (askedOwner, askedProperty) => { scopeInput = [askedOwner, askedProperty]; return askedOwner === ownerId && askedProperty === propertyId; },
    findActiveTariffs: async () => { tariffReads += 1; return [tariff("WATER", [waterVersion()])]; },
  };
  const result = await resolveUtilityTariff(repo, { ...lookup("WATER", "2026-02-01"), ownerId: 99n });
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "PROPERTY_SCOPE_MISMATCH" });
  assert.equal(tariffReads, 0);
  assert.deepEqual(scopeInput, [99n, propertyId]);
});

test("invalid period_start is reported as unresolved", async () => {
  const result = await resolveUtilityTariff(repository([]), { ...lookup("WATER", "2026-02-01"), periodStart: new Date(Number.NaN) });
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_PERIOD_START" });
});

test("missing and ambiguous active tariff data fail closed", async () => {
  assert.deepEqual(await resolveUtilityTariff(repository([]), lookup("WATER", "2026-02-01")), { status: "UNRESOLVED", reason: "TARIFF_MISSING" });
  assert.deepEqual(await resolveUtilityTariff(repository([
    tariff("WATER", [waterVersion()]),
    { ...tariff("WATER", [waterVersion({ utilityTariffVersionId: 31n })]), utilityTariffId: 103n },
  ]), lookup("WATER", "2026-02-01")), { status: "UNRESOLVED", reason: "AMBIGUOUS_TARIFF" });
});

test("water resolves one flat m3 rate without requiring tier rows", async () => {
  const result = await resolveUtilityTariff(repository([tariff("WATER", [waterVersion()])]), lookup("WATER", "2026-02-01"));
  assert.equal(result.status, "RESOLVED");
  if (result.status !== "RESOLVED" || result.utilityType !== "WATER") return;
  assert.equal(result.unit, "m3");
  assert.equal(result.calculationMode, "FLAT");
  assert.equal(result.unitPrice, 12000n);
});

test("missing or invalid Water rate fails closed", async () => {
  for (const version of [waterVersion({ flatUnitPrice: null }), waterVersion({ flatUnitPrice: -1n })]) {
    assert.deepEqual(await resolveUtilityTariff(repository([tariff("WATER", [version])]), lookup("WATER", "2026-02-01")), { status: "UNRESOLVED", reason: "INVALID_WATER_RATE" });
  }
});

test("missing Electricity tiers fail closed", async () => {
  const result = await resolveUtilityTariff(repository([tariff("ELECTRICITY", [electricityVersion(1, "2026-01-01", { tiers: [] })])]), lookup("ELECTRICITY", "2026-02-01"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_ELECTRICITY_TIERS" });
});

test("Electricity tier gaps, overlaps, invalid rates, and invalid bounds fail closed", async () => {
  const cases: ElectricityTariffTierRecord[][] = [
    [
      { electricityTariffTierId: 1n, tierNo: 1, lowerKwh: "0", upperKwh: "50", unitPrice: 1n },
      { electricityTariffTierId: 2n, tierNo: 2, lowerKwh: "51", upperKwh: null, unitPrice: 2n },
    ],
    [
      { electricityTariffTierId: 1n, tierNo: 1, lowerKwh: "0", upperKwh: "50", unitPrice: 1n },
      { electricityTariffTierId: 2n, tierNo: 2, lowerKwh: "49", upperKwh: null, unitPrice: 2n },
    ],
    [{ electricityTariffTierId: 1n, tierNo: 1, lowerKwh: "0", upperKwh: null, unitPrice: -1n }],
    [{ electricityTariffTierId: 1n, tierNo: 1, lowerKwh: "1", upperKwh: null, unitPrice: 1n }],
    [{ electricityTariffTierId: 1n, tierNo: 1, lowerKwh: "0", upperKwh: "0", unitPrice: 1n }],
    [{ electricityTariffTierId: 1n, tierNo: 1, lowerKwh: "0.0001", upperKwh: null, unitPrice: 1n }],
  ];
  for (const tiers of cases) {
    const version = electricityVersion(1, "2026-01-01", { tiers });
    const result = await resolveUtilityTariff(repository([tariff("ELECTRICITY", [version])]), lookup("ELECTRICITY", "2026-02-01"));
    assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_ELECTRICITY_TIERS" });
  }
});

test("Electricity tariff mode mismatch fails closed", async () => {
  const result = await resolveUtilityTariff(repository([tariff("ELECTRICITY", [electricityVersion(1, "2026-01-01", { calculationMode: "FLAT" })])]), lookup("ELECTRICITY", "2026-02-01"));
  assert.deepEqual(result, { status: "UNRESOLVED", reason: "INVALID_TARIFF_CONFIGURATION" });
});
