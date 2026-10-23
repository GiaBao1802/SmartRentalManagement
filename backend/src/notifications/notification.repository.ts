import type { PrismaClient } from "@prisma/client";

export type NotificationListFilter = {
  page: number;
  pageSize: number;
  unread?: boolean;
  type?: string;
};

export type NotificationPreferencesPatch = Partial<{
  newInvoice: boolean;
  overdueInvoice: boolean;
  expiringContract: boolean;
  complaintUpdates: boolean;
}>;

const defaultPreferences = {
  newInvoice: true,
  overdueInvoice: true,
  expiringContract: true,
  complaintUpdates: true,
};

export class PrismaNotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(accountId: bigint, filter: NotificationListFilter) {
    const where = {
      accountId,
      ...(filter.unread === true ? { readAt: null } : {}),
      ...(filter.unread === false ? { readAt: { not: null } } : {}),
      ...(filter.type ? { notificationType: filter.type } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { notificationId: "desc" }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { rows, total };
  }

  async markRead(accountId: bigint, notificationId: bigint) {
    const existing = await this.prisma.notification.findFirst({ where: { accountId, notificationId } });
    if (!existing) return null;
    if (!existing.readAt) {
      await this.prisma.notification.updateMany({
        where: { accountId, notificationId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return this.prisma.notification.findFirst({ where: { accountId, notificationId } });
  }

  async markAllRead(accountId: bigint) {
    const readAt = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { accountId, readAt: null },
      data: { readAt },
    });
    return { updatedCount: result.count, readAt };
  }

  async getPreferences(accountId: bigint) {
    const row = await this.prisma.notificationPreference.findUnique({ where: { accountId } });
    return row ?? { accountId, ...defaultPreferences, updatedAt: null };
  }

  updatePreferences(accountId: bigint, patch: NotificationPreferencesPatch) {
    const updatedAt = new Date();
    return this.prisma.notificationPreference.upsert({
      where: { accountId },
      create: { accountId, ...defaultPreferences, ...patch, updatedAt },
      update: { ...patch, updatedAt },
    });
  }
}
