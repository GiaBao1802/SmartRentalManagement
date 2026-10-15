import type { PrismaClient } from "@prisma/client";

export type MeterUtilityType = "ELECTRICITY" | "WATER";
export type MeterDecimal = string | { toString(): string };

export type MeterContinuityLookup = {
  ownerId: bigint;
  contractId: bigint;
  utilityType: MeterUtilityType;
  invoicePeriodStart: Date;
};

export type MeterContractRecord = {
  contractId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  initialElectricKwh: MeterDecimal | null;
  initialWaterM3: MeterDecimal | null;
};

export type PreviousFinalizedInvoiceRecord = {
  invoiceId: bigint;
  ownerId: bigint;
  propertyId: bigint;
  contractId: bigint;
  periodStart: Date;
  periodEnd: Date;
  electricityCurrentKwh: MeterDecimal | null;
  waterCurrentM3: MeterDecimal | null;
};

export interface MeterContinuityRepository {
  findContract(ownerId: bigint, contractId: bigint): Promise<MeterContractRecord | null>;
  findPreviousFinalizedInvoice(input: MeterContinuityLookup, propertyId: bigint): Promise<PreviousFinalizedInvoiceRecord | null>;
}

type MeterPrismaClient = Pick<PrismaClient, "contract" | "invoice">;

/** Read-only Contract-scoped meter history access. No predecessor or Room history query is made. */
export class PrismaMeterContinuityRepository implements MeterContinuityRepository {
  constructor(private readonly prisma: MeterPrismaClient) {}

  async findContract(ownerId: bigint, contractId: bigint) {
    return this.prisma.contract.findFirst({
      where: { ownerId, contractId },
      select: { contractId: true, ownerId: true, propertyId: true, initialElectricKwh: true, initialWaterM3: true },
    }) as Promise<MeterContractRecord | null>;
  }

  async findPreviousFinalizedInvoice(input: MeterContinuityLookup, propertyId: bigint) {
    return this.prisma.invoice.findFirst({
      where: {
        ownerId: input.ownerId,
        propertyId,
        contractId: input.contractId,
        status: { in: ["unpaid", "paid"] },
        finalizedAt: { not: null },
        periodEnd: { lt: input.invoicePeriodStart },
      },
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }, { invoiceId: "desc" }],
      select: { invoiceId: true, ownerId: true, propertyId: true, contractId: true, periodStart: true, periodEnd: true, electricityCurrentKwh: true, waterCurrentM3: true },
    }) as Promise<PreviousFinalizedInvoiceRecord | null>;
  }
}
