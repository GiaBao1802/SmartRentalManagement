import type { Prisma } from "@prisma/client";
import type { InvoicePricing } from "./invoice.repository.js";
import { calculateElectricityTiers, decimalMilli, formatMilli, lineAmount, totalRoundedItems, type InvoiceItemDraft } from "./invoice-itemized.calculator.js";
import { PrismaUtilityTariffRepository } from "./utility-tariff.repository.js";
import { resolveUtilityTariff } from "./utility-tariff.resolver.js";
import { PrismaMeterContinuityRepository } from "./meter-continuity.repository.js";
import { resolveMeterContinuity } from "./meter-continuity.resolver.js";
import { PrismaFixedServicePriceRepository } from "./fixed-service-price.repository.js";
import { resolveFixedServicePrices } from "./fixed-service-price.resolver.js";
import { PrismaFlexibleServiceChargeRepository } from "./flexible-service-charge.repository.js";
import { resolveFlexibleServiceCharges } from "./flexible-service-charge.resolver.js";
import { PrismaParkingBillingRepository } from "./parking-billing.repository.js";
import { resolveParkingBilling } from "./parking-billing.resolver.js";

export type MeterOpeningSource = { sourceKind: "FINALIZED_INVOICE"; sourceInvoiceId: bigint; readingAt: null }
  | { sourceKind: "CONTRACT_INITIAL"; sourceContractId: bigint; readingAt: null };
export type InvoiceItemizedPlan = {
  items: InvoiceItemDraft[];
  totalAmount: bigint;
  rentAmount: bigint;
  electricityAmount: bigint;
  waterAmount: bigint;
  serviceAmount: bigint;
  electricityOpening: { value: string; source: MeterOpeningSource };
  waterOpening: { value: string; source: MeterOpeningSource };
  electricityEnding: string;
  waterEnding: string;
  flexibleChargeIds: bigint[];
};

export type InvoiceReadinessReason = {
  code: string;
  category: "electricity" | "water" | "pricing" | "service" | "parking" | "contract";
  message: string;
};
export type InvoiceReadinessInspection = {
  readyToFinalize: boolean;
  missingOrInvalid: InvoiceReadinessReason[];
};

type Tx = Prisma.TransactionClient;
type ContractContext = {
  contractId: bigint; contractNo: string; ownerId: bigint; propertyId: bigint; roomId: bigint;
  rentAmount: bigint; startDate: Date; endDate: Date; status: string; terminationDate: Date | null;
  room: { roomCode: string; property: { name: string } };
};
type InvoiceContext = {
  invoiceId: bigint; ownerId: bigint; propertyId: bigint; contractId: bigint; periodStart: Date; periodEnd: Date;
  electricityCurrentKwh: unknown; waterCurrentM3: unknown;
};

function sourceForMeter(value: Awaited<ReturnType<typeof resolveMeterContinuity>>): MeterOpeningSource | null {
  if (value.status !== "RESOLVED") return null;
  return value.source === "PREVIOUS_FINALIZED_INVOICE"
    ? { sourceKind: "FINALIZED_INVOICE", sourceInvoiceId: value.reference.invoiceId, readingAt: null }
    : { sourceKind: "CONTRACT_INITIAL", sourceContractId: value.reference.contractId, readingAt: null };
}

function ref(...parts: Array<string | bigint | number | Date | null>) {
  return parts.map((part) => part instanceof Date ? part.toISOString().slice(0, 10) : String(part ?? "")).join(":");
}

function baseItem(invoice: InvoiceContext, input: Omit<InvoiceItemDraft, "applicablePeriodStart" | "applicablePeriodEnd" | "calculationRuleVersion">): InvoiceItemDraft {
  return { ...input, calculationRuleVersion: "V1_7", applicablePeriodStart: invoice.periodStart, applicablePeriodEnd: invoice.periodEnd };
}

