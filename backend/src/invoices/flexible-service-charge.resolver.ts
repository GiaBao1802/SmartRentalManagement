import type {
  FlexibleServiceChargeLookup,
  FlexibleServiceChargeRecord,
  FlexibleServiceChargeRepository,
  FlexibleServicePriceVersionRecord,
} from "./flexible-service-charge.repository.js";

export type FlexibleChargeExclusionReason = "ALREADY_INVOICED" | "VOID" | "OUTSIDE_INVOICE_PERIOD";

export type FlexibleServiceChargeUnresolvedReason =
  | "INVALID_INVOICE_PERIOD"
  | "PROPERTY_SCOPE_MISMATCH"
  | "CONTRACT_ROOM_SCOPE_MISMATCH"
  | "CHARGE_SCOPE_MISMATCH"
  | "INVALID_CHARGE_STATUS"
  | "READY_CHARGE_ALREADY_LINKED"
  | "INVOICED_CHARGE_MISSING_INVOICE"
  | "INVALID_SOURCE_IDENTITY"
  | "DUPLICATE_SOURCE_EVENT"
  | "INVALID_CHARGE_DATA"
  | "PRICING_ITEM_MISSING"
  | "INVALID_PRICING_ITEM"
  | "PRICE_VERSION_MISSING"
  | "CHARGE_PRICE_VERSION_MISMATCH"
  | "INVALID_PRICE_VERSION"
  | "CHARGE_PRICE_SNAPSHOT_MISMATCH";

export type ResolvedFlexibleServiceCharge = {
  chargeId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  contractId: bigint;
  roomId: bigint;
  residentId: bigint | null;
  pricingItemId: bigint;
  priceVersionId: bigint;
  code: string;
  name: string;
  occurredAt: Date;
  quantity: string;
  unit: string;
  unitPrice: bigint;
  amountSnapshot: bigint;
  versionNo: number;
  effectiveFrom: Date;
  sourceName: string | null;
  sourceReference: string | null;
  sourceSystem: string;
  sourceEventKey: string;
};

export type FlexibleServiceChargeResolution =
  | {
    status: "RESOLVED";
    ownerId: bigint;
    propertyId: bigint;
    contractId: bigint;
    roomId: bigint;
    periodStart: Date;
    periodEnd: Date;
    eligibleCharges: ResolvedFlexibleServiceCharge[];
    excludedCharges: Array<{ chargeId: bigint; reason: FlexibleChargeExclusionReason }>;
  }
  | { status: "UNRESOLVED"; reason: FlexibleServiceChargeUnresolvedReason };

const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";
const MAX_QUANTITY_MILLI = 999_999_999_999n; // numeric(12,3)

function unresolved(reason: FlexibleServiceChargeUnresolvedReason): FlexibleServiceChargeResolution {
  return { status: "UNRESOLVED", reason };
}

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function dateOrdinal(parts: { year: number; month: number; day: number }) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function invoiceDateParts(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toMilliQuantity(value: FlexibleServiceChargeRecord["quantity"]): bigint | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value : value?.toString?.();
  if (typeof raw !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(raw);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(3, "0"));
  const quantity = whole * 1000n + fraction;
  if (quantity <= 0n || quantity > MAX_QUANTITY_MILLI) return null;
  return quantity;
}

function fromMilliQuantity(value: bigint) {
  return `${value / 1000n}.${String(value % 1000n).padStart(3, "0")}`;
}

function validPeriod(input: FlexibleServiceChargeLookup) {
  if (!isValidDate(input.periodStart) || !isValidDate(input.periodEnd)) return false;
  return dateOrdinal(invoiceDateParts(input.periodEnd)) >= dateOrdinal(invoiceDateParts(input.periodStart));
}

function inInvoicePeriod(occurredAt: Date, input: FlexibleServiceChargeLookup) {
  const eventDay = dateOrdinal(dateParts(occurredAt, BUSINESS_TIME_ZONE));
  return eventDay >= dateOrdinal(invoiceDateParts(input.periodStart))
    && eventDay <= dateOrdinal(invoiceDateParts(input.periodEnd));
}

function validFingerprint(value: Uint8Array) {
  return value instanceof Uint8Array && value.byteLength === 32;
}

function eligiblePriceVersion(versions: FlexibleServicePriceVersionRecord[], occurredAt: Date) {
  const eventDay = dateOrdinal(dateParts(occurredAt, BUSINESS_TIME_ZONE));
  return versions
    .filter((version) => isValidDate(version.publishedAt)
      && isValidDate(version.effectiveFrom)
      && dateOrdinal(invoiceDateParts(version.effectiveFrom)) <= eventDay)
    .sort((left, right) => dateOrdinal(invoiceDateParts(right.effectiveFrom)) - dateOrdinal(invoiceDateParts(left.effectiveFrom))
      || right.versionNo - left.versionNo)[0];
}

function hasValidPricingItem(charge: FlexibleServiceChargeRecord, lookup: FlexibleServiceChargeLookup) {
  const item = charge.pricingItem;
  return item !== null
    && item.propertyPricingItemId === charge.propertyPricingItemId
    && item.ownerId === lookup.ownerId
    && item.propertyId === lookup.propertyId
    && item.kind === "FLEXIBLE_SERVICE"
    && (item.status === "active" || item.status === "retired")
    && typeof item.code === "string" && item.code.trim().length > 0
    && typeof item.name === "string" && item.name.trim().length > 0
    && typeof item.unit === "string" && item.unit.trim().length > 0
    && item.unit === charge.unit;
}

