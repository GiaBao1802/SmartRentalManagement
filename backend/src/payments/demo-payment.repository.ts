import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { conflict } from "../middleware/api-error.js";

export class DemoPaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private invoiceScope(ownerId: bigint, residentId: bigint) {
    return {
      ownerId,
      OR: [
        { contract: { representativeResidentId: residentId } },
        { contract: { roomResidents: { some: { residentId, status: "active", endedAt: null } } } },
      ],
    };
  }

  async list(ownerId: bigint, residentId: bigint, invoiceId: bigint) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceId, ...this.invoiceScope(ownerId, residentId) },
      select: { invoiceId: true },
    });
    if (!invoice) return null;
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { invoiceId, provider: "demo" },
      orderBy: [{ createdAt: "desc" }, { paymentTransactionId: "desc" }],
      select: { paymentTransactionId: true, providerTransactionId: true, amount: true, status: true, errorCode: true, errorMessage: true, createdAt: true, processedAt: true },
    });
    return rows.map((row) => ({
      transaction_id: row.paymentTransactionId.toString(),
      transaction_code: row.providerTransactionId ?? "",
      amount: row.amount.toString(),
      outcome: row.status,
      failure_reason: row.errorMessage,
      created_at: row.createdAt.toISOString(),
      processed_at: row.processedAt?.toISOString() ?? null,
    }));
  }

  async simulate(ownerId: bigint, residentId: bigint, invoiceId: bigint, outcome: "success" | "failed") {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { invoiceId, ...this.invoiceScope(ownerId, residentId) },
        select: { invoiceId: true, totalAmount: true, status: true, finalizedAt: true, invoiceNo: true },
      });
      if (!invoice) return null;
      if (invoice.status !== "unpaid" || !invoice.finalizedAt) return { notPayable: true as const };

      const now = new Date();
      const sessionId = randomUUID();
      const transactionCode = `DEMO-${now.getTime()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const failureReason = outcome === "failed" ? "Tài khoản không đủ số dư (mô phỏng)." : null;
      const transaction = await tx.paymentTransaction.create({
        data: {
          invoiceId,
          paymentSessionId: sessionId,
          provider: "demo",
          providerTransactionId: transactionCode,
          providerReference: `DEMO_ONLY:${invoice.invoiceNo}`,
          amount: invoice.totalAmount,
          currency: "VND",
          status: outcome,
          errorCode: failureReason ? "DEMO_INSUFFICIENT_FUNDS" : null,
          errorMessage: failureReason,
          createdAt: now,
          processedAt: now,
        },
      });

      if (outcome === "success") {
        const updated = await tx.invoice.updateMany({ where: { invoiceId, ownerId, status: "unpaid", finalizedAt: { not: null } }, data: { status: "paid", updatedAt: now } });
        if (updated.count !== 1) throw conflict("Hóa đơn vừa thay đổi trạng thái. Hãy tải lại trước khi thử lại.");
        const admins = await tx.account.findMany({ where: { ownerId, role: "admin", status: "active" }, select: { accountId: true } });
        if (admins.length) await tx.notification.createMany({ data: admins.map(({ accountId }) => ({
          accountId,
          notificationType: "invoice_demo_payment",
          title: "Hóa đơn được thanh toán (demo)",
          body: `${invoice.invoiceNo} đã được đánh dấu Đã thanh toán trong bản mô phỏng. Mã giao dịch: ${transactionCode}. Không có tiền thật được chuyển.`,
          createdAt: now,
        })) });
      }

      return {
        notPayable: false as const,
        transaction: {
          transaction_id: transaction.paymentTransactionId.toString(),
          transaction_code: transactionCode,
          amount: transaction.amount.toString(),
          outcome: transaction.status,
          failure_reason: transaction.errorMessage,
          created_at: transaction.createdAt.toISOString(),
          processed_at: transaction.processedAt?.toISOString() ?? null,
          invoice_status: outcome === "success" ? "paid" : "unpaid",
          demo: true as const,
        },
      };
    }, { isolationLevel: "Serializable" });
  }
}

export class ResidentFeedbackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(ownerId: bigint, residentId: bigint, accountId: bigint, category: string, content: string) {
    return this.prisma.$transaction(async (tx) => {
      const occupancy = await tx.roomResident.findFirst({
        where: { ownerId, residentId, status: "active", endedAt: null },
        orderBy: [{ startedAt: "desc" }, { occupancyId: "desc" }],
        select: { propertyId: true, roomId: true },
      });
      if (!occupancy) return null;
      const complaint = await tx.complaint.create({
        data: { residentId, propertyId: occupancy.propertyId, ownerId, roomId: occupancy.roomId, category, content, status: "pending" },
      });
      await tx.complaintHistory.create({ data: { complaintId: complaint.complaintId, actorAccountId: accountId, action: "created", toStatus: "pending", note: "Resident gửi phản hồi." } });
      const admins = await tx.account.findMany({ where: { ownerId, role: "admin", status: "active" }, select: { accountId: true } });
      if (admins.length) await tx.notification.createMany({ data: admins.map(({ accountId: adminId }) => ({
        accountId: adminId,
        notificationType: "resident_feedback",
        title: "Cư dân vừa gửi phản hồi",
        body: `${category}: ${content.slice(0, 500)}`,
      })) });
      return { feedback_id: complaint.complaintId.toString(), status: complaint.status, created_at: complaint.createdAt.toISOString() };
    }, { isolationLevel: "Serializable" });
  }
}
