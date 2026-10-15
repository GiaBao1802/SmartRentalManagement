import type { PrismaClient } from "@prisma/client";

export type FlexibleServiceChargeLookup = {
  ownerId: bigint;
  propertyId: bigint;
  contractId: bigint;
  roomId: bigint;
  periodStart: Date;
  periodEnd: Date;
};

export type FlexibleServicePriceVersionRecord = {
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

export type FlexibleServicePricingItemRecord = {
  propertyPricingItemId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  kind: string;
  code: string;
  name: string;
  unit: string;
  status: string;
  priceVersions: FlexibleServicePriceVersionRecord[];
};

export type FlexibleServiceChargeRecord = {
  flexibleServiceChargeId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  contractId: bigint;
  roomId: bigint;
  residentId: bigint | null;
  kind: string;
  propertyPricingItemId: bigint;
  propertyPriceVersionId: bigint;
  occurredAt: Date;
  quantity: string | number | { toString(): string };
  unit: string;
  unitPriceSnapshot: bigint;
  amountSnapshot: bigint;
  sourceSystem: string;
  sourceEventKey: string;
  payloadFingerprint: Uint8Array;
  status: string;
  invoiceId: bigint | null;
  pricingItem: FlexibleServicePricingItemRecord | null;
};

export interface FlexibleServiceChargeRepository {
  propertyBelongsToOwner(ownerId: bigint, propertyId: bigint): Promise<boolean>;
  contractMatchesRoom(input: FlexibleServiceChargeLookup): Promise<boolean>;
  findCharges(input: FlexibleServiceChargeLookup): Promise<FlexibleServiceChargeRecord[]>;
}

const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";
const HCM_OFFSET_MS = 7 * 60 * 60 * 1000;

function localDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function dateOnlyParts(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function dateOnlyUtc(value: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}

/** Convert Invoice DATE boundaries to timestamp bounds for inclusive HCM calendar days. */
export function flexibleChargePeriodBounds(periodStart: Date, periodEnd: Date) {
  const start = dateOnlyParts(periodStart);
  const end = dateOnlyParts(periodEnd);
  return {
    startInclusive: new Date(Date.UTC(start.year, start.month - 1, start.day) - HCM_OFFSET_MS),
    endExclusive: new Date(Date.UTC(end.year, end.month - 1, end.day + 1) - HCM_OFFSET_MS),
    startDate: dateOnlyUtc(start),
    endDate: dateOnlyUtc(end),
  };
}

/** Read-only Owner/Property/Contract/Room-scoped Flexible charge access. */
export class PrismaFlexibleServiceChargeRepository implements FlexibleServiceChargeRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "property" | "contract" | "flexibleServiceCharge">) {}

  async propertyBelongsToOwner(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({
      where: { ownerId, propertyId },
      select: { propertyId: true },
    });
    return property !== null;
  }

  async contractMatchesRoom(input: FlexibleServiceChargeLookup) {
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

  async findCharges(input: FlexibleServiceChargeLookup) {
    const bounds = flexibleChargePeriodBounds(input.periodStart, input.periodEnd);
    const rows = await this.prisma.flexibleServiceCharge.findMany({
      where: {
        ownerId: input.ownerId,
        propertyId: input.propertyId,
        contractId: input.contractId,
        roomId: input.roomId,
        occurredAt: { gte: bounds.startInclusive, lt: bounds.endExclusive },
      },
      orderBy: [{ occurredAt: "asc" }, { flexibleServiceChargeId: "asc" }],
      select: {
        flexibleServiceChargeId: true,
        ownerId: true,
        propertyId: true,
        contractId: true,
        roomId: true,
        residentId: true,
        kind: true,
        propertyPricingItemId: true,
        propertyPriceVersionId: true,
        occurredAt: true,
        quantity: true,
        unit: true,
        unitPriceSnapshot: true,
        amount: true,
        sourceSystem: true,
        sourceEventKey: true,
        payloadFingerprint: true,
        status: true,
        invoiceId: true,
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
              where: { effectiveFrom: { lte: bounds.endDate } },
              orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }],
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
    });
    return rows.map(({ amount, ...row }) => ({ ...row, amountSnapshot: amount })) as unknown as FlexibleServiceChargeRecord[];
  }
}
