import type { PrismaClient } from "@prisma/client";

export type FixedServicePriceLookup = {
  ownerId: bigint;
  propertyId: bigint;
  periodStart: Date;
  /** Optional Invoice Room context. Omit only when resolving the Property catalog itself. */
  roomId?: bigint;
};

export type FixedServicePriceVersionRecord = {
  propertyPriceVersionId: bigint;
  versionNo: number;
  effectiveFrom: Date;
  unitPrice: bigint;
  sourceName: string | null;
  sourceReference: string | null;
  publishedAt: Date | null;
};

export type FixedServicePricingItemRecord = {
  propertyPricingItemId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  kind: string;
  code: string;
  name: string;
  unit: string;
  status: string;
  versions: FixedServicePriceVersionRecord[];
};

export interface FixedServicePriceRepository {
  propertyBelongsToOwner(ownerId: bigint, propertyId: bigint): Promise<boolean>;
  roomIsEligible(input: FixedServicePriceLookup): Promise<boolean>;
  findActiveFixedServices(input: FixedServicePriceLookup): Promise<FixedServicePricingItemRecord[]>;
}

/** Read-only V1.7 Property pricing lookup; never queries Contract price overrides or Facilities. */
export class PrismaFixedServicePriceRepository implements FixedServicePriceRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "property" | "room" | "propertyPricingItem">) {}

  async propertyBelongsToOwner(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({
      where: { ownerId, propertyId },
      select: { propertyId: true },
    });
    return property !== null;
  }

  async roomIsEligible(input: FixedServicePriceLookup) {
    if (input.roomId === undefined) return true;
    const room = await this.prisma.room.findFirst({
      where: {
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        roomId: input.roomId,
        isActive: true,
        status: { not: "inactive" },
      },
      select: { roomId: true },
    });
    return room !== null;
  }

  async findActiveFixedServices(input: FixedServicePriceLookup) {
    const rows = await this.prisma.propertyPricingItem.findMany({
      where: {
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        kind: "FIXED_SERVICE",
        status: "active",
      },
      orderBy: { propertyPricingItemId: "asc" },
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
          where: {
            effectiveFrom: { lte: input.periodStart },
          },
          orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }],
          take: 1,
          select: {
            propertyPriceVersionId: true,
            versionNo: true,
            effectiveFrom: true,
            unitPrice: true,
            sourceName: true,
            sourceReference: true,
            publishedAt: true,
          },
        },
      },
    });
    return rows.map(({ priceVersions, ...item }) => ({ ...item, versions: priceVersions })) as unknown as FixedServicePricingItemRecord[];
  }
}