function hasVersionScope(version: FlexibleServicePriceVersionRecord, charge: FlexibleServiceChargeRecord) {
  return version.propertyPricingItemId === charge.propertyPricingItemId
    && version.ownerId === charge.ownerId
    && version.propertyId === charge.propertyId
    && version.kind === "FLEXIBLE_SERVICE";
}

export async function resolveFlexibleServiceCharges(
  repository: FlexibleServiceChargeRepository,
  input: FlexibleServiceChargeLookup,
): Promise<FlexibleServiceChargeResolution> {
  if (!validPeriod(input)) return unresolved("INVALID_INVOICE_PERIOD");
  if (!await repository.propertyBelongsToOwner(input.ownerId, input.propertyId)) return unresolved("PROPERTY_SCOPE_MISMATCH");
  if (!await repository.contractMatchesRoom(input)) return unresolved("CONTRACT_ROOM_SCOPE_MISMATCH");

  const charges = await repository.findCharges(input);
  const eventKeys = new Set<string>();
  const eligibleCharges: ResolvedFlexibleServiceCharge[] = [];
  const excludedCharges: Array<{ chargeId: bigint; reason: FlexibleChargeExclusionReason }> = [];

  for (const charge of charges) {
    if (charge.ownerId !== input.ownerId || charge.propertyId !== input.propertyId
      || charge.contractId !== input.contractId || charge.roomId !== input.roomId
      || charge.kind !== "FLEXIBLE_SERVICE") return unresolved("CHARGE_SCOPE_MISMATCH");
    if (!isValidDate(charge.occurredAt)) return unresolved("INVALID_CHARGE_DATA");
    if (!inInvoicePeriod(charge.occurredAt, input)) {
      excludedCharges.push({ chargeId: charge.flexibleServiceChargeId, reason: "OUTSIDE_INVOICE_PERIOD" });
      continue;
    }

    if (charge.status === "INVOICED") {
      if (charge.invoiceId === null) return unresolved("INVOICED_CHARGE_MISSING_INVOICE");
      excludedCharges.push({ chargeId: charge.flexibleServiceChargeId, reason: "ALREADY_INVOICED" });
      continue;
    }
    if (charge.status === "VOID") {
      excludedCharges.push({ chargeId: charge.flexibleServiceChargeId, reason: "VOID" });
      continue;
    }
    if (charge.status !== "READY") return unresolved("INVALID_CHARGE_STATUS");
    if (charge.invoiceId !== null) return unresolved("READY_CHARGE_ALREADY_LINKED");
    if (typeof charge.sourceSystem !== "string" || charge.sourceSystem.trim().length === 0
      || typeof charge.sourceEventKey !== "string" || charge.sourceEventKey.trim().length === 0
      || !validFingerprint(charge.payloadFingerprint)) return unresolved("INVALID_SOURCE_IDENTITY");

    const eventIdentity = `${charge.ownerId}\u0000${charge.sourceSystem}\u0000${charge.sourceEventKey}`;
    if (eventKeys.has(eventIdentity)) return unresolved("DUPLICATE_SOURCE_EVENT");
    eventKeys.add(eventIdentity);

    const quantity = toMilliQuantity(charge.quantity);
    if (quantity === null || typeof charge.unit !== "string" || charge.unit.trim().length === 0
      || typeof charge.unitPriceSnapshot !== "bigint" || charge.unitPriceSnapshot < 0n) {
      return unresolved("INVALID_CHARGE_DATA");
    }
    if (!charge.pricingItem) return unresolved("PRICING_ITEM_MISSING");
    if (!hasValidPricingItem(charge, input)) return unresolved("INVALID_PRICING_ITEM");

    const version = eligiblePriceVersion(charge.pricingItem.priceVersions, charge.occurredAt);
    if (!version) return unresolved("PRICE_VERSION_MISSING");
    if (!hasVersionScope(version, charge)) return unresolved("INVALID_PRICE_VERSION");
    if (!Number.isInteger(version.versionNo) || version.versionNo < 1
      || typeof version.unitPrice !== "bigint" || version.unitPrice < 0n
      || !isValidDate(version.effectiveFrom) || !isValidDate(version.publishedAt)) return unresolved("INVALID_PRICE_VERSION");
    if (version.propertyPriceVersionId !== charge.propertyPriceVersionId) return unresolved("CHARGE_PRICE_VERSION_MISMATCH");
    if (version.unitPrice !== charge.unitPriceSnapshot) return unresolved("CHARGE_PRICE_SNAPSHOT_MISMATCH");

    eligibleCharges.push({
      chargeId: charge.flexibleServiceChargeId,
      ownerId: charge.ownerId,
      propertyId: charge.propertyId,
      contractId: charge.contractId,
      roomId: charge.roomId,
      residentId: charge.residentId,
      pricingItemId: charge.propertyPricingItemId,
      priceVersionId: version.propertyPriceVersionId,
      code: charge.pricingItem.code,
      name: charge.pricingItem.name,
      occurredAt: charge.occurredAt,
      quantity: fromMilliQuantity(quantity),
      unit: charge.pricingItem.unit,
      unitPrice: version.unitPrice,
      amountSnapshot: charge.amountSnapshot,
      versionNo: version.versionNo,
      effectiveFrom: version.effectiveFrom,
      sourceName: version.sourceName,
      sourceReference: version.sourceReference,
      sourceSystem: charge.sourceSystem,
      sourceEventKey: charge.sourceEventKey,
    });
  }

  return {
    status: "RESOLVED",
    ownerId: input.ownerId,
    propertyId: input.propertyId,
    contractId: input.contractId,
    roomId: input.roomId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    eligibleCharges,
    excludedCharges,
  };
}
