import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreateInvoiceInput, DraftInvoicePatch } from "./invoice.validation.js";
import { billingPeriod, businessDate, dueDateFromFinalizedAt, invoiceNumber, isOverdue, periodMatchesAnchor, resolveEffectiveContractEndDate } from "./invoice.billing.js";
import { ApiError, conflict, notFound } from "../middleware/api-error.js";
import { PrismaMeterContinuityRepository } from "./meter-continuity.repository.js";
import { resolveMeterContinuity } from "./meter-continuity.resolver.js";
import { decimalMilli, formatMilli } from "./invoice-itemized.calculator.js";

type Tx = Prisma.TransactionClient;
export type InvoiceFilter = {
  page: number; pageSize: number; propertyId?: bigint; roomId?: bigint; contractId?: bigint; residentId?: bigint;
  status?: string; periodStart?: Date; periodEnd?: Date;
};
export type InvoicePricing = { calculate(invoice: any, contract: any, tx?: unknown): Promise<any | null> };

const invoiceInclude = {
  contract: { select: {
    contractId: true, contractNo: true, roomId: true, propertyId: true, ownerId: true, representativeResidentId: true,
    startDate: true, endDate: true, terminationDate: true, status: true, rentAmount: true, initialElectricKwh: true, initialWaterM3: true,
    room: { select: { roomCode: true, property: { select: { propertyId: true, name: true, province: true, address: true } } } },
  } },
  paymentTransactions: { select: { amount: true, status: true, createdAt: true }, orderBy: [{ createdAt: "desc" as const }, { paymentTransactionId: "desc" as const }] },
} satisfies Prisma.InvoiceInclude;
const invoiceDetailInclude = {
  ...invoiceInclude,
  invoiceItems: { include: { electricityTiers: { orderBy: { tierNo: "asc" as const } } }, orderBy: [{ invoiceItemId: "asc" as const }] },
} satisfies Prisma.InvoiceInclude;

function residentContractScope(ownerId: bigint, residentId: bigint): Prisma.ContractWhereInput {
  return { ownerId, OR: [
    { representativeResidentId: residentId },
    { roomResidents: { some: { residentId, ownerId } } },
  ] };
}
function amountSum(rentAmount: bigint, electricityAmount: bigint, waterAmount: bigint, serviceAmount: bigint) {
  return rentAmount + electricityAmount + waterAmount + serviceAmount;
}
function mapInvoice<T extends Record<string, any>>(row: T, now = new Date()) {
  const { paymentTransactions, ...invoice } = row;
  const payments = paymentTransactions ?? [];
  const successfulAmount = payments.filter((item: any) => item.status === "success").reduce((sum: bigint, item: any) => sum + BigInt(item.amount), 0n);
  return {
    ...invoice,
    isOverdue: isOverdue(invoice.status, invoice.dueDate, now),
    amountProvisional: invoice.status === "draft",
    paymentSummary: { attemptCount: payments.length, successfulAmount, latestStatus: payments[0]?.status ?? null },
  };
}

