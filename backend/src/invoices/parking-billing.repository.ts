import type { PrismaClient } from "@prisma/client";

export type ParkingBillingLookup = {
  ownerId: bigint;
  propertyId: bigint;
  contractId: bigint;
  roomId: bigint;
  periodStart: Date;
};

export type ParkingPriceVersionRecord = {
  propertyPriceVersionId: bigint;
  propertyPricingItemId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  kind: string;
  versionNo: number;
  effectiveFrom: Date;
  unitPrice: bigint;
  sourceName: string | null;
  sourceReference: string | null;
  publishedAt: Date | null;
};

export type ParkingPricingItemRecord = {
  propertyPricingItemId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  kind: string;
  code: string;
  name: string;
  unit: string;
  status: string;
  priceVersions: ParkingPriceVersionRecord[];
};

export type ParkingEntitlementRecord = {
  parkingEntitlementId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  entitlementType: string;
  billability: string;
  propertyPricingItemId: bigint | null;
  pricingKind: string | null;
  code: string;
  name: string;
  active: boolean;
  pricingItem: ParkingPricingItemRecord | null;
};

export type ParkingAssignmentRecord = {
  assignmentId: bigint;
  parkingSlotId: bigint;
  propertyId: bigint;
  ownerId: bigint;
  vehicleId: bigint;
  residentId: bigint;
  roomId: bigint;
  contractId: bigint;
  startedAt: Date;
  endedAt: Date | null;
  status: string;
  entitlementId: bigint | null;
  vehicle: { vehicleId: bigint; residentId: bigint; ownerId: bigint; vehicleType: string; plateNumber: string | null };
  resident: { residentId: bigint; ownerId: bigint };
  parkingSlot: { parkingSlotId: bigint; propertyId: bigint; ownerId: bigint };
  entitlement: ParkingEntitlementRecord | null;
};

export interface ParkingBillingRepository {
  propertyBelongsToOwner(ownerId: bigint, propertyId: bigint): Promise<boolean>;
  contractMatchesRoom(input: ParkingBillingLookup): Promise<boolean>;
  residentHasOccupancyAtPeriodStart(input: ParkingBillingLookup, residentId: bigint): Promise<boolean>;
  findAssignments(input: ParkingBillingLookup): Promise<ParkingAssignmentRecord[]>;
}

/** Read-only V1.7 Parking access. It never creates or updates assignments/entitlements. */
export class PrismaParkingBillingRepository implements ParkingBillingRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "property" | "contract" | "roomResident" | "parkingSlotAssignment">) {}

  async propertyBelongsToOwner(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({
      where: { ownerId, propertyId },
      select: { propertyId: true },
    });
    return property !== null;
  }

  async contractMatchesRoom(input: ParkingBillingLookup) {
    const contract = await this.prisma.contract.findFirst({
      where: {
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        contractId: input.contractId,
        roomId: input.roomId,
      },
      select: { contractId: true },
    });
    return contract !== null;
  }

  async residentHasOccupancyAtPeriodStart(input: ParkingBillingLookup, residentId: bigint) {
    const occupancy = await this.prisma.roomResident.findFirst({
      where: {
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        roomId: input.roomId,
        contractId: input.contractId,
        residentId,
        startedAt: { lte: input.periodStart },
        OR: [
          { status: "active", endedAt: null },
          { status: "ended", endedAt: { gte: input.periodStart } },
        ],
      },
      select: { occupancyId: true },
    });
    return occupancy !== null;
  }

  async findAssignments(input: ParkingBillingLookup) {
    const rows = await this.prisma.parkingSlotAssignment.findMany({
      where: {
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        contractId: input.contractId,
        roomId: input.roomId,
        startedAt: { lte: input.periodStart },
        OR: [
          { status: "active", endedAt: null },
          { status: { in: ["ended", "revoked"] }, endedAt: { gte: input.periodStart } },
        ],
      },
      orderBy: [{ assignmentId: "asc" }],
      select: {
        assignmentId: true,
        parkingSlotId: true,
        propertyId: true,
        ownerId: true,
        vehicleId: true,
        residentId: true,
        roomId: true,
        contractId: true,
        startedAt: true,
        endedAt: true,
        status: true,
        entitlementId: true,
        vehicle: { select: { vehicleId: true, residentId: true, ownerId: true, vehicleType: true, plateNumber: true } },
        resident: { select: { residentId: true, ownerId: true } },
        parkingSlot: { select: { parkingSlotId: true, propertyId: true, ownerId: true } },
        entitlement: {
          select: {
            parkingEntitlementId: true,
            ownerId: true,
            propertyId: true,
            entitlementType: true,
            billability: true,
            propertyPricingItemId: true,
            pricingKind: true,
            code: true,
            name: true,
            active: true,
            pricingItem: {
              select: {
                propertyPricingItemId: true,
                ownerId: true,
                propertyId: true,
                kind: true,
                code: true,
                name: true,
                unit: true,
                status: true,
                priceVersions: {
                  where: { effectiveFrom: { lte: input.periodStart } },
                  orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }],
                  take: 1,
                  select: {
                    propertyPriceVersionId: true,
                    propertyPricingItemId: true,
                    ownerId: true,
                    propertyId: true,
                    kind: true,
                    versionNo: true,
                    effectiveFrom: true,
                    unitPrice: true,
                    sourceName: true,
                    sourceReference: true,
                    publishedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return rows as unknown as ParkingAssignmentRecord[];
  }
}
