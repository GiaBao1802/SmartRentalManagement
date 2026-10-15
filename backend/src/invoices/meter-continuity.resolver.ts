import type {
  MeterContinuityLookup,
  MeterContinuityRepository,
  MeterDecimal,
  MeterUtilityType,
  PreviousFinalizedInvoiceRecord,
} from "./meter-continuity.repository.js";

export type MeterContinuityUnresolvedReason =
  | "INVALID_PERIOD_START"
  | "INVALID_UTILITY_TYPE"
  | "CONTRACT_NOT_FOUND"
  | "SCOPE_MISMATCH"
  | "NO_PREVIOUS_FINALIZED_INVOICE_AND_NO_INITIAL_READING"
  | "INVALID_PREVIOUS_READING"
  | "INVALID_INITIAL_READING";

export type MeterContinuityResolution =
  | {
      status: "RESOLVED";
      ownerId: bigint;
      contractId: bigint;
      utilityType: MeterUtilityType;
      invoicePeriodStart: Date;
      openingReading: string;
      source: "PREVIOUS_FINALIZED_INVOICE";
      reference: { invoiceId: bigint; periodStart: Date; periodEnd: Date };
    }
  | {
      status: "RESOLVED";
      ownerId: bigint;
      contractId: bigint;
      utilityType: MeterUtilityType;
      invoicePeriodStart: Date;
      openingReading: string;
      source: "CONTRACT_INITIAL_READING";
      reference: { contractId: bigint };
    }
  | {
      status: "UNRESOLVED";
      reason: MeterContinuityUnresolvedReason;
      reference?: { invoiceId: bigint } | { contractId: bigint };
    };

function unresolved(reason: MeterContinuityUnresolvedReason, reference?: { invoiceId: bigint } | { contractId: bigint }): MeterContinuityResolution {
  return { status: "UNRESOLVED", reason, ...(reference ? { reference } : {}) };
}

function canonicalReading(value: MeterDecimal | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value : value.toString();
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(raw);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(3, "0");
  return `${whole}.${fraction}`;
}

function dateOrdinal(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function endingReading(invoice: PreviousFinalizedInvoiceRecord, utilityType: MeterUtilityType) {
  return utilityType === "ELECTRICITY" ? invoice.electricityCurrentKwh : invoice.waterCurrentM3;
}

export async function resolveMeterContinuity(
  repository: MeterContinuityRepository,
  input: MeterContinuityLookup,
): Promise<MeterContinuityResolution> {
  if (!(input.invoicePeriodStart instanceof Date) || Number.isNaN(input.invoicePeriodStart.getTime())) {
    return unresolved("INVALID_PERIOD_START");
  }
  if (input.utilityType !== "ELECTRICITY" && input.utilityType !== "WATER") {
    return unresolved("INVALID_UTILITY_TYPE");
  }

  const contract = await repository.findContract(input.ownerId, input.contractId);
  if (!contract) return unresolved("CONTRACT_NOT_FOUND");
  if (contract.ownerId !== input.ownerId || contract.contractId !== input.contractId) return unresolved("SCOPE_MISMATCH");

  const previous = await repository.findPreviousFinalizedInvoice(input, contract.propertyId);
  if (previous) {
    if (previous.ownerId !== input.ownerId || previous.contractId !== input.contractId || previous.propertyId !== contract.propertyId) {
      return unresolved("SCOPE_MISMATCH", { invoiceId: previous.invoiceId });
    }
    if (!(previous.periodStart instanceof Date) || Number.isNaN(previous.periodStart.getTime())
      || !(previous.periodEnd instanceof Date) || Number.isNaN(previous.periodEnd.getTime())
      || dateOrdinal(previous.periodEnd) >= dateOrdinal(input.invoicePeriodStart)) {
      return unresolved("INVALID_PREVIOUS_READING", { invoiceId: previous.invoiceId });
    }
    const openingReading = canonicalReading(endingReading(previous, input.utilityType));
    if (openingReading === null) return unresolved("INVALID_PREVIOUS_READING", { invoiceId: previous.invoiceId });
    return {
      status: "RESOLVED",
      ownerId: input.ownerId,
      contractId: input.contractId,
      utilityType: input.utilityType,
      invoicePeriodStart: input.invoicePeriodStart,
      openingReading,
      source: "PREVIOUS_FINALIZED_INVOICE",
      reference: { invoiceId: previous.invoiceId, periodStart: previous.periodStart, periodEnd: previous.periodEnd },
    };
  }

  const rawInitial = input.utilityType === "ELECTRICITY" ? contract.initialElectricKwh : contract.initialWaterM3;
  if (rawInitial === null || rawInitial === undefined) {
    return unresolved("NO_PREVIOUS_FINALIZED_INVOICE_AND_NO_INITIAL_READING", { contractId: contract.contractId });
  }
  const initial = canonicalReading(rawInitial);
  if (initial === null) return unresolved("INVALID_INITIAL_READING", { contractId: contract.contractId });

  return {
    status: "RESOLVED",
    ownerId: input.ownerId,
    contractId: input.contractId,
    utilityType: input.utilityType,
    invoicePeriodStart: input.invoicePeriodStart,
    openingReading: initial,
    source: "CONTRACT_INITIAL_READING",
    reference: { contractId: contract.contractId },
  };
}
