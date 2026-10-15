import { Prisma, type PrismaClient } from "@prisma/client";
import type { PropertyRoomRepository } from "./property-room.routes.js";
import type { PageQuery } from "./property-room.validation.js";
import { conflict } from "../middleware/api-error.js";
import { activeOccupancyWhere, currentContractWhere, utcStartOfToday } from "./room-status.js";

type PropertyQuery = PageQuery & { status?: string; province?: string; search?: string };
type RoomQuery = PageQuery & { status?: string; is_active?: boolean; is_public?: boolean; search?: string };

export class PrismaPropertyRoomRepository implements PropertyRoomRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listProperties(ownerId: bigint, query: PropertyQuery) {
    const where: Prisma.PropertyWhereInput = {
      ownerId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.province ? { province: { contains: query.province, mode: "insensitive" } } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { address: { contains: query.search, mode: "insensitive" } },
        { propertyCode: { contains: query.search, mode: "insensitive" } },
      ] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({ where, orderBy: [{ name: "asc" }, { propertyId: "asc" }], skip: (query.page - 1) * query.page_size, take: query.page_size }),
      this.prisma.property.count({ where }),
    ]);
    return { rows, total };
  }

  createProperty(ownerId: bigint, data: Omit<Prisma.PropertyUncheckedCreateInput, "ownerId">) {
    return this.prisma.property.create({ data: { ...data, ownerId } });
  }

  findProperty(ownerId: bigint, propertyId: bigint) {
    return this.prisma.property.findFirst({ where: { ownerId, propertyId } });
  }

  updateProperty(ownerId: bigint, propertyId: bigint, data: Prisma.PropertyUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true, rooms: { select: { contracts: { where: { status: "active" }, select: { contractId: true }, take: 1 }, roomResidents: { where: { status: "active" }, select: { occupancyId: true }, take: 1 } } } } });
      if (!property) return null;
      if (data.status === "archived" && property.rooms.some((room) => room.contracts.length || room.roomResidents.length)) return "conflict" as const;
      return tx.property.update({ where: { propertyId_ownerId: { propertyId, ownerId } }, data });
    });
  }

  archiveProperty(ownerId: bigint, propertyId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findFirst({
        where: { propertyId, ownerId },
        select: {
          propertyId: true,
          rooms: { select: {
            contracts: { where: { status: "active" }, select: { contractId: true }, take: 1 },
            roomResidents: { where: { status: "active" }, select: { occupancyId: true }, take: 1 },
          } },
        },
      });
      if (!property) return "missing" as const;
      if (property.rooms.some((room) => room.contracts.length > 0 || room.roomResidents.length > 0)) return "conflict" as const;
      return tx.property.update({ where: { propertyId_ownerId: { propertyId, ownerId } }, data: { status: "archived" } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listRooms(ownerId: bigint, propertyId: bigint, query: RoomQuery) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } });
    if (!property) return null;
    const today = utcStartOfToday();
    const hasCurrentContract: Prisma.RoomWhereInput = { contracts: { some: currentContractWhere(today) } };
    const hasActiveOccupancy: Prisma.RoomWhereInput = { roomResidents: { some: activeOccupancyWhere() } };
    const where: Prisma.RoomWhereInput = {
      ownerId, propertyId,
      ...(query.search ? { roomCode: { contains: query.search, mode: "insensitive" } } : {}),
      ...(query.is_active === undefined ? {} : { isActive: query.is_active }),
      ...(query.is_public === undefined ? {} : { isPublic: query.is_public }),
      ...(query.status === "inactive" ? { OR: [{ isActive: false }, { status: "inactive" }] } : query.status === "occupied" ? { isActive: true, status: { not: "inactive" }, OR: [hasCurrentContract, hasActiveOccupancy] } : query.status === "available" ? { isActive: true, status: { not: "inactive" }, NOT: { OR: [hasCurrentContract, hasActiveOccupancy] } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({ where, include: this.roomSummaryInclude(), orderBy: [{ roomCode: "asc" }, { roomId: "asc" }], skip: (query.page - 1) * query.page_size, take: query.page_size }),
      this.prisma.room.count({ where }),
    ]);
    return { rows: rows.map((room) => this.withDerivedStatus(room)), total };
  }

  async createRoom(ownerId: bigint, propertyId: bigint, data: Omit<Prisma.RoomUncheckedCreateInput, "ownerId" | "propertyId" | "roomId">) {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findFirst({ where: { propertyId, ownerId }, select: { status: true } });
      if (!property) return null;
      if (property.status === "archived") throw conflict("Không thể thêm phòng vào khu vực đã lưu trữ.");
      const room = await tx.room.create({ data: { ...data, ownerId, propertyId } });
      return this.withDerivedStatus(await tx.room.findUniqueOrThrow({ where: { roomId: room.roomId }, include: this.roomSummaryInclude() }));
    });
  }

  async findRoom(ownerId: bigint, roomId: bigint) {
    const room = await this.prisma.room.findFirst({ where: { roomId, ownerId }, include: this.roomSummaryInclude() });
    return room ? this.withDerivedStatus(room) : null;
  }

  async updateRoom(ownerId: bigint, roomId: bigint, data: Prisma.RoomUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.room.findFirst({ where: { roomId, ownerId }, include: this.roomSummaryInclude() });
      if (!existing) return null;
      const reactivating = data.isActive === true || data.status === "available";
      if (reactivating && this.hasActiveOperations(existing)) return "conflict" as const;
      if (data.isActive === false || data.status === "inactive") {
        if (this.hasActiveOperations(existing)) throw conflict("Không thể ngừng hoạt động phòng đang có hợp đồng hoặc cư trú hoạt động.");
      }
      const updated = await tx.room.update({ where: { roomId_ownerId: { roomId, ownerId } }, data });
      return this.withDerivedStatus(await tx.room.findUniqueOrThrow({ where: { roomId: updated.roomId }, include: this.roomSummaryInclude() }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deactivateRoom(ownerId: bigint, roomId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.room.findFirst({ where: { roomId, ownerId }, include: this.roomSummaryInclude() });
      if (!existing) return "missing" as const;
      if (this.hasActiveOperations(existing)) return "conflict" as const;
      const updated = await tx.room.update({ where: { roomId_ownerId: { roomId, ownerId } }, data: { status: "inactive", isActive: false } });
      return this.withDerivedStatus(await tx.room.findUniqueOrThrow({ where: { roomId: updated.roomId }, include: this.roomSummaryInclude() }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private roomSummaryInclude() {
    return {
      contracts: { where: { status: "active" }, orderBy: { startDate: "desc" as const }, select: { contractId: true, contractNo: true, startDate: true, endDate: true, status: true, residentCapacity: true } },
      roomResidents: { where: { status: "active" }, select: { occupancyId: true } },
    };
  }

  private hasActiveOperations(room: { contracts: unknown[]; roomResidents: unknown[] }) { return room.contracts.length > 0 || room.roomResidents.length > 0; }
  private withDerivedStatus<T extends { isActive: boolean; status: string; contracts: Array<{ contractId: bigint; contractNo: string; startDate: Date; endDate: Date; status: string; residentCapacity: number }>; roomResidents: Array<{ occupancyId: bigint }> }>(room: T) {
    const today = utcStartOfToday();
    const contract = room.contracts.find((item) => item.startDate <= today && item.endDate >= today) ?? null;
    return {
      ...room,
      status: !room.isActive || room.status === "inactive" ? "inactive" : contract || room.roomResidents.length ? "occupied" : "available",
      currentContract: contract ? { contractId: contract.contractId, contractNo: contract.contractNo, startDate: contract.startDate, endDate: contract.endDate, status: contract.status } : null,
      occupancyCount: room.roomResidents.length,
      contractCapacity: contract?.residentCapacity ?? null,
      contracts: undefined,
      roomResidents: undefined,
    };
  }
}