/** Resolves approved V1.7 sources and calculates all new-invoice amounts without writing. */
export class PrismaItemizedInvoicePricing implements InvoicePricing {
  /** Read-only inspection. Uses the same source resolvers as calculation/finalization. */
  async inspect(invoiceValue: any, contractValue: any, txValue: unknown): Promise<InvoiceReadinessInspection> {
    const tx = txValue as Tx;
    const invoice = invoiceValue as InvoiceContext;
    const contract = contractValue as ContractContext;
    const missingOrInvalid: InvoiceReadinessReason[] = [];
    const add = (code: string, category: InvoiceReadinessReason["category"], message: string) => {
      missingOrInvalid.push({ code, category, message });
    };
    if (invoice.contractId !== contract.contractId || invoice.ownerId !== contract.ownerId || invoice.propertyId !== contract.propertyId
      || contract.room?.property === undefined || contract.rentAmount < 0n) {
      add("CONTRACT_BILLING_CONTEXT_INVALID", "contract", "Thông tin hợp đồng hoặc tiền thuê chưa hợp lệ.");
    }

    const shared = { ownerId: invoice.ownerId, propertyId: invoice.propertyId, periodStart: invoice.periodStart };
    const meterRepository = new PrismaMeterContinuityRepository(tx);
    const [electricityOpening, waterOpening, electricityTariff, waterTariff, fixed, flexible, parking] = await Promise.all([
      resolveMeterContinuity(meterRepository, { ownerId: invoice.ownerId, contractId: invoice.contractId, utilityType: "ELECTRICITY", invoicePeriodStart: invoice.periodStart }),
      resolveMeterContinuity(meterRepository, { ownerId: invoice.ownerId, contractId: invoice.contractId, utilityType: "WATER", invoicePeriodStart: invoice.periodStart }),
      resolveUtilityTariff(new PrismaUtilityTariffRepository(tx), { ...shared, utilityType: "ELECTRICITY" }),
      resolveUtilityTariff(new PrismaUtilityTariffRepository(tx), { ...shared, utilityType: "WATER" }),
      resolveFixedServicePrices(new PrismaFixedServicePriceRepository(tx), { ...shared, roomId: contract.roomId }),
      resolveFlexibleServiceCharges(new PrismaFlexibleServiceChargeRepository(tx), { ...shared, contractId: invoice.contractId, roomId: contract.roomId, periodEnd: invoice.periodEnd }),
      resolveParkingBilling(new PrismaParkingBillingRepository(tx), { ...shared, contractId: invoice.contractId, roomId: contract.roomId }),
    ]);

    const meterReason = (utility: "ELECTRICITY" | "WATER", result: Awaited<ReturnType<typeof resolveMeterContinuity>>) => {
      if (result.status === "RESOLVED") return;
      const category = utility === "ELECTRICITY" ? "electricity" : "water";
      const label = utility === "ELECTRICITY" ? "điện" : "nước";
      const code = result.reason === "NO_PREVIOUS_FINALIZED_INVOICE_AND_NO_INITIAL_READING"
        ? `${utility}_OPENING_MISSING`
        : `${utility}_OPENING_INVALID`;
      add(code, category, `Chưa xác định được chỉ số ${label} đầu kỳ hợp lệ.`);
    };
    meterReason("ELECTRICITY", electricityOpening);
    meterReason("WATER", waterOpening);

    const endingReason = (utility: "ELECTRICITY" | "WATER", value: unknown, opening: typeof electricityOpening) => {
      const label = utility === "ELECTRICITY" ? "điện" : "nước";
      const category = utility === "ELECTRICITY" ? "electricity" : "water";
      if (value === null || value === undefined || value === "") {
        add(`${utility}_ENDING_MISSING`, category, `Chưa nhập chỉ số ${label} cuối kỳ.`);
        return;
      }
      try {
        if (opening.status === "RESOLVED" && decimalMilli(value as any) < decimalMilli(opening.openingReading)) {
          add(`${utility}_ENDING_BELOW_OPENING`, category, `Chỉ số ${label} cuối kỳ thấp hơn chỉ số đầu kỳ.`);
        } else decimalMilli(value as any);
      } catch {
        add(`${utility}_ENDING_INVALID`, category, `Chỉ số ${label} cuối kỳ không hợp lệ.`);
      }
    };
    endingReason("ELECTRICITY", invoice.electricityCurrentKwh, electricityOpening);
    endingReason("WATER", invoice.waterCurrentM3, waterOpening);

    const tariffReason = (utility: "ELECTRICITY" | "WATER", result: Awaited<ReturnType<typeof resolveUtilityTariff>>) => {
      if (result.status === "RESOLVED") return;
      const label = utility === "ELECTRICITY" ? "điện" : "nước";
      add(`${utility}_${result.reason}`, utility === "ELECTRICITY" ? "electricity" : "water", `Thiếu hoặc chưa hợp lệ cấu hình giá ${label} áp dụng cho kỳ này.`);
    };
    tariffReason("ELECTRICITY", electricityTariff);
    tariffReason("WATER", waterTariff);
    if (fixed.status !== "RESOLVED") add(`FIXED_SERVICE_${fixed.reason}`, "service", "Thiếu hoặc chưa hợp lệ giá dịch vụ cố định.");
    if (flexible.status !== "RESOLVED") add(`FLEXIBLE_SERVICE_${flexible.reason}`, "service", "Có dữ liệu dịch vụ phát sinh chưa thể xác định để tính hóa đơn.");
    else for (const charge of flexible.eligibleCharges) {
      try {
        if (lineAmount(decimalMilli(charge.quantity), charge.unitPrice) !== charge.amountSnapshot) {
          add("FLEXIBLE_SERVICE_CHARGE_AMOUNT_MISMATCH", "service", "Số tiền của một dịch vụ phát sinh không khớp số lượng và đơn giá đã ghi nhận.");
        }
      } catch {
        add("FLEXIBLE_SERVICE_CHARGE_AMOUNT_INVALID", "service", "Số lượng hoặc số tiền của một dịch vụ phát sinh không hợp lệ.");
      }
    }
    if (parking.status !== "RESOLVED") add(`PARKING_${parking.reason}`, "parking", "Chưa thể xác định quyền gửi xe hoặc giá gửi xe cho kỳ này.");

    return { readyToFinalize: missingOrInvalid.length === 0, missingOrInvalid };
  }

