import type {
  ParkingAssignmentRecord,
  ParkingBillingLookup,
  ParkingBillingRepository,
  ParkingPriceVersionRecord,
} from "./parking-billing.repository.js";

export type ParkingResolutionUnresolvedReason =
  | "INVALID_PERIOD_START"
  | "PROPERTY_SCOPE_MISMATCH"
  | "CONTRACT_ROOM_SCOPE_MISMATCH"
  | "ASSIGNMENT_SCOPE_MISMATCH"
  | "ASSIGNMENT_NOT_ACTIVE_AT_PERIOD_START"
  | "RESIDENT_CONTEXT_MISMATCH"
  | "RESIDENT_NOT_OCCUPYING_ROOM_AT_PERIOD_START"
  | "INVALID_ENTITLEMENT"
  | "PRICING_ITEM_MISSING"
  | "INVALID_PRICING_ITEM"
  | "PRICE_VERSION_MISSING"
  | "INVALID_PRICE_VERSION";

export type ResolvedParkingEntitlement = {
  status: "RESOLVED_BILLABLE" | "RESOLVED_FREE" | "RESOLVED_UNCLASSIFIED";
  assignmentId: bigint;
  entitlementId: bigint | null;
  ownerId: bigint;
  propertyId: bigint;
  contractId: bigint;
  roomId: bigint;
  residentId: bigint;
  vehicleId: bigint;
  vehicleType: string;
  plateNumber: string | null;
  parkingSlotId: bigint;
  entitlementType: string | null;
  billability: "PAID" | "FREE" | "UNCLASSIFIED";
  assignmentStartedAt: Date;
  entitlementCode: string | null;
  entitlementName: string | null;
  pricingItemId: bigint | null;
  priceVersionId: bigint | null;
  unitPrice: bigint | null;
  effectiveFrom: Date | null;
  versionNo: number | null;
  reason: string;
};

export type ParkingBillingResolution =
  | { status: "RESOLVED"; ownerId: bigint; propertyId: bigint; contractId: bigint; roomId: bigint; periodStart: Date; entitlements: ResolvedParkingEntitlement[] }
  | { status: "UNRESOLVED"; reason: ParkingResolutionUnresolvedReason };

