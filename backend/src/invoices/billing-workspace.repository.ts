import type { Prisma, PrismaClient } from "@prisma/client";
import { billingPeriod, businessDate, formatSqlDate, isOverdue, resolveEffectiveContractEndDate } from "./invoice.billing.js";
import type { InvoiceReadinessInspection, PrismaItemizedInvoicePricing } from "./invoice-itemized.pricing.js";

export type BillingWorkspaceFilters = {
  page: number;
  pageSize: number;
  propertyId?: bigint;
  roomId?: bigint;
  residentId?: bigint;
  invoiceStatus?: "draft" | "unpaid" | "paid";
  periodStart?: Date;
  periodEnd?: Date;
  state?: string;
};

type ReadinessPricing = Pick<PrismaItemizedInvoicePricing, "inspect">;

function nextWorkspacePeriod(contract: { startDate: Date; endDate: Date; terminationDate: Date | null; status: string }, latestInvoice: { periodStart: Date } | null) {
  const end = resolveEffectiveContractEndDate(contract);
  const latestOffset = latestInvoice
    ? (latestInvoice.periodStart.getUTCFullYear() - contract.startDate.getUTCFullYear()) * 12
      + latestInvoice.periodStart.getUTCMonth() - contract.startDate.getUTCMonth()
    : -1;
  for (let offset = Math.max(0, latestOffset + 1); offset < 1_200; offset += 1) {
    const period = billingPeriod(contract.startDate, end, offset);
    if (!period) return null;
    // The first period after the most recent Invoice is the next required period.
    // If it already ended, keep it visible as a draft-guarantee anomaly.
    return period;
  }
  return null;
}

function workspaceState(invoice: any, period: { periodStart: Date; periodEnd: Date }, today: Date, now: Date, readiness?: InvoiceReadinessInspection) {
  if (invoice?.status === "paid") return { code: "PAID", label: "Đã thanh toán" };
  if (invoice?.status === "unpaid") return isOverdue(invoice.status, invoice.dueDate, now)
    ? { code: "OVERDUE", label: "Quá hạn" }
    : { code: "FINALIZED_UNPAID", label: "Đã chốt · chưa thanh toán" };
  if (invoice?.status === "draft") {
    if (readiness?.readyToFinalize) return { code: "READY_TO_FINALIZE", label: "Sẵn sàng chốt" };
    return { code: "MISSING_DATA", label: "Thiếu dữ liệu" };
  }
  if (period.periodEnd < today) return { code: "MISSING_DRAFT", label: "Thiếu bản nháp dự kiến" };
  if (period.periodStart > today) return { code: "UPCOMING", label: "Sắp đến kỳ" };
  if (period.periodEnd.valueOf() === today.valueOf()) return { code: "REMINDER_DUE", label: "Đã đến cuối kỳ · cần chốt dữ liệu" };
  return { code: "IN_PROGRESS", label: "Kỳ đang diễn ra" };
}

export class PrismaBillingWorkspaceRepository {
  constructor(private readonly prisma: PrismaClient, private readonly pricing: ReadinessPricing) {}

