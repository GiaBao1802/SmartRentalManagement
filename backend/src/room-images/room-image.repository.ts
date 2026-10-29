import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";
import { publicAvailableRoomWhere } from "../properties/room-status.js";

export type RoomImageRow = { roomImageId: bigint; roomId: bigint; storageKey: string; isCover: boolean; sortOrder: number; createdAt: Date };
export type RoomImageDtoRow = Omit<RoomImageRow, "storageKey" | "roomId">;
const ordered = [{ sortOrder: "asc" as const }, { roomImageId: "asc" as const }];

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    if (error.code === "P2010" && typeof error.meta?.code === "string" && error.meta.code === "40001") return true;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError && /\b40001\b|serialization failure/i.test(error.message)) return true;
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "40001");
}

export class PrismaRoomImageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(ownerId: bigint, propertyId: bigint, roomId: bigint): Promise<RoomImageDtoRow[] | null> {
    const room = await this.prisma.room.findFirst({ where: { roomId, propertyId, ownerId }, select: { roomId: true } });
    if (!room) return null;
    return this.prisma.roomImage.findMany({ where: { roomId }, orderBy: ordered, select: this.dtoSelect() });
  }

  async roomExists(ownerId: bigint, propertyId: bigint, roomId: bigint): Promise<boolean> {
    return Boolean(await this.prisma.room.findFirst({ where: { roomId, propertyId, ownerId }, select: { roomId: true } }));
  }

  async validateBulkRooms(ownerId: bigint, propertyId: bigint, roomIds: bigint[]): Promise<"missing" | "not_empty" | null> {
    const rooms = await this.prisma.room.findMany({ where: { ownerId, propertyId, roomId: { in: roomIds } }, select: { roomId: true, _count: { select: { images: true } } } });
    if (rooms.length !== roomIds.length) return "missing";
    if (rooms.some((room) => room._count.images > 0)) return "not_empty";
    return null;
  }

  async add(ownerId: bigint, propertyId: bigint, roomId: bigint, storageKey: string): Promise<RoomImageDtoRow | "missing" | "limit"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rooms = await tx.$queryRaw<Array<{ room_id: bigint }>>`SELECT room_id FROM rooms WHERE owner_id = ${ownerId} AND property_id = ${propertyId} AND room_id = ${roomId} FOR UPDATE`;
        if (!rooms.length) return "missing";
        const count = await tx.roomImage.count({ where: { roomId } });
        if (count >= 5) return "limit";
        return tx.roomImage.create({ data: { roomId, storageKey, isCover: count === 0, sortOrder: count + 1 }, select: this.dtoSelect() });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) { if (isSerializationFailure(error)) throw this.retryConflict(); throw error; }
  }

  async reorder(ownerId: bigint, propertyId: bigint, roomId: bigint, imageIds: bigint[]): Promise<RoomImageDtoRow[] | "missing" | "invalid"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rooms = await tx.$queryRaw<Array<{ room_id: bigint }>>`SELECT room_id FROM rooms WHERE owner_id = ${ownerId} AND property_id = ${propertyId} AND room_id = ${roomId} FOR UPDATE`;
        if (!rooms.length) return "missing";
        const existing = await tx.roomImage.findMany({ where: { roomId }, orderBy: ordered, select: { roomImageId: true } });
        if (existing.length !== imageIds.length || new Set(imageIds.map(String)).size !== imageIds.length || existing.some((row) => !imageIds.some((id) => id === row.roomImageId))) return "invalid";
        for (let i = 0; i < imageIds.length; i++) await tx.roomImage.update({ where: { roomImageId: imageIds[i]! }, data: { sortOrder: i + 1 } });
        return tx.roomImage.findMany({ where: { roomId }, orderBy: ordered, select: this.dtoSelect() });
      });
    } catch (error) { if (isSerializationFailure(error)) throw this.retryConflict(); throw error; }
  }

  async setCover(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint): Promise<RoomImageDtoRow | "missing"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rooms = await tx.$queryRaw<Array<{ room_id: bigint }>>`SELECT room_id FROM rooms WHERE owner_id = ${ownerId} AND property_id = ${propertyId} AND room_id = ${roomId} FOR UPDATE`;
        if (!rooms.length) return "missing";
        const image = await tx.roomImage.findFirst({ where: { roomId, roomImageId: imageId }, select: { roomImageId: true, isCover: true } });
        if (!image) return "missing";
        if (!image.isCover) {
          await tx.roomImage.updateMany({ where: { roomId, isCover: true }, data: { isCover: false } });
          await tx.roomImage.update({ where: { roomImageId: imageId }, data: { isCover: true } });
        }
        return tx.roomImage.findUniqueOrThrow({ where: { roomImageId: imageId }, select: this.dtoSelect() });
      });
    } catch (error) { if (isSerializationFailure(error)) throw this.retryConflict(); throw error; }
  }

  async remove(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint): Promise<{ deletedId: bigint; promotedId: bigint | null; cleanupKey: string | null } | "missing"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.roomImage.findFirst({ where: { roomId, roomImageId: imageId, room: { ownerId, propertyId } }, select: { roomImageId: true, storageKey: true, isCover: true } });
        if (!target) return "missing";
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${target.storageKey}, 0)) IS NULL AS locked`;
        const rooms = await tx.$queryRaw<Array<{ room_id: bigint }>>`SELECT room_id FROM rooms WHERE owner_id = ${ownerId} AND property_id = ${propertyId} AND room_id = ${roomId} FOR UPDATE`;
        if (!rooms.length) return "missing";
        await tx.roomImage.delete({ where: { roomImageId: imageId } });
        let promotedId: bigint | null = null;
        const remaining = await tx.roomImage.findMany({ where: { roomId }, orderBy: ordered, select: { roomImageId: true } });
        for (let index = 0; index < remaining.length; index++) {
          const item = remaining[index]!;
          await tx.roomImage.update({ where: { roomImageId: item.roomImageId }, data: { sortOrder: index + 1 } });
        }
        if (target.isCover && remaining[0]) {
          await tx.roomImage.update({ where: { roomImageId: remaining[0].roomImageId }, data: { isCover: true } });
          promotedId = remaining[0].roomImageId;
        }
        const refs = await tx.roomImage.count({ where: { storageKey: target.storageKey } });
        return { deletedId: imageId, promotedId, cleanupKey: refs === 0 ? target.storageKey : null };
      });
    } catch (error) { if (isSerializationFailure(error)) throw this.retryConflict(); throw error; }
  }

  async attachShared(ownerId: bigint, propertyId: bigint, roomIds: bigint[], storageKey: string, expectedCount: number): Promise<number | "missing" | "not_empty" | "limit"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${storageKey}, 0)) IS NULL AS locked`;
        const locked = await tx.$queryRaw<Array<{ room_id: bigint }>>`SELECT room_id FROM rooms WHERE owner_id = ${ownerId} AND property_id = ${propertyId} AND room_id = ANY(${roomIds}::bigint[]) ORDER BY room_id ASC FOR UPDATE`;
        if (locked.length !== roomIds.length) return "missing";
        const counts = await Promise.all(roomIds.map(async (roomId) => ({ roomId, count: await tx.roomImage.count({ where: { roomId } }) })));
        if (new Set(counts.map((item) => item.count)).size > 1 || counts.some((item) => item.count !== expectedCount)) return "not_empty";
        const currentCount = counts[0]?.count ?? 0;
        if (currentCount >= 5) return "limit";
        await tx.roomImage.createMany({ data: roomIds.map((roomId) => ({ roomId, storageKey, isCover: currentCount === 0, sortOrder: currentCount + 1 })) });
        return roomIds.length;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) { if (isSerializationFailure(error)) throw this.retryConflict(); throw error; }
  }

  async publicImage(imageId: bigint): Promise<{ storageKey: string } | null> {
    return this.prisma.roomImage.findFirst({ where: {
      roomImageId: imageId,
      room: publicAvailableRoomWhere(),
    }, select: { storageKey: true } });
  }

  async adminImage(ownerId: bigint, propertyId: bigint, roomId: bigint, imageId: bigint): Promise<{ storageKey: string } | null> {
    return this.prisma.roomImage.findFirst({ where: { roomImageId: imageId, roomId, room: { propertyId, ownerId } }, select: { storageKey: true } });
  }

  async residentImage(ownerId: bigint, residentId: bigint, imageId: bigint): Promise<{ storageKey: string } | null> {
    return this.prisma.roomImage.findFirst({
      where: { roomImageId: imageId, room: { roomResidents: { some: { ownerId, residentId } } } },
      select: { storageKey: true },
    });
  }

  private dtoSelect() { return { roomImageId: true, isCover: true, sortOrder: true, createdAt: true } satisfies Prisma.RoomImageSelect; }
  private retryConflict() { return new ApiError(409, "ROOM_IMAGE_RETRY_REQUIRED", "Thư viện ảnh vừa được cập nhật đồng thời. Vui lòng thử lại.", { retryable: true }); }
}
