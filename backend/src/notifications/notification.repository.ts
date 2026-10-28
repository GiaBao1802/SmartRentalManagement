import type { PrismaClient } from "@prisma/client";
import { conflict } from "../middleware/api-error.js";

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

  async sendRoomReminder(ownerId: bigint, propertyId: bigint, roomId: bigint, message: string) {
    return this.prisma.$transaction(async (tx) => {
      const rooms = await tx.$queryRaw<Array<{ room_id: bigint; room_code: string; property_name: string }>>`
        SELECT r.room_id, r.room_code, p.name AS property_name
        FROM rooms r
        JOIN properties p ON p.property_id = r.property_id AND p.owner_id = r.owner_id
        WHERE r.room_id = ${roomId} AND r.property_id = ${propertyId} AND r.owner_id = ${ownerId}
          AND r.is_active = true AND r.status <> 'inactive' AND p.status = 'active'
        FOR SHARE OF r
      `;
      const room = rooms[0];
      if (!room) return null;

      const recipients = await tx.$queryRaw<Array<{ account_id: bigint }>>`
        SELECT DISTINCT a.account_id
        FROM room_residents rr
        JOIN residents resident ON resident.resident_id = rr.resident_id AND resident.owner_id = rr.owner_id
        JOIN accounts a ON a.resident_id = resident.resident_id AND a.role = 'resident' AND a.status = 'active'
        WHERE rr.room_id = ${roomId} AND rr.property_id = ${propertyId} AND rr.owner_id = ${ownerId}
          AND rr.status = 'active'
          AND rr.started_at <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
          AND (rr.ended_at IS NULL OR rr.ended_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
          AND resident.residence_status = 'living' AND resident.archived_at IS NULL
      `;
      if (!recipients.length) throw conflict("Phòng này chưa có tài khoản cư dân đang ở để nhận thông báo.");

      await tx.notification.createMany({
        data: recipients.map(({ account_id }) => ({
          accountId: account_id,
          notificationType: "owner_room_reminder",
          title: `Thông báo từ chủ trọ · Phòng ${room.room_code}`,
          body: message,
        })),
      });
      return { roomCode: room.room_code, propertyName: room.property_name, recipientCount: recipients.length };
    }, { timeout: 15000 });
  }

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
