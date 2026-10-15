import type { PrismaClient } from "@prisma/client";
import type { BillingScheduleStore, ScheduledContract } from "./billing-scheduler.js";
import { periodMatchesAnchor, resolveEffectiveContractEndDate, type BillingPeriod } from "./invoice.billing.js";
import type { PrismaInvoiceRepository } from "./invoice.repository.js";

const REMINDER_TYPE = "billing_period_closeout";
const REMINDER_TITLE = "Chốt dữ liệu kỳ hóa đơn";
const reminderBody = (ownerId: bigint, contractId: bigint, period: BillingPeriod) =>
  `Đã đến cuối kỳ hóa đơn. Vui lòng chốt chỉ số điện, nước và dữ liệu dịch vụ.\nMã kỳ: ${ownerId.toString()}:${contractId.toString()}:${period.periodStart.toISOString().slice(0, 10)}:${period.periodEnd.toISOString().slice(0, 10)}`;

export class PrismaBillingScheduleStore implements BillingScheduleStore {
  constructor(private readonly prisma: PrismaClient, private readonly invoices: PrismaInvoiceRepository) {}

  async listEligibleContracts(): Promise<ScheduledContract[]> {
    const rows = await this.prisma.contract.findMany({
      where: { status: { in: ["active", "expired", "terminated"] } },
      orderBy: [{ ownerId: "asc" }, { contractId: "asc" }],
      select: { ownerId: true, contractId: true, startDate: true, endDate: true, terminationDate: true, status: true },
    });
    return rows;
  }

  async ensurePeriodEndReminder(contract: ScheduledContract, period: BillingPeriod, today: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.contract.findFirst({
        where: { ownerId: contract.ownerId, contractId: contract.contractId },
        select: { ownerId: true, contractId: true, startDate: true, endDate: true, terminationDate: true, status: true },
      });
      if (!current || !(["active", "expired", "terminated"] as string[]).includes(current.status) || period.periodEnd > today
        || !periodMatchesAnchor(current.startDate, resolveEffectiveContractEndDate(current), period.periodStart, period.periodEnd)) return false;

      const account = await tx.account.findFirst({ where: { ownerId: contract.ownerId, role: "admin", status: "active" }, select: { accountId: true } });
      if (!account) throw new Error("BILLING_REMINDER_ADMIN_UNAVAILABLE");

      const body = reminderBody(contract.ownerId, contract.contractId, period);
      const key = `${contract.ownerId}:${contract.contractId}:${period.periodStart.toISOString().slice(0, 10)}:${period.periodEnd.toISOString().slice(0, 10)}`;
      // Transaction-scoped PostgreSQL advisory lock serializes duplicate scheduler
      // workers across processes; the persisted notification is the restart-safe key.
      await tx.$queryRaw`SELECT 1::int AS lock_acquired FROM (SELECT pg_advisory_xact_lock(hashtext('goctro.billing.period-end-reminder'), hashtext(${key}))) AS reminder_lock`;
      const existingReminder = await tx.notification.findFirst({
        where: { notificationType: REMINDER_TYPE, title: REMINDER_TITLE, body },
        select: { notificationId: true },
      });
      if (existingReminder) return false;
      await tx.notification.create({ data: { accountId: account.accountId, notificationType: REMINDER_TYPE, title: REMINDER_TITLE, body } });
      return true;
    });
  }

  async ensurePeriodDraft(contract: ScheduledContract, period: BillingPeriod, today: Date) {
    const result = await this.invoices.ensureDraftForPeriod(contract.ownerId, contract.contractId, period, today);
    return result.created;
  }
}