  async calculate(invoiceValue: any, contractValue: any, txValue?: unknown): Promise<InvoiceItemizedPlan | null> {
    if (!txValue) return null;
    const tx = txValue as Tx;
    const invoice = invoiceValue as InvoiceContext;
    const contract = contractValue as ContractContext;
    if (invoice.contractId !== contract.contractId || invoice.ownerId !== contract.ownerId || invoice.propertyId !== contract.propertyId
      || contract.room?.property === undefined || contract.rentAmount < 0n) return null;
    let electricityEnding: string; let waterEnding: string;
    try {
      if (invoice.electricityCurrentKwh === null || invoice.electricityCurrentKwh === undefined || invoice.waterCurrentM3 === null || invoice.waterCurrentM3 === undefined) return null;
      electricityEnding = formatMilli(decimalMilli(invoice.electricityCurrentKwh as any));
      waterEnding = formatMilli(decimalMilli(invoice.waterCurrentM3 as any));
    } catch { return null; }

    const shared = { ownerId: invoice.ownerId, propertyId: invoice.propertyId, periodStart: invoice.periodStart };
    const meterRepository = new PrismaMeterContinuityRepository(tx);
    const [electricityOpening, waterOpening, electricityTariff, waterTariff, fixed, flexible, parking] = await Promise.all([
      resolveMeterContinuity(meterRepository, { ownerId: invoice.ownerId, contractId: invoice.contractId, utilityType: "ELECTRICITY", invoicePeriodStart: invoice.periodStart }),
      resolveMeterContinuity(meterRepository, { ownerId: invoice.ownerId, contractId: invoice.contractId, utilityType: "WATER", invoicePeriodStart: invoice.periodStart }),
      resolveUtilityTariff(new PrismaUtilityTariffRepository(tx), { ...shared, utilityType: "ELECTRICITY" }),
      resolveUtilityTariff(new PrismaUtilityTariffRepository(tx), { ...shared, utilityType: "WATER" }),
      resolveFixedServicePrices(new PrismaFixedServicePriceRepository(tx), { ...shared, roomId: contract.roomId }),
      resolveFlexibleServiceCharges(new PrismaFlexibleServiceChargeRepository(tx), { ...shared, contractId: invoice.contractId, roomId: contract.roomId, periodEnd: invoice.periodEnd }),
      resolveParkingBilling(new PrismaParkingBillingRepository(tx), { ...shared, contractId: invoice.contractId, roomId: contract.roomId }),
    ]);
    const electricityOpeningSource = sourceForMeter(electricityOpening);
    const waterOpeningSource = sourceForMeter(waterOpening);
    if (!electricityOpeningSource || !waterOpeningSource || electricityTariff.status !== "RESOLVED" || electricityTariff.utilityType !== "ELECTRICITY"
      || waterTariff.status !== "RESOLVED" || waterTariff.utilityType !== "WATER" || fixed.status !== "RESOLVED"
      || flexible.status !== "RESOLVED" || parking.status !== "RESOLVED"
      || electricityOpening.status !== "RESOLVED" || waterOpening.status !== "RESOLVED") return null;
    let electricityUsage: bigint; let waterUsage: bigint;
    try {
      const electricityStart = decimalMilli(electricityOpening.openingReading);
      const waterStart = decimalMilli(waterOpening.openingReading);
      const electricityEnd = decimalMilli(electricityEnding); const waterEnd = decimalMilli(waterEnding);
      if (electricityEnd < electricityStart || waterEnd < waterStart) return null;
      electricityUsage = electricityEnd - electricityStart; waterUsage = waterEnd - waterStart;
    } catch { return null; }

    const electricityTiers = calculateElectricityTiers(formatMilli(electricityUsage), electricityTariff.tiers);
    const electricityAmount = electricityTiers.reduce((sum, row) => sum + row.amount, 0n);
    const waterAmount = lineAmount(waterUsage, waterTariff.unitPrice);
    const items: InvoiceItemDraft[] = [
      baseItem(invoice, { itemKey: "RENT", category: "RENT", sourceType: "CONTRACT", sourceReference: ref(contract.contractNo, contract.contractId), labelSnapshot: `Tiền thuê ${contract.room.roomCode}`, descriptionSnapshot: "Tiền thuê trọn kỳ theo hợp đồng; không prorate kỳ cuối.", quantity: "1.000", unit: "period", unitPriceSnapshot: contract.rentAmount, amount: contract.rentAmount }),
      baseItem(invoice, { itemKey: "ELECTRICITY", category: "ELECTRICITY", sourceType: "UTILITY_TARIFF_VERSION", sourceReference: ref(electricityTariff.tariff.code, electricityTariff.version.versionNo, electricityTariff.version.sourceReference), utilityTariffVersionId: electricityTariff.version.utilityTariffVersionId, utilityType: "ELECTRICITY", labelSnapshot: "Tiền điện", descriptionSnapshot: `Biểu giá ${electricityTariff.tariff.name}, tính lũy tiến theo bậc.`, quantity: formatMilli(electricityUsage), unit: "kWh", unitPriceSnapshot: null, amount: electricityAmount, electricityTiers }),
      baseItem(invoice, { itemKey: "WATER", category: "WATER", sourceType: "UTILITY_TARIFF_VERSION", sourceReference: ref(waterTariff.tariff.code, waterTariff.version.versionNo, waterTariff.version.sourceReference), utilityTariffVersionId: waterTariff.version.utilityTariffVersionId, utilityType: "WATER", labelSnapshot: "Tiền nước", descriptionSnapshot: `Đơn giá ${waterTariff.unitPrice} VND/m³.`, quantity: formatMilli(waterUsage), unit: "m3", unitPriceSnapshot: waterTariff.unitPrice, amount: waterAmount }),
    ];
    for (const service of fixed.services) items.push(baseItem(invoice, {
      itemKey: `FIXED_SERVICE:${service.pricingItemId}`, category: "FIXED_SERVICE", sourceType: "PROPERTY_PRICE_VERSION", sourceReference: ref(service.code, service.versionNo, service.sourceName, service.sourceReference), propertyPriceVersionId: service.priceVersionId, pricingKind: "FIXED_SERVICE", labelSnapshot: service.name, descriptionSnapshot: "Phí dịch vụ cố định trọn kỳ, không prorate.", quantity: "1.000", unit: service.unit, unitPriceSnapshot: service.unitPrice, amount: service.unitPrice,
    }));
    for (const charge of flexible.eligibleCharges) {
      let amount: bigint;
      try { amount = lineAmount(decimalMilli(charge.quantity), charge.unitPrice); } catch { return null; }
      // V1.7 requires the item amount to reconcile to the immutable source charge amount.
      if (amount !== charge.amountSnapshot) return null;
      items.push(baseItem(invoice, { itemKey: `FLEXIBLE_SERVICE:${charge.chargeId}`, category: "FLEXIBLE_SERVICE", sourceType: "FLEXIBLE_SERVICE_CHARGE", sourceReference: ref(charge.sourceSystem, charge.sourceEventKey, charge.occurredAt, charge.name), propertyPriceVersionId: charge.priceVersionId, pricingKind: "FLEXIBLE_SERVICE", flexibleServiceChargeId: charge.chargeId, labelSnapshot: charge.name, descriptionSnapshot: `Dịch vụ phát sinh ${charge.occurredAt.toISOString()}; giá phiên bản ${charge.versionNo}.`, quantity: charge.quantity, unit: charge.unit, unitPriceSnapshot: charge.unitPrice, amount }));
    }
    for (const entitlement of parking.entitlements) if (entitlement.status === "RESOLVED_BILLABLE") {
      if (entitlement.unitPrice === null || entitlement.priceVersionId === null || entitlement.pricingItemId === null || entitlement.entitlementId === null) return null;
      items.push(baseItem(invoice, { itemKey: `PARKING:${entitlement.assignmentId}`, category: "PARKING", sourceType: "PARKING_ASSIGNMENT", sourceReference: ref(entitlement.entitlementCode, entitlement.plateNumber, entitlement.vehicleType, entitlement.assignmentStartedAt), propertyPriceVersionId: entitlement.priceVersionId, pricingKind: "PARKING", parkingAssignmentId: entitlement.assignmentId, parkingEntitlementId: entitlement.entitlementId, labelSnapshot: entitlement.entitlementName ?? "Phí gửi xe", descriptionSnapshot: `${entitlement.plateNumber ?? entitlement.vehicleType}; giá tại đầu kỳ, không prorate.`, quantity: "1.000", unit: "period", unitPriceSnapshot: entitlement.unitPrice, amount: entitlement.unitPrice }));
    }
    const electric = items.find((item) => item.category === "ELECTRICITY");
    if (electric) electric.electricityTiers = electricityTiers;
    const sumCategory = (category: InvoiceItemDraft["category"]) => items.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0n);
    const rentAmount = sumCategory("RENT"); const serviceAmount = sumCategory("FIXED_SERVICE") + sumCategory("FLEXIBLE_SERVICE") + sumCategory("PARKING");
    if (rentAmount !== contract.rentAmount || sumCategory("ELECTRICITY") !== electricityAmount || sumCategory("WATER") !== waterAmount) return null;
    return { items, totalAmount: totalRoundedItems(items), rentAmount, electricityAmount, waterAmount, serviceAmount,
      electricityOpening: { value: electricityOpening.openingReading, source: electricityOpeningSource }, waterOpening: { value: waterOpening.openingReading, source: waterOpeningSource },
      electricityEnding, waterEnding, flexibleChargeIds: flexible.eligibleCharges.map((charge) => charge.chargeId) };
  }
}
