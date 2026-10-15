import type {
  FixedServicePriceLookup,
  FixedServicePriceRepository,
  FixedServicePriceVersionRecord,
  FixedServicePricingItemRecord,
} from "./fixed-service-price.repository.js";

export type FixedServicePriceUnresolvedReason =
  | "INVALID_PERIOD_START"
  | "PROPERTY_SCOPE_MISMATCH"
  | "ROOM_NOT_ELIGIBLE"
  | "INVALID_PRICING_ITEM"
  | "PRICE_VERSION_MISSING"
  | "INVALID_PRICE_VERSION";

export type ResolvedFixedServicePrice = {
  pricingItemId: bigint;
  priceVersionId: bigint;
  code: string;
  name: string;
  unit: string;
  unitPrice: bigint;
  versionNo: number;
  effectiveFrom: Date;
  sourceName: string | null;
  sourceReference: string | null;
};

export type FixedServicePriceResolution =
  | {
    status: "RESOLVED";
    ownerId: bigint;
    propertyId: bigint;
    periodStart: Date;
    roomId: bigint | null;
    services: ResolvedFixedServicePrice[];
  }
  | { status: "UNRESOLVED"; reason: FixedServicePriceUnresolvedReason };

function unresolved(reason: FixedServicePriceUnresolvedReason): FixedServicePriceResolution {
  return { status: "UNRESOLVED", reason };
}

function dateOrdinal(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function eligibleVersion(versions: FixedServicePriceVersionRecord[], periodStart: Date) {
  const period = dateOrdinal(periodStart);
  return versions
    .filter((version) => version.publishedAt !== null
      && version.effectiveFrom instanceof Date
      && !Number.isNaN(version.effectiveFrom.getTime())
      && dateOrdinal(version.effectiveFrom) <= period)
    .sort((left, right) => dateOrdinal(right.effectiveFrom) - dateOrdinal(left.effectiveFrom)
      || right.versionNo - left.versionNo)[0];
}

function isValidItem(item: FixedServicePricingItemRecord, input: FixedServicePriceLookup) {
  return item.ownerId === input.ownerId
    && item.propertyId === input.propertyId
    && item.kind === "FIXED_SERVICE"
    && item.status === "active"
    && item.code.trim().length > 0
    && item.name.trim().length > 0
    && item.unit.trim().length > 0;
}

export async function resolveFixedServicePrices(
  repository: FixedServicePriceRepository,
  input: FixedServicePriceLookup,
): Promise<FixedServicePriceResolution> {
  if (!(input.periodStart instanceof Date) || Number.isNaN(input.periodStart.getTime())) {
    return unresolved("INVALID_PERIOD_START");
  }
  if (!await repository.propertyBelongsToOwner(input.ownerId, input.propertyId)) {
    return unresolved("PROPERTY_SCOPE_MISMATCH");
  }
  if (!await repository.roomIsEligible(input)) return unresolved("ROOM_NOT_ELIGIBLE");

  const items = await repository.findActiveFixedServices(input);
  const services: ResolvedFixedServicePrice[] = [];

  for (const item of items) {
    if (!isValidItem(item, input)) return unresolved("INVALID_PRICING_ITEM");

    const version = eligibleVersion(item.versions, input.periodStart);
    if (!version) return unresolved("PRICE_VERSION_MISSING");
    if (!Number.isInteger(version.versionNo) || version.versionNo < 1
      || typeof version.unitPrice !== "bigint" || version.unitPrice < 0n
      || !(version.effectiveFrom instanceof Date) || Number.isNaN(version.effectiveFrom.getTime())
      || version.publishedAt === null) {
      return unresolved("INVALID_PRICE_VERSION");
    }

    services.push({
      pricingItemId: item.propertyPricingItemId,
      priceVersionId: version.propertyPriceVersionId,
      code: item.code,
      name: item.name,
      unit: item.unit,
      unitPrice: version.unitPrice,
      versionNo: version.versionNo,
      effectiveFrom: version.effectiveFrom,
      sourceName: version.sourceName,
      sourceReference: version.sourceReference,
    });
  }

  return {
    status: "RESOLVED",
    ownerId: input.ownerId,
    propertyId: input.propertyId,
    periodStart: input.periodStart,
    roomId: input.roomId ?? null,
    services,
  };
}
