import type { ResolvedElectricityTier } from "./utility-tariff.resolver.js";

export type ElectricityTierAmount = ResolvedElectricityTier & { quantity: string; amount: bigint };
export type InvoiceItemDraft = {
  itemKey: string; category: "RENT" | "ELECTRICITY" | "WATER" | "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
  sourceType: string; sourceReference: string | null; utilityTariffVersionId?: bigint; utilityType?: "ELECTRICITY" | "WATER";
  propertyPriceVersionId?: bigint; pricingKind?: "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
  flexibleServiceChargeId?: bigint; parkingAssignmentId?: bigint; parkingEntitlementId?: bigint;
  labelSnapshot: string; descriptionSnapshot: string | null; quantity: string; unit: string;
  unitPriceSnapshot: bigint | null; amount: bigint; calculationRuleVersion: string;
  applicablePeriodStart: Date | null; applicablePeriodEnd: Date | null;
  electricityTiers?: ElectricityTierAmount[];
};

export function decimalMilli(value: string | number | { toString(): string }): bigint {
  const raw = typeof value === "number" ? String(value) : value.toString();
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(raw);
  if (!match) throw new Error("INVALID_DECIMAL_QUANTITY");
  const result = BigInt(match[1]) * 1000n + BigInt((match[2] ?? "").padEnd(3, "0"));
  if (result > 999_999_999_999n) throw new Error("DECIMAL_QUANTITY_OUT_OF_RANGE");
  return result;
}

export function formatMilli(value: bigint): string {
  if (value < 0n || value > 999_999_999_999n) throw new Error("DECIMAL_QUANTITY_OUT_OF_RANGE");
  return `${value / 1000n}.${String(value % 1000n).padStart(3, "0")}`;
}

/** VND half-up rounding for non-negative quantity-milli × integer price. */
export function lineAmount(quantityMilli: bigint, unitPrice: bigint): bigint {
  if (quantityMilli < 0n || unitPrice < 0n) throw new Error("NEGATIVE_FINANCIAL_VALUE");
  const value = (quantityMilli * unitPrice + 500n) / 1000n;
  if (value > 9_223_372_036_854_775_807n) throw new Error("AMOUNT_OUT_OF_RANGE");
  return value;
}

export function calculateElectricityTiers(usage: string | number | { toString(): string }, tiers: ResolvedElectricityTier[]): ElectricityTierAmount[] {
  const usageMilli = decimalMilli(usage);
  if (tiers.length === 0) throw new Error("INVALID_ELECTRICITY_TIERS");
  const results: ElectricityTierAmount[] = [];
  let allocated = 0n;
  let previousUpper: bigint | null = null;
  tiers.forEach((tier, index) => {
    const lower = decimalMilli(tier.lowerKwh);
    const upper = tier.upperKwh === null ? null : decimalMilli(tier.upperKwh);
    if (tier.tierNo !== index + 1 || (index === 0 ? lower !== 0n : previousUpper === null || lower !== previousUpper)
      || (index < tiers.length - 1 && upper === null) || (index === tiers.length - 1 && upper !== null)
      || (upper !== null && upper <= lower) || tier.unitPrice < 0n) throw new Error("INVALID_ELECTRICITY_TIERS");
    const room = upper === null ? usageMilli - allocated : (upper - lower < usageMilli - allocated ? upper - lower : usageMilli - allocated);
    const quantity = room > 0n ? room : 0n;
    results.push({ ...tier, quantity: formatMilli(quantity), amount: lineAmount(quantity, tier.unitPrice) });
    allocated += quantity;
    previousUpper = upper;
  });
  if (allocated !== usageMilli) throw new Error("INVALID_ELECTRICITY_TIERS");
  return results;
}

export function totalRoundedItems(items: InvoiceItemDraft[]): bigint {
  return items.reduce((sum, item) => sum + item.amount, 0n);
}
