import { Prisma, type PrismaClient } from "@prisma/client";
import type { ContactRequestInput, PublicRoomListQuery } from "./public-marketplace.validation.js";
import { publicAvailableRoomWhere } from "../properties/room-status.js";

export type ContactListQuery = { page: number; page_size: number; property_id?: bigint; status?: string; created_at?: Date };
export type ContactRequestRepositoryPort = {
  listPublicRooms(query: PublicRoomListQuery): Promise<{ rows: unknown[]; total: number }>;
  findPublicRoom(roomId: bigint): Promise<unknown | null>;
  createContactRequest(input: ContactRequestInput): Promise<{ contactRequestId: bigint; status: string } | null>;
  listContactRequests(ownerId: bigint, query: ContactListQuery): Promise<{ rows: unknown[]; total: number }>;
  findContactRequest(ownerId: bigint, contactRequestId: bigint): Promise<unknown | null>;
  updateContactRequestStatus(ownerId: bigint, contactRequestId: bigint, status: "new" | "contacted" | "closed"): Promise<unknown | null>;
};

const publicPropertySelect = { name: true, province: true, address: true } satisfies Prisma.PropertySelect;
const publicImageSelect = { roomImageId: true, isCover: true, sortOrder: true } satisfies Prisma.RoomImageSelect;
const adminContactSelect = {
  contactRequestId: true, propertyId: true, roomId: true, requesterName: true, phone: true,
  email: true, message: true, status: true, createdAt: true, updatedAt: true,
  property: { select: { propertyId: true, name: true, province: true, address: true } },
  room: { select: { roomId: true, roomCode: true } },
} satisfies Prisma.ContactRequestSelect;

export class PrismaPublicMarketplaceRepository implements ContactRequestRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async listPublicRooms(query: PublicRoomListQuery) {
    const propertyWhere: Prisma.PropertyWhereInput = {
      status: "active",
      ...(query.province ? { province: { contains: query.province, mode: "insensitive" } } : {}),
      ...(query.address ? { address: { contains: query.address, mode: "insensitive" } } : {}),
    };
    const where: Prisma.RoomWhereInput = {
      ...publicAvailableRoomWhere(),
      property: propertyWhere,
      ...((query.price_min === undefined && query.price_max === undefined) ? {} : { defaultRent: { ...(query.price_min === undefined ? {} : { gte: query.price_min }), ...(query.price_max === undefined ? {} : { lte: query.price_max }) } }),
      ...((query.area_min === undefined && query.area_max === undefined) ? {} : { areaM2: { ...(query.area_min === undefined ? {} : { gte: query.area_min }), ...(query.area_max === undefined ? {} : { lte: query.area_max }) } }),
      ...(query.capacity_min === undefined ? {} : { defaultCapacity: { gte: query.capacity_min } }),
    };
    const orderBy: Prisma.RoomOrderByWithRelationInput[] = query.sort === "price_asc" ? [{ defaultRent: "asc" }, { roomId: "asc" }]
      : query.sort === "price_desc" ? [{ defaultRent: "desc" }, { roomId: "asc" }]
      : query.sort === "area_asc" ? [{ areaM2: "asc" }, { roomId: "asc" }]
      : query.sort === "area_desc" ? [{ areaM2: "desc" }, { roomId: "asc" }]
      : [{ createdAt: "desc" }, { roomId: "asc" }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where, orderBy, skip: (query.page - 1) * query.page_size, take: query.page_size,
        select: {
          roomId: true, roomCode: true, defaultRent: true, areaM2: true, defaultCapacity: true, publicDescription: true, createdAt: true,
          property: { select: publicPropertySelect },
          images: { where: { isCover: true }, orderBy: [{ sortOrder: "asc" }, { roomImageId: "asc" }], take: 1, select: publicImageSelect },
        },
      }),
      this.prisma.room.count({ where }),
    ]);
    return { rows, total };
  }

  findPublicRoom(roomId: bigint) {
    return this.prisma.room.findFirst({
      where: { roomId, ...publicAvailableRoomWhere() },
      select: {
        roomId: true, roomCode: true, defaultRent: true, areaM2: true, defaultCapacity: true, publicDescription: true,
        property: { select: publicPropertySelect },
        images: { orderBy: [{ sortOrder: "asc" }, { roomImageId: "asc" }], select: publicImageSelect },
      },
    });
  }

  async createContactRequest(input: ContactRequestInput) {
    return this.prisma.$transaction(async (tx) => {
      let propertyId = input.property_id;
      if (input.room_id !== undefined) {
        const room = await tx.room.findFirst({
          where: { roomId: input.room_id, ...(propertyId === undefined ? {} : { propertyId }), ...publicAvailableRoomWhere() },
          select: { propertyId: true },
        });
        if (!room) return null;
        propertyId = room.propertyId;
      } else if (propertyId !== undefined) {
        const property = await tx.property.findFirst({ where: { propertyId, status: "active" }, select: { propertyId: true } });
        if (!property) return null;
      }
      if (propertyId === undefined) return null;
      return tx.contactRequest.create({
        data: {
          propertyId, roomId: input.room_id ?? null, requesterName: input.requester_name,
          phone: input.phone, email: input.email, message: input.message,
        },
        select: { contactRequestId: true, status: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listContactRequests(ownerId: bigint, query: ContactListQuery) {
    const where: Prisma.ContactRequestWhereInput = {
      property: { ownerId, ...(query.property_id === undefined ? {} : { propertyId: query.property_id }) },
      ...(query.status ? { status: query.status } : {}),
      ...(query.created_at ? { createdAt: { gte: query.created_at, lt: new Date(query.created_at.valueOf() + 24 * 60 * 60 * 1000) } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contactRequest.findMany({ where, select: adminContactSelect, orderBy: [{ createdAt: "desc" }, { contactRequestId: "desc" }], skip: (query.page - 1) * query.page_size, take: query.page_size }),
      this.prisma.contactRequest.count({ where }),
    ]);
    return { rows, total };
  }

  findContactRequest(ownerId: bigint, contactRequestId: bigint) {
    return this.prisma.contactRequest.findFirst({ where: { contactRequestId, property: { ownerId } }, select: adminContactSelect });
  }

  async updateContactRequestStatus(ownerId: bigint, contactRequestId: bigint, status: "new" | "contacted" | "closed") {
    const result = await this.prisma.contactRequest.updateMany({
      where: { contactRequestId, property: { ownerId } },
      data: { status, updatedAt: new Date() },
    });
    if (!result.count) return null;
    return this.findContactRequest(ownerId, contactRequestId);
  }
}
