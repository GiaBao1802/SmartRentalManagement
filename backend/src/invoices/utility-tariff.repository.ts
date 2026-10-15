import type { PrismaClient } from "@prisma/client";

export type UtilityType = "ELECTRICITY" | "WATER";

export type UtilityTariffLookup = {
  ownerId: bigint;
  propertyId: bigint;
  utilityType: UtilityType;
  periodStart: Date;
};

export type DecimalValue = string | number | { toString(): string };

export type ElectricityTariffTierRecord = {
  electricityTariffTierId: bigint;
  tierNo: number;
  lowerKwh: DecimalValue;
  upperKwh: DecimalValue | null;
  unitPrice: bigint;
};

export type UtilityTariffVersionRecord = {
  utilityTariffVersionId: bigint;
  versionNo: number;
  effectiveFrom: Date;
  unit: string;
  calculationMode: string;
  flatUnitPrice: bigint | null;
  sourceName: string | null;
  sourceReference: string | null;
  publishedAt: Date | null;
  tiers: ElectricityTariffTierRecord[];
};

export type UtilityTariffRecord = {
  utilityTariffId: bigint;
  code: string;
  name: string;
  status: string;
  versions: UtilityTariffVersionRecord[];
};

export interface UtilityTariffRepository {
  propertyBelongsToOwner(ownerId: bigint, propertyId: bigint): Promise<boolean>;
  findActiveTariffs(input: UtilityTariffLookup): Promise<UtilityTariffRecord[]>;
}

/** Read-only, Owner/Property-scoped tariff access for the internal Billing resolver. */
export class PrismaUtilityTariffRepository implements UtilityTariffRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "property" | "utilityTariff">) {}

  async propertyBelongsToOwner(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({
      where: { ownerId, propertyId },
      select: { propertyId: true },
    });
    return property !== null;
  }

  async findActiveTariffs(input: UtilityTariffLookup) {
    const rows = await this.prisma.utilityTariff.findMany({
      where: {
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        utilityType: input.utilityType,
        status: "active",
      },
      orderBy: { utilityTariffId: "asc" },
      select: {
        utilityTariffId: true,
        code: true,
        name: true,
        status: true,
        versions: {
          where: {
            publishedAt: { not: null },
            effectiveFrom: { lte: input.periodStart },
          },
          orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }],
          take: 1,
          select: {
            utilityTariffVersionId: true,
            versionNo: true,
            effectiveFrom: true,
            unit: true,
            calculationMode: true,
            flatUnitPrice: true,
            sourceName: true,
            sourceReference: true,
            publishedAt: true,
            tiers: {
              orderBy: { tierNo: "asc" },
              select: {
                electricityTariffTierId: true,
                tierNo: true,
                lowerKwh: true,
                upperKwh: true,
                unitPrice: true,
              },
            },
          },
        },
      },
    });
    return rows as UtilityTariffRecord[];
  }
}