  async list(ownerId: bigint, filters: BillingWorkspaceFilters, now = new Date()) {
    const today = businessDate(now);
    const contractWhere: Prisma.ContractWhereInput = {
      ownerId,
      status: { in: ["active", "expired", "terminated"] },
      ...(filters.propertyId === undefined ? {} : { propertyId: filters.propertyId }),
      ...(filters.roomId === undefined ? {} : { roomId: filters.roomId }),
      ...(filters.residentId === undefined ? {} : { OR: [
        { representativeResidentId: filters.residentId },
        { roomResidents: { some: { ownerId, residentId: filters.residentId } } },
      ] }),
    };
    const [contracts, totalContracts] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where: contractWhere,
        orderBy: [{ room: { property: { name: "asc" } } }, { room: { roomCode: "asc" } }, { contractId: "asc" }],
        // Readiness is derived by resolvers and cannot be pushed into a Prisma
        // status predicate. For those filters, inspect the Owner-scoped candidate
        // set, then paginate the filtered rows so page counts remain truthful.
        ...((filters.state || filters.invoiceStatus) ? {} : {
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        select: {
          contractId: true, contractNo: true, ownerId: true, propertyId: true, roomId: true, representativeResidentId: true,
          startDate: true, endDate: true, terminationDate: true, status: true, rentAmount: true,
          initialElectricKwh: true, initialWaterM3: true,
          room: { select: { roomCode: true, property: { select: { propertyId: true, name: true, province: true, address: true } } } },
          representativeResident: { select: { residentId: true, fullName: true } },
          invoices: { orderBy: [{ periodStart: "desc" }, { invoiceId: "desc" }], take: 1,
            select: { invoiceId: true, invoiceNo: true, contractId: true, propertyId: true, ownerId: true,
              periodStart: true, periodEnd: true, dueDate: true, finalizedAt: true, rentAmount: true,
              electricityCurrentKwh: true, waterCurrentM3: true, totalAmount: true, status: true, revision: true,
            } },
        },
      }),
      this.prisma.contract.count({ where: contractWhere }),
    ]);
    const contractIds = contracts.map((contract) => contract.contractId);
    const drafts = contractIds.length ? await this.prisma.invoice.findMany({
      where: { ownerId, contractId: { in: contractIds }, status: "draft" },
      orderBy: [{ periodStart: "asc" }, { invoiceId: "asc" }],
      select: { invoiceId: true, invoiceNo: true, contractId: true, propertyId: true, ownerId: true,
        periodStart: true, periodEnd: true, dueDate: true, finalizedAt: true, rentAmount: true,
        electricityPreviousKwh: true, electricityCurrentKwh: true, waterPreviousM3: true, waterCurrentM3: true,
        electricityAmount: true, waterAmount: true, serviceAmount: true, totalAmount: true, status: true, revision: true,
      },
    }) : [];
    const firstDraftByContract = new Map<bigint, typeof drafts[number]>();
    for (const draft of drafts) if (!firstDraftByContract.has(draft.contractId)) firstDraftByContract.set(draft.contractId, draft);

    const draftEntries = contracts.flatMap((contract) => {
      const draft = firstDraftByContract.get(contract.contractId);
      if (!draft) return [];
      return [{ contract, invoice: draft, period: { periodStart: draft.periodStart, periodEnd: draft.periodEnd } }];
    });
    const inspections = await this.prisma.$transaction(async (tx) => Promise.all(draftEntries.map(({ contract, invoice }) =>
      this.pricing.inspect(invoice, contract, tx))));
    const inspectionByInvoice = new Map(draftEntries.map((entry, index) => [entry.invoice.invoiceId, inspections[index]]));

    const rawRows = contracts.flatMap((contract) => {
      const draft = firstDraftByContract.get(contract.contractId);
      const latest = contract.invoices[0] ?? null;
      const nextPeriod = nextWorkspacePeriod(contract, latest);
      // Prefer the ended period's missing-draft anomaly. Otherwise retain the
      // latest finalized Invoice as the Contract's visible state until a later
      // period is due; a draft always takes precedence.
      const activePeriod = draft
        ? { periodStart: draft.periodStart, periodEnd: draft.periodEnd }
        : nextPeriod && nextPeriod.periodEnd < today
          ? nextPeriod
          : latest
            ? { periodStart: latest.periodStart, periodEnd: latest.periodEnd }
            : nextPeriod;
      if (!activePeriod) return [];
      if ((filters.periodStart && activePeriod.periodStart < filters.periodStart)
        || (filters.periodEnd && activePeriod.periodEnd > filters.periodEnd)) return [];
      const invoice = draft ?? (latest && latest.periodStart.valueOf() === activePeriod.periodStart.valueOf()
        && latest.periodEnd.valueOf() === activePeriod.periodEnd.valueOf() ? latest : null);
      const readiness = invoice?.status === "draft" ? inspectionByInvoice.get(invoice.invoiceId) : undefined;
      const state = workspaceState(invoice, activePeriod, today, now, readiness);
      if (filters.state && filters.state !== state.code) return [];
      return [{
        contract_no: contract.contractNo,
        contract_id: contract.contractId.toString(),
        property: { property_id: contract.room.property.propertyId.toString(), name: contract.room.property.name,
          province: contract.room.property.province, address: contract.room.property.address },
        room: { room_code: contract.room.roomCode },
        resident: { resident_id: contract.representativeResident.residentId.toString(), full_name: contract.representativeResident.fullName },
        period: { period_start: formatSqlDate(activePeriod.periodStart), period_end: formatSqlDate(activePeriod.periodEnd) },
        state,
        reminder: activePeriod.periodEnd <= today ? "PERIOD_END_REACHED" : "NOT_DUE",
        _reminderMatch: `Mã kỳ: ${ownerId}:${contract.contractId}:${formatSqlDate(activePeriod.periodStart)}:${formatSqlDate(activePeriod.periodEnd)}`,
        draft_expected: activePeriod.periodEnd < today,
        invoice: invoice ? {
          invoice_id: invoice.invoiceId.toString(), invoice_no: invoice.invoiceNo,
          status: invoice.status, due_date: invoice.dueDate ? formatSqlDate(invoice.dueDate) : null,
          is_overdue: invoice.status === "unpaid" && isOverdue(invoice.status, invoice.dueDate, now),
          total_amount: invoice.totalAmount.toString(), amount_provisional: invoice.status === "draft",
        } : null,
        missing_or_invalid: readiness?.missingOrInvalid ?? [],
      }];
    });
    const reminderKeys = rawRows.filter((row) => row.reminder === "PERIOD_END_REACHED").map((row) => row._reminderMatch);
    const reminders = reminderKeys.length ? await this.prisma.notification.findMany({
      where: {
        notificationType: "billing_period_closeout", title: "Chốt dữ liệu kỳ hóa đơn",
        account: { ownerId },
        OR: reminderKeys.map((key) => ({ body: { contains: key } })),
      },
      select: { body: true },
    }) : [];
    const persistedReminderKeys = new Set(reminders.map((item) => reminderKeys.find((key) => item.body.includes(key))).filter((key): key is string => Boolean(key)));
    const filteredRows = rawRows
      .filter((row) => !filters.invoiceStatus || row.invoice?.status === filters.invoiceStatus)
      .filter((row) => !filters.state || row.state.code === filters.state)
      .map(({ _reminderMatch, reminder, ...row }) => ({
        ...row,
        reminder: { due: reminder === "PERIOD_END_REACHED", recorded: persistedReminderKeys.has(_reminderMatch) },
      }));
    const totalItems = filters.state || filters.invoiceStatus ? filteredRows.length : totalContracts;
    const rows = filters.state || filters.invoiceStatus
      ? filteredRows.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize)
      : filteredRows;

    const stateCounts = rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.state.code] = (counts[row.state.code] ?? 0) + 1;
      return counts;
    }, {});
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      ownerId,
      ...(filters.propertyId === undefined ? {} : { propertyId: filters.propertyId }),
      ...(filters.roomId === undefined && filters.residentId === undefined ? {} : { contract: { AND: [
        ...(filters.roomId === undefined ? [] : [{ roomId: filters.roomId }]),
        ...(filters.residentId === undefined ? [] : [{ OR: [
          { representativeResidentId: filters.residentId }, { roomResidents: { some: { ownerId, residentId: filters.residentId } } },
        ] }]),
      ] } }),
      ...(filters.periodStart === undefined ? {} : { periodStart: { gte: filters.periodStart } }),
      ...(filters.periodEnd === undefined ? {} : { periodEnd: { lte: filters.periodEnd } }),
      ...(filters.invoiceStatus === undefined ? {} : { status: filters.invoiceStatus }),
    };
    const [unpaidCount, paidCount, overdueCount, finalizedUnpaid] = await Promise.all([
      this.prisma.invoice.count({ where: { ...invoiceWhere, status: "unpaid" } }),
      this.prisma.invoice.count({ where: { ...invoiceWhere, status: "paid" } }),
      this.prisma.invoice.count({ where: { ...invoiceWhere, status: "unpaid", dueDate: { lt: today } } }),
      this.prisma.invoice.findMany({ where: { ...invoiceWhere, status: "unpaid" }, orderBy: [{ dueDate: "asc" }, { invoiceId: "asc" }], take: 10,
        select: { invoiceId: true, invoiceNo: true, periodStart: true, periodEnd: true, dueDate: true, status: true,
          contract: { select: { contractNo: true, room: { select: { roomCode: true, property: { select: { name: true } } } }, representativeResident: { select: { fullName: true } } } },
        },
      }),
    ]);
    const unpaidOverview = finalizedUnpaid.map((invoice) => ({
      invoice_id: invoice.invoiceId.toString(), invoice_no: invoice.invoiceNo,
      property_name: invoice.contract.room.property.name, room_code: invoice.contract.room.roomCode,
      resident_name: invoice.contract.representativeResident.fullName,
      period_start: formatSqlDate(invoice.periodStart), period_end: formatSqlDate(invoice.periodEnd),
      due_date: invoice.dueDate ? formatSqlDate(invoice.dueDate) : null,
      is_overdue: isOverdue(invoice.status, invoice.dueDate, now),
    }));
    return {
      data: rows,
      meta: { page: filters.page, page_size: filters.pageSize, total_items: totalItems, total_pages: Math.ceil(totalItems / filters.pageSize) },
      summary: {
        contracts_on_page: rows.length,
        needs_attention_on_page: rows.filter((row) => ["REMINDER_DUE", "MISSING_DRAFT", "MISSING_DATA"].includes(row.state.code)).length,
        drafts_on_page: rows.filter((row) => row.invoice?.status === "draft").length,
        finalized_on_page: rows.filter((row) => row.invoice?.status === "unpaid" || row.invoice?.status === "paid").length,
        missing_data_on_page: stateCounts.MISSING_DATA ?? 0,
        ready_to_finalize_on_page: stateCounts.READY_TO_FINALIZE ?? 0,
        finalized_unpaid: unpaidCount, paid: paidCount, overdue: overdueCount,
        unpaid_preview: unpaidOverview,
      },
    };
  }
}