export class PrismaInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(ownerId: bigint, filter: InvoiceFilter, residentId?: bigint) {
    const where: Prisma.InvoiceWhereInput = {
      ownerId,
      ...(filter.propertyId === undefined ? {} : { propertyId: filter.propertyId }),
      ...(filter.contractId === undefined ? {} : { contractId: filter.contractId }),
      ...((residentId !== undefined || filter.roomId !== undefined || filter.residentId !== undefined) ? { contract: { AND: [
        ...(residentId === undefined ? [] : [residentContractScope(ownerId, residentId)]),
        ...(filter.roomId === undefined ? [] : [{ roomId: filter.roomId }]),
        ...(filter.residentId === undefined ? [] : [{ OR: [
          { representativeResidentId: filter.residentId }, { roomResidents: { some: { residentId: filter.residentId, ownerId } } },
        ] }]),
      ] } } : {}),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.periodStart === undefined ? {} : { periodStart: { gte: filter.periodStart } }),
      ...(filter.periodEnd === undefined ? {} : { periodEnd: { lte: filter.periodEnd } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, include: invoiceInclude, orderBy: [{ periodStart: "desc" }, { invoiceId: "desc" }], skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize }),
      this.prisma.invoice.count({ where }),
    ]);
    return { rows: rows.map((row) => mapInvoice(row)), total };
  }

  async findForOwner(ownerId: bigint, invoiceId: bigint) {
    const row = await this.prisma.invoice.findFirst({ where: { ownerId, invoiceId }, include: invoiceDetailInclude });
    return row ? mapInvoice(row) : null;
  }

  async findForResident(ownerId: bigint, residentId: bigint, invoiceId: bigint) {
    const row = await this.prisma.invoice.findFirst({ where: { ownerId, invoiceId, contract: residentContractScope(ownerId, residentId) }, include: invoiceInclude });
    return row ? mapInvoice(row) : null;
  }

  async listSendLogs(ownerId: bigint, invoiceId: bigint, residentId?: bigint) {
    const invoice = residentId === undefined
      ? await this.prisma.invoice.findFirst({ where: { ownerId, invoiceId }, select: { invoiceId: true } })
      : await this.prisma.invoice.findFirst({ where: { ownerId, invoiceId, contract: residentContractScope(ownerId, residentId) }, select: { invoiceId: true } });
    if (!invoice) return null;
    return this.prisma.invoiceZaloOaSendLog.findMany({
      where: { ownerId, invoiceId }, orderBy: [{ createdAt: "desc" }, { sendLogId: "desc" }],
      select: { sendLogId: true, invoiceId: true, invoiceRevision: true, status: true, providerMessageId: true, errorMessage: residentId === undefined, createdAt: true, sentAt: true },
    });
  }

  async createDraft(ownerId: bigint, input: CreateInvoiceInput) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await this.lockContract(tx, ownerId, input.contractId);
      this.assertInvoiceableContract(contract);
      const effectiveEnd = resolveEffectiveContractEndDate(contract);
      if (!periodMatchesAnchor(contract.startDate, effectiveEnd, input.periodStart, input.periodEnd)) throw new ApiError(400, "VALIDATION_ERROR", "Kỳ hóa đơn không khớp chu kỳ neo từ ngày bắt đầu hợp đồng.");
      if (input.periodStart < contract.startDate || input.periodEnd > effectiveEnd) throw new ApiError(400, "VALIDATION_ERROR", "Kỳ hóa đơn nằm ngoài thời hạn hợp đồng.");
      const existing = await tx.invoice.findUnique({ where: { contractId_periodStart_periodEnd: { contractId: input.contractId, periodStart: input.periodStart, periodEnd: input.periodEnd } } });
      if (existing) throw new ApiError(409, "INVOICE_PERIOD_CONFLICT", "Hóa đơn cho kỳ này đã tồn tại.");
      return mapInvoice(await this.createDraftForPeriod(tx, ownerId, contract, input.periodStart, input.periodEnd));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async ensureNextDraft(ownerId: bigint, contractId: bigint, today = businessDate()) {
    const ensure = () => this.prisma.$transaction(async (tx) => {
      const contract = await this.lockContract(tx, ownerId, contractId);
      this.assertInvoiceableContract(contract);
      const effectiveEnd = resolveEffectiveContractEndDate(contract);
      let eligible: ReturnType<typeof billingPeriod> = null;
      for (let offset = 0; offset < 1200; offset += 1) {
        const candidate = billingPeriod(contract.startDate, effectiveEnd, offset);
        if (!candidate) break;
        if (candidate.periodEnd < today && candidate.periodEnd <= effectiveEnd) eligible = candidate;
        else break;
      }
      if (!eligible) throw conflict("Chưa đến ngày tạo hóa đơn cho kỳ tiếp theo.");
      const where = { contractId, periodStart: eligible.periodStart, periodEnd: eligible.periodEnd };
      const existing = await tx.invoice.findUnique({ where: { contractId_periodStart_periodEnd: where }, include: invoiceInclude });
      if (existing) return mapInvoice(existing);
      const created = await this.createDraftForPeriod(tx, ownerId, contract, eligible.periodStart, eligible.periodEnd);
      return mapInvoice(created);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    for (let attempt = 0; ; attempt += 1) {
      try { return await ensure(); }
      catch (error) {
        const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "";
        if (attempt >= 2 || (code !== "P2002" && code !== "P2034")) throw error;
        // A concurrent request may have won the period's unique key or serialization race;
        // rerun the scoped transaction so it can return the already-created draft.
      }
    }
  }

  /** Ensures one specific completed Contract period without changing the API command semantics. */
  async ensureDraftForPeriod(ownerId: bigint, contractId: bigint, period: { periodStart: Date; periodEnd: Date }, today = businessDate()) {
    const ensure = () => this.prisma.$transaction(async (tx) => {
      const contract = await this.lockContract(tx, ownerId, contractId);
      this.assertInvoiceableContract(contract);
      const effectiveEnd = resolveEffectiveContractEndDate(contract);
      if (period.periodEnd >= today || !periodMatchesAnchor(contract.startDate, effectiveEnd, period.periodStart, period.periodEnd)) {
        throw conflict("Kỳ hóa đơn chưa kết thúc hoặc không còn hợp lệ theo hợp đồng.");
      }
      const existing = await tx.invoice.findUnique({
        where: { contractId_periodStart_periodEnd: { contractId, periodStart: period.periodStart, periodEnd: period.periodEnd } },
        include: invoiceInclude,
      });
      if (existing) return { created: false, invoice: mapInvoice(existing) };
      const created = await this.createDraftForPeriod(tx, ownerId, contract, period.periodStart, period.periodEnd);
      return { created: true, invoice: mapInvoice(created) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    for (let attempt = 0; ; attempt += 1) {
      try { return await ensure(); }
      catch (error) {
        const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "";
        if (attempt >= 2 || (code !== "P2002" && code !== "P2034")) throw error;
        // Re-read after an overlapping scheduler or the Admin generate command wins.
      }
    }
  }

  async patchDraft(ownerId: bigint, invoiceId: bigint, patch: DraftInvoicePatch) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, ownerId, invoiceId);
      const current = await tx.invoice.findFirst({ where: { ownerId, invoiceId }, include: invoiceInclude });
      if (!current) return null;
      if (current.status === "paid") throw new ApiError(409, "INVOICE_ALREADY_PAID", "Hóa đơn đã thanh toán không thể chỉnh sửa.");
      if (current.status !== "draft") throw new ApiError(409, "INVOICE_AMENDMENT_NOT_ALLOWED", "Hóa đơn đã finalize chỉ được sửa qua quy trình amendment được kiểm soát.");
      const data: Prisma.InvoiceUpdateInput = {};
      if (patch.electricityCurrentKwh !== undefined) data.electricityCurrentKwh = patch.electricityCurrentKwh;
      if (patch.waterCurrentM3 !== undefined) data.waterCurrentM3 = patch.waterCurrentM3;
      const invoice = await tx.invoice.update({ where: { invoiceId }, data, include: invoiceInclude });
      return mapInvoice(invoice);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async finalize(ownerId: bigint, invoiceId: bigint, patch: DraftInvoicePatch, pricing: InvoicePricing, actorAccountId?: bigint, now = new Date()) {
    // Concurrent finalizers may take their serializable snapshot before the first
    // transaction commits. Retry serialization failures so the loser re-reads the
    // finalized Invoice and returns the canonical already-finalized conflict.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => this.finalizeInTransaction(tx, ownerId, invoiceId, patch, pricing, actorAccountId, now), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "";
        const postgresCode = error instanceof Prisma.PrismaClientKnownRequestError
          ? String((error.meta as Record<string, unknown> | undefined)?.code ?? "")
          : "";
        const serializationConflict = code === "P2034" || (code === "P2010" && postgresCode === "40001");
        if (attempt >= 2 || !serializationConflict) throw error;
      }
    }
  }

  async finalizeInTransaction(tx: Tx, ownerId: bigint, invoiceId: bigint, patch: DraftInvoicePatch, pricing: InvoicePricing, actorAccountId?: bigint, now = new Date()) {
      await this.lockInvoice(tx, ownerId, invoiceId);
      const invoice = await tx.invoice.findFirst({ where: { ownerId, invoiceId }, include: invoiceInclude });
      if (!invoice) return null;
      if (invoice.status === "paid") throw new ApiError(409, "INVOICE_ALREADY_PAID", "Hóa đơn đã thanh toán.");
      if (invoice.status !== "draft") throw new ApiError(409, "INVOICE_ALREADY_FINALIZED", "Hóa đơn đã được finalize.");
      if (invoice.snapshotKind !== "NOT_FINALIZED") throw new ApiError(409, "INVOICE_ALREADY_FINALIZED", "Hóa đơn đã được finalize.");
      const effectiveEnd = resolveEffectiveContractEndDate(invoice.contract);
      if (invoice.contract.status === "draft" || !periodMatchesAnchor(invoice.contract.startDate, effectiveEnd, invoice.periodStart, invoice.periodEnd)) {
        throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Kỳ hóa đơn không còn khớp hợp đồng hiện hành.");
      }
      const withPatch = { ...invoice, electricityCurrentKwh: patch.electricityCurrentKwh ?? invoice.electricityCurrentKwh, waterCurrentM3: patch.waterCurrentM3 ?? invoice.waterCurrentM3 };
      const prevElec = withPatch.electricityPreviousKwh;
      const prevWater = withPatch.waterPreviousM3;
      if (prevElec === null || prevElec === undefined || prevWater === null || prevWater === undefined || withPatch.electricityCurrentKwh === null || withPatch.electricityCurrentKwh === undefined || withPatch.waterCurrentM3 === null || withPatch.waterCurrentM3 === undefined) {
        throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Thiếu chỉ số đầu hoặc cuối kỳ để finalize hóa đơn.");
      }
      if (decimalMilli(String(withPatch.electricityCurrentKwh)) < decimalMilli(String(prevElec)) || decimalMilli(String(withPatch.waterCurrentM3)) < decimalMilli(String(prevWater))) throw new ApiError(400, "VALIDATION_ERROR", "Chỉ số cuối kỳ không được thấp hơn chỉ số đầu kỳ.");
      if (actorAccountId === undefined) throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Thiếu tài khoản Admin để ghi nguồn chỉ số cuối kỳ.");
      const plan = await pricing.calculate({ ...withPatch, electricityPreviousKwh: prevElec, waterPreviousM3: prevWater }, invoice.contract, tx);
      if (!plan || !Array.isArray(plan.items) || plan.items.length < 3) throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Chưa có đủ dữ liệu giá, chỉ số hoặc dịch vụ có thẩm quyền để chốt hóa đơn.");
      if (plan.electricityOpening.value !== formatMilli(decimalMilli(String(prevElec))) || plan.waterOpening.value !== formatMilli(decimalMilli(String(prevWater)))
        || plan.electricityEnding !== formatMilli(decimalMilli(String(withPatch.electricityCurrentKwh))) || plan.waterEnding !== formatMilli(decimalMilli(String(withPatch.waterCurrentM3)))) {
        throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Chỉ số kỳ hóa đơn không khớp nguồn dữ liệu đã resolve.");
      }
      if (plan.items.some((item: any) => item.amount < 0n) || plan.totalAmount !== plan.items.reduce((sum: bigint, item: any) => sum + item.amount, 0n)) {
        throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Các dòng tiền hóa đơn không hợp lệ hoặc không khớp tổng.");
      }
      const itemSum = (category: string) => plan.items.filter((item: any) => item.category === category).reduce((sum: bigint, item: any) => sum + item.amount, 0n);
      if (itemSum("RENT") !== plan.rentAmount || itemSum("ELECTRICITY") !== plan.electricityAmount || itemSum("WATER") !== plan.waterAmount
        || itemSum("FIXED_SERVICE") + itemSum("FLEXIBLE_SERVICE") + itemSum("PARKING") !== plan.serviceAmount) {
        throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Khoản tổng theo nhóm không khớp với các dòng chi tiết.");
      }
      const finalizedAt = now;
      const electricityEnd = await tx.meterReading.create({ data: { ownerId, propertyId: invoice.propertyId, roomId: invoice.contract.roomId, contractId: invoice.contractId, utilityType: "ELECTRICITY", value: plan.electricityEnding, readingAt: finalizedAt, source: "MANUAL", actorAccountId, note: "Chỉ số do Admin nhập khi chốt hóa đơn; reading_at ghi thời điểm hệ thống tiếp nhận, không khẳng định thời điểm quan sát tại đồng hồ." }, select: { meterReadingId: true } });
      const waterEnd = await tx.meterReading.create({ data: { ownerId, propertyId: invoice.propertyId, roomId: invoice.contract.roomId, contractId: invoice.contractId, utilityType: "WATER", value: plan.waterEnding, readingAt: finalizedAt, source: "MANUAL", actorAccountId, note: "Chỉ số do Admin nhập khi chốt hóa đơn; reading_at ghi thời điểm hệ thống tiếp nhận, không khẳng định thời điểm quan sát tại đồng hồ." }, select: { meterReadingId: true } });
      const snapshotContext = { invoiceId, ownerId, propertyId: invoice.propertyId, roomId: invoice.contract.roomId, contractId: invoice.contractId };
      await tx.invoiceMeterReadingSnapshot.createMany({ data: [
        { ...snapshotContext, utilityType: "ELECTRICITY", snapshotRole: "OPENING", value: plan.electricityOpening.value, readingAt: plan.electricityOpening.source.readingAt, sourceKind: plan.electricityOpening.source.sourceKind, sourceInvoiceId: plan.electricityOpening.source.sourceKind === "FINALIZED_INVOICE" ? plan.electricityOpening.source.sourceInvoiceId : null, sourceContractId: plan.electricityOpening.source.sourceKind === "CONTRACT_INITIAL" ? plan.electricityOpening.source.sourceContractId : null },
        { ...snapshotContext, utilityType: "ELECTRICITY", snapshotRole: "ENDING", value: plan.electricityEnding, readingAt: finalizedAt, sourceKind: "MANUAL_READING", sourceMeterReadingId: electricityEnd.meterReadingId },
        { ...snapshotContext, utilityType: "WATER", snapshotRole: "OPENING", value: plan.waterOpening.value, readingAt: plan.waterOpening.source.readingAt, sourceKind: plan.waterOpening.source.sourceKind, sourceInvoiceId: plan.waterOpening.source.sourceKind === "FINALIZED_INVOICE" ? plan.waterOpening.source.sourceInvoiceId : null, sourceContractId: plan.waterOpening.source.sourceKind === "CONTRACT_INITIAL" ? plan.waterOpening.source.sourceContractId : null },
        { ...snapshotContext, utilityType: "WATER", snapshotRole: "ENDING", value: plan.waterEnding, readingAt: finalizedAt, sourceKind: "MANUAL_READING", sourceMeterReadingId: waterEnd.meterReadingId },
      ] });
      if (plan.flexibleChargeIds.length > 0) {
        const consumed = await tx.flexibleServiceCharge.updateMany({ where: { ownerId, propertyId: invoice.propertyId, contractId: invoice.contractId, flexibleServiceChargeId: { in: plan.flexibleChargeIds }, status: "READY", invoiceId: null }, data: { status: "INVOICED", invoiceId } });
        if (consumed.count !== plan.flexibleChargeIds.length) throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Một hoặc nhiều khoản dịch vụ phát sinh đã được hóa đơn khác sử dụng.");
      }
      for (const item of plan.items) {
        const { electricityTiers, ...row } = item;
        const createdItem = await tx.invoiceItem.create({ data: { ...row, invoiceId, ownerId, propertyId: invoice.propertyId, contractId: invoice.contractId }, select: { invoiceItemId: true } });
        if (item.category === "ELECTRICITY") {
          if (!electricityTiers?.length) throw new ApiError(409, "INVOICE_DATA_INCOMPLETE", "Thiếu chi tiết bậc giá điện.");
          await tx.invoiceItemElectricityTier.createMany({ data: electricityTiers.map((tier: any) => ({ invoiceItemId: createdItem.invoiceItemId, utilityTariffVersionId: item.utilityTariffVersionId, electricityTariffTierId: tier.electricityTariffTierId, tierNo: tier.tierNo, lowerKwh: tier.lowerKwh, upperKwh: tier.upperKwh, quantity: tier.quantity, unitPriceSnapshot: tier.unitPrice, amount: tier.amount })) });
        }
      }
      const updated = await tx.invoice.update({ where: { invoiceId }, data: {
        rentAmount: plan.rentAmount, electricityPreviousKwh: plan.electricityOpening.value, electricityCurrentKwh: plan.electricityEnding, electricityAmount: plan.electricityAmount,
        waterPreviousM3: plan.waterOpening.value, waterCurrentM3: plan.waterEnding, waterAmount: plan.waterAmount, serviceAmount: plan.serviceAmount,
        totalAmount: plan.totalAmount, finalizedAt, dueDate: dueDateFromFinalizedAt(finalizedAt), status: "unpaid", snapshotKind: "ITEMIZED",
      }, include: invoiceInclude });
      return mapInvoice(updated, now);
  }

  async lockInvoice(tx: Tx, ownerId: bigint, invoiceId: bigint) {
    await tx.$queryRaw`SELECT invoice_id FROM invoices WHERE owner_id = ${ownerId} AND invoice_id = ${invoiceId} FOR UPDATE`;
  }

  async createQueuedZaloLog(ownerId: bigint, invoiceId: bigint, resolveRecipient: (tx: Tx, invoice: any) => Promise<{ residentId: bigint; phone: string | null } | null>) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, ownerId, invoiceId);
      const invoice = await tx.invoice.findFirst({ where: { ownerId, invoiceId }, include: { contract: { select: { contractId: true, propertyId: true, ownerId: true, representativeResidentId: true } } } });
      if (!invoice) return null;
      if (invoice.status !== "unpaid" || invoice.finalizedAt === null) throw new ApiError(409, "INVOICE_NOT_SENDABLE", "Chỉ hóa đơn unpaid đã finalize mới được gửi Zalo.");
      const recipient = await resolveRecipient(tx, invoice);
      if (!recipient) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Chưa cấu hình chính sách người nhận Zalo cho hợp đồng.");
      const resident = await tx.resident.findFirst({ where: {
        ownerId, residentId: recipient.residentId,
        OR: [
          { residentId: invoice.contract.representativeResidentId },
          { roomResidents: { some: { ownerId, contractId: invoice.contractId, residentId: recipient.residentId } } },
        ],
      }, select: { residentId: true, phone: true } });
      if (!resident) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Người nhận Zalo không thuộc hợp đồng của hóa đơn này.");
      return tx.invoiceZaloOaSendLog.create({ data: {
        invoiceId, contractId: invoice.contractId, propertyId: invoice.propertyId, ownerId,
        recipientResidentId: resident.residentId, recipientPhone: resident.phone, invoiceRevision: invoice.revision, status: "queued",
      }, select: { sendLogId: true, invoiceId: true, invoiceRevision: true, status: true, createdAt: true, recipientResidentId: true, recipientPhone: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async markZaloLog(ownerId: bigint, sendLogId: bigint, result: { status: "sent" | "failed"; providerMessageId?: string | null; errorMessage?: string | null; sentAt?: Date | null }) {
    return this.prisma.invoiceZaloOaSendLog.updateMany({ where: { ownerId, sendLogId, status: "queued" }, data: result });
  }

  private async lockContract(tx: Tx, ownerId: bigint, contractId: bigint) {
    await tx.$queryRaw`SELECT contract_id FROM contracts WHERE owner_id = ${ownerId} AND contract_id = ${contractId} FOR UPDATE`;
    const contract = await tx.contract.findFirst({ where: { ownerId, contractId }, include: { room: { select: { roomCode: true, property: { select: { propertyId: true, name: true, province: true, address: true } } } } } });
    if (!contract) throw notFound();
    return contract;
  }

  private assertInvoiceableContract(contract: any) {
    if (contract.status === "draft") throw conflict("Không thể tạo hóa đơn cho hợp đồng draft.");
  }

  private async createDraftForPeriod(tx: Tx, ownerId: bigint, contract: any, periodStart: Date, periodEnd: Date) {
    const meterRepository = new PrismaMeterContinuityRepository(tx);
    const [electricityOpening, waterOpening] = await Promise.all([
      resolveMeterContinuity(meterRepository, { ownerId, contractId: contract.contractId, utilityType: "ELECTRICITY", invoicePeriodStart: periodStart }),
      resolveMeterContinuity(meterRepository, { ownerId, contractId: contract.contractId, utilityType: "WATER", invoicePeriodStart: periodStart }),
    ]);
    const electricityPreviousKwh = electricityOpening.status === "RESOLVED" ? electricityOpening.openingReading : null;
    const waterPreviousM3 = waterOpening.status === "RESOLVED" ? waterOpening.openingReading : null;
    return tx.invoice.create({ data: {
      invoiceNo: invoiceNumber(contract.contractId, periodStart), contractId: contract.contractId, propertyId: contract.propertyId, ownerId,
      periodStart, periodEnd, rentAmount: contract.rentAmount, electricityPreviousKwh, electricityCurrentKwh: null, electricityAmount: 0n,
      waterPreviousM3, waterCurrentM3: null, waterAmount: 0n, serviceAmount: 0n, totalAmount: contract.rentAmount,
      status: "draft", revision: 1, finalizedAt: null, dueDate: null,
    }, include: invoiceInclude });
  }
}
