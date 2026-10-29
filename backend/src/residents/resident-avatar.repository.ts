import type { PrismaClient } from "@prisma/client";

export class PrismaResidentAvatarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(ownerId: bigint, residentId: bigint) {
    const row = await this.prisma.resident.findFirst({ where: { ownerId, residentId, archivedAt: null }, select: { avatarStorageKey: true } });
    return row?.avatarStorageKey ?? null;
  }

  async replace(ownerId: bigint, residentId: bigint, storageKey: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.resident.findFirst({ where: { ownerId, residentId, archivedAt: null }, select: { avatarStorageKey: true } });
      if (!row) return null;
      await tx.resident.update({ where: { residentId_ownerId: { ownerId, residentId } }, data: { avatarStorageKey: storageKey, updatedAt: new Date() } });
      return { previousKey: row.avatarStorageKey };
    });
  }
}