function unresolved(reason: ParkingResolutionUnresolvedReason): ParkingBillingResolution {
  return { status: "UNRESOLVED", reason };
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function dateOrdinal(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function eligibleVersion(versions: ParkingPriceVersionRecord[], periodStart: Date) {
  const start = dateOrdinal(periodStart);
  return versions
    .filter((version) => isValidDate(version.publishedAt)
      && isValidDate(version.effectiveFrom)
      && dateOrdinal(version.effectiveFrom) <= start)
    .sort((left, right) => dateOrdinal(right.effectiveFrom) - dateOrdinal(left.effectiveFrom)
      || right.versionNo - left.versionNo)[0];
}

function isAssignmentActiveOnDate(assignment: ParkingAssignmentRecord, periodStart: Date) {
  if (!isValidDate(assignment.startedAt)) return null;
  if (dateOrdinal(assignment.startedAt) > dateOrdinal(periodStart)) return false;
  if (assignment.status === "active") return assignment.endedAt === null ? true : null;
  if (assignment.status !== "ended" && assignment.status !== "revoked") return null;
  if (!isValidDate(assignment.endedAt)) return null;
  return dateOrdinal(assignment.endedAt) >= dateOrdinal(periodStart);
}

function isValidEntitlementShape(assignment: ParkingAssignmentRecord) {
  const entitlement = assignment.entitlement;
  if (!entitlement) return assignment.entitlementId === null;
  if (assignment.entitlementId !== entitlement.parkingEntitlementId
    || !entitlement.active
    || entitlement.ownerId !== assignment.ownerId
    || entitlement.propertyId !== assignment.propertyId
    || entitlement.code.trim().length === 0
    || entitlement.name.trim().length === 0) return false;

  if (entitlement.entitlementType === "PAID_SLOT") return entitlement.billability === "PAID";
  if (entitlement.entitlementType === "FREE_SLOT") return entitlement.billability === "FREE";
  if (entitlement.entitlementType === "LEGACY_UNCLASSIFIED") return entitlement.billability === "UNCLASSIFIED";
  return (entitlement.entitlementType === "MOTORCYCLE_VEHICLE_CARD" || entitlement.entitlementType === "APARTMENT_VEHICLE_CARD")
    && (entitlement.billability === "PAID" || entitlement.billability === "FREE");
}

function isValidPricingItem(assignment: ParkingAssignmentRecord, input: ParkingBillingLookup) {
  const entitlement = assignment.entitlement;
  const item = entitlement?.pricingItem;
  return entitlement !== null && entitlement !== undefined
    && entitlement.billability === "PAID"
    && entitlement.pricingKind === "PARKING"
    && entitlement.propertyPricingItemId !== null
    && item !== null && item !== undefined
    && item.propertyPricingItemId === entitlement.propertyPricingItemId
    && item.ownerId === input.ownerId
    && item.propertyId === input.propertyId
    && item.kind === "PARKING"
    && item.status === "active"
    && item.code.trim().length > 0
    && item.name.trim().length > 0
    && item.unit.trim().length > 0;
}

function hasAssignmentScope(assignment: ParkingAssignmentRecord, input: ParkingBillingLookup) {
  return assignment.ownerId === input.ownerId
    && assignment.propertyId === input.propertyId
    && assignment.contractId === input.contractId
    && assignment.roomId === input.roomId
    && assignment.vehicle?.vehicleId === assignment.vehicleId
    && assignment.vehicle.residentId === assignment.residentId
    && assignment.vehicle.ownerId === input.ownerId
    && assignment.resident?.residentId === assignment.residentId
    && assignment.resident.ownerId === input.ownerId
    && assignment.parkingSlot?.parkingSlotId === assignment.parkingSlotId
    && assignment.parkingSlot.propertyId === input.propertyId
    && assignment.parkingSlot.ownerId === input.ownerId;
}

function resolvePaidPrice(assignment: ParkingAssignmentRecord, input: ParkingBillingLookup) {
  const version = eligibleVersion(assignment.entitlement?.pricingItem?.priceVersions ?? [], input.periodStart);
  return version;
}

function resultFor(assignment: ParkingAssignmentRecord, status: ResolvedParkingEntitlement["status"], billability: ResolvedParkingEntitlement["billability"], version?: ParkingPriceVersionRecord): ResolvedParkingEntitlement {
  const entitlement = assignment.entitlement;
  return {
    status,
    assignmentId: assignment.assignmentId,
    entitlementId: entitlement?.parkingEntitlementId ?? null,
    ownerId: assignment.ownerId,
    propertyId: assignment.propertyId,
    contractId: assignment.contractId,
    roomId: assignment.roomId,
    residentId: assignment.residentId,
    vehicleId: assignment.vehicleId,
    vehicleType: assignment.vehicle.vehicleType,
    plateNumber: assignment.vehicle.plateNumber,
    parkingSlotId: assignment.parkingSlotId,
    entitlementType: entitlement?.entitlementType ?? null,
    billability,
    assignmentStartedAt: assignment.startedAt,
    entitlementCode: entitlement?.code ?? null,
    entitlementName: entitlement?.name ?? null,
    pricingItemId: version?.propertyPricingItemId ?? entitlement?.propertyPricingItemId ?? null,
    priceVersionId: version?.propertyPriceVersionId ?? null,
    unitPrice: version?.unitPrice ?? null,
    effectiveFrom: version?.effectiveFrom ?? null,
    versionNo: version?.versionNo ?? null,
    reason: status === "RESOLVED_BILLABLE" ? "PAID_ENTITLEMENT_ACTIVE_AT_PERIOD_START" : status === "RESOLVED_FREE" ? "FREE_ENTITLEMENT_NO_CHARGE" : "UNCLASSIFIED_OR_MISSING_ENTITLEMENT_NO_INFERENCE",
  };
}

export async function resolveParkingBilling(repository: ParkingBillingRepository, input: ParkingBillingLookup): Promise<ParkingBillingResolution> {
  if (!isValidDate(input.periodStart)) return unresolved("INVALID_PERIOD_START");
  if (!await repository.propertyBelongsToOwner(input.ownerId, input.propertyId)) return unresolved("PROPERTY_SCOPE_MISMATCH");
  if (!await repository.contractMatchesRoom(input)) return unresolved("CONTRACT_ROOM_SCOPE_MISMATCH");

  const assignments = await repository.findAssignments(input);
  const results: ResolvedParkingEntitlement[] = [];
  for (const assignment of assignments) {
    if (!hasAssignmentScope(assignment, input)) return unresolved("ASSIGNMENT_SCOPE_MISMATCH");
    const activeAtPeriodStart = isAssignmentActiveOnDate(assignment, input.periodStart);
    if (activeAtPeriodStart === null) return unresolved("ASSIGNMENT_NOT_ACTIVE_AT_PERIOD_START");
    if (!activeAtPeriodStart) continue;
    if (!await repository.residentHasOccupancyAtPeriodStart(input, assignment.residentId)) {
      return unresolved("RESIDENT_NOT_OCCUPYING_ROOM_AT_PERIOD_START");
    }
    if (!isValidEntitlementShape(assignment)) return unresolved("INVALID_ENTITLEMENT");

    const entitlement = assignment.entitlement;
    if (!entitlement) {
      results.push(resultFor(assignment, "RESOLVED_UNCLASSIFIED", "UNCLASSIFIED"));
      continue;
    }
    if (entitlement.billability === "UNCLASSIFIED") {
      results.push(resultFor(assignment, "RESOLVED_UNCLASSIFIED", "UNCLASSIFIED"));
      continue;
    }
    if (entitlement.billability === "FREE") {
      results.push(resultFor(assignment, "RESOLVED_FREE", "FREE"));
      continue;
    }
    if (entitlement.billability !== "PAID") return unresolved("INVALID_ENTITLEMENT");
    if (!entitlement.pricingItem) return unresolved("PRICING_ITEM_MISSING");
    if (!isValidPricingItem(assignment, input)) return unresolved("INVALID_PRICING_ITEM");

    const version = resolvePaidPrice(assignment, input);
    if (!version) return unresolved("PRICE_VERSION_MISSING");
    if (version.propertyPricingItemId !== entitlement.propertyPricingItemId
      || version.ownerId !== input.ownerId
      || version.propertyId !== input.propertyId
      || version.kind !== "PARKING"
      || !Number.isInteger(version.versionNo) || version.versionNo < 1
      || typeof version.unitPrice !== "bigint" || version.unitPrice < 0n
      || !isValidDate(version.effectiveFrom) || !isValidDate(version.publishedAt)
      || dateOrdinal(version.effectiveFrom) > dateOrdinal(input.periodStart)) return unresolved("INVALID_PRICE_VERSION");
    results.push(resultFor(assignment, "RESOLVED_BILLABLE", "PAID", version));
  }

  return { status: "RESOLVED", ownerId: input.ownerId, propertyId: input.propertyId, contractId: input.contractId, roomId: input.roomId, periodStart: input.periodStart, entitlements: results };
}
