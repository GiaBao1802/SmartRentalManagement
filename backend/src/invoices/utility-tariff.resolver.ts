import type {
  DecimalValue,
  ElectricityTariffTierRecord,
  UtilityTariffLookup,
  UtilityTariffRepository,
  UtilityTariffVersionRecord,
} from "./utility-tariff.repository.js";

export type UtilityTariffUnresolvedReason =
  | "INVALID_PERIOD_START"
  | "PROPERTY_SCOPE_MISMATCH"
  | "TARIFF_MISSING"
  | "VERSION_MISSING"
  | "AMBIGUOUS_TARIFF"
  | "INVALID_ELECTRICITY_TIERS"
  | "INVALID_WATER_RATE"
  | "INVALID_TARIFF_CONFIGURATION";

export type ResolvedElectricityTier = {
  electricityTariffTierId: bigint;
  tierNo: number;
  lowerKwh: string;
  upperKwh: string | null;
  unitPrice: bigint;
};

type ResolvedVersion = {
  utilityTariffVersionId: bigint;
  versionNo: number;
  effectiveFrom: Date;
  sourceName: string | null;
  sourceReference: string | null;
};

export type UtilityTariffResolution =
  | {
    status: "RESOLVED";
    utilityType: "ELECTRICITY";
    ownerId: bigint;
    propertyId: bigint;
    tariff: { utilityTariffId: bigint; code: string; name: string };
    version: ResolvedVersion;
    unit: "kWh";
    calculationMode: "PROGRESSIVE";
    tiers: ResolvedElectricityTier[];
  }
  | {
    status: "RESOLVED";
    utilityType: "WATER";
    ownerId: bigint;
    propertyId: bigint;
    tariff: { utilityTariffId: bigint; code: string; name: string };
    version: ResolvedVersion;
    unit: "m3";
    calculationMode: "FLAT";
    unitPrice: bigint;
  }
  | { status: "UNRESOLVED"; reason: UtilityTariffUnresolvedReason };

function unresolved(reason: UtilityTariffUnresolvedReason): UtilityTariffResolution {
  return { status: "UNRESOLVED", reason };
}

function dateOrdinal(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function eligibleVersions(versions: UtilityTariffVersionRecord[], periodStart: Date) {
  const period = dateOrdinal(periodStart);
  return versions
    .filter((version) => version.publishedAt !== null && dateOrdinal(version.effectiveFrom) <= period)
    .sort((left, right) => dateOrdinal(right.effectiveFrom) - dateOrdinal(left.effectiveFrom) || right.versionNo - left.versionNo);
}

function toMilliUnits(value: DecimalValue): bigint | null {
  const raw = typeof value === "number" ? String(value) : value.toString();
  const match = /^([+-]?)(\d+)(?:\.(\d{1,3}))?$/.exec(raw);
  if (!match) return null;
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] ?? "").padEnd(3, "0"));
  return sign * (whole * 1000n + fraction);
}

function fromMilliUnits(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1000n;
  const fraction = String(absolute % 1000n).padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function validateElectricityTiers(tiers: ElectricityTariffTierRecord[]): ResolvedElectricityTier[] | null {
  if (tiers.length === 0) return null;
  const ordered = [...tiers].sort((left, right) => left.tierNo - right.tierNo);
  const validated: ResolvedElectricityTier[] = [];
  let previousUpper: bigint | null = null;

  for (let index = 0; index < ordered.length; index += 1) {
    const tier = ordered[index];
    if (tier.tierNo !== index + 1 || typeof tier.unitPrice !== "bigint" || tier.unitPrice < 0n) return null;
    const lower = toMilliUnits(tier.lowerKwh);
    const upper = tier.upperKwh === null ? null : toMilliUnits(tier.upperKwh);
    if (lower === null || lower < 0n || (tier.upperKwh !== null && (upper === null || upper <= lower))) return null;
    if (index === 0 ? lower !== 0n : previousUpper === null || lower !== previousUpper) return null;
    if (index < ordered.length - 1 && upper === null) return null;
    if (index === ordered.length - 1 && upper !== null) return null;
    validated.push({
      electricityTariffTierId: tier.electricityTariffTierId,
      tierNo: tier.tierNo,
      lowerKwh: fromMilliUnits(lower),
      upperKwh: upper === null ? null : fromMilliUnits(upper),
      unitPrice: tier.unitPrice,
    });
    previousUpper = upper;
  }
  return validated;
}

function versionSummary(version: UtilityTariffVersionRecord): ResolvedVersion {
  return {
    utilityTariffVersionId: version.utilityTariffVersionId,
    versionNo: version.versionNo,
    effectiveFrom: version.effectiveFrom,
    sourceName: version.sourceName,
    sourceReference: version.sourceReference,
  };
}

export async function resolveUtilityTariff(
  repository: UtilityTariffRepository,
  input: UtilityTariffLookup,
): Promise<UtilityTariffResolution> {
  if (!(input.periodStart instanceof Date) || Number.isNaN(input.periodStart.getTime())) return unresolved("INVALID_PERIOD_START");
  if (input.utilityType !== "ELECTRICITY" && input.utilityType !== "WATER") return unresolved("INVALID_TARIFF_CONFIGURATION");
  if (!await repository.propertyBelongsToOwner(input.ownerId, input.propertyId)) return unresolved("PROPERTY_SCOPE_MISMATCH");

  const tariffs = await repository.findActiveTariffs(input);
  if (tariffs.length === 0) return unresolved("TARIFF_MISSING");

  const candidates = tariffs.flatMap((tariff) => {
    if (tariff.status !== "active") return [];
    const version = eligibleVersions(tariff.versions, input.periodStart)[0];
    return version ? [{ tariff, version }] : [];
  });
  if (candidates.length === 0) return unresolved("VERSION_MISSING");
  if (candidates.length > 1) return unresolved("AMBIGUOUS_TARIFF");

  const { tariff, version } = candidates[0];
  const base = {
    ownerId: input.ownerId,
    propertyId: input.propertyId,
    tariff: { utilityTariffId: tariff.utilityTariffId, code: tariff.code, name: tariff.name },
    version: versionSummary(version),
  };

  if (input.utilityType === "ELECTRICITY") {
    if (version.unit !== "kWh" || version.calculationMode !== "PROGRESSIVE" || version.flatUnitPrice !== null) return unresolved("INVALID_TARIFF_CONFIGURATION");
    const tiers = validateElectricityTiers(version.tiers);
    if (!tiers) return unresolved("INVALID_ELECTRICITY_TIERS");
    return { status: "RESOLVED", utilityType: "ELECTRICITY", ...base, unit: "kWh", calculationMode: "PROGRESSIVE", tiers };
  }

  if (version.unit !== "m3" || version.calculationMode !== "FLAT" || typeof version.flatUnitPrice !== "bigint" || version.flatUnitPrice < 0n || version.tiers.length > 0) {
    return unresolved("INVALID_WATER_RATE");
  }
  return { status: "RESOLVED", utilityType: "WATER", ...base, unit: "m3", calculationMode: "FLAT", unitPrice: version.flatUnitPrice };
}
