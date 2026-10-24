import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";

export type ServiceKind = "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
export type ServiceItemInput = { kind: ServiceKind; code: string; name: string; description: string | null; unit: string };
export type ServicePriceInput = { effectiveFrom: Date; unitPrice: bigint; sourceName: string | null; sourceReference: string | null; reason: string | null };

const serviceError = (status: number, message: string) => new ApiError(status, status === 409 ? "CONFLICT" : status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message);
const vndMax = 9_223_372_036_854_775_807n;

export class PrismaPropertyServiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listResidentServices(ownerId: bigint, residentId: bigint, effectiveOn: Date) {
    const occupancies = await this.prisma.roomResident.findMany({
      where: { ownerId, residentId, status: "active" },
      select: { propertyId: true },
    });
    const propertyIds = [...new Set(occupancies.map((row) => row.propertyId.toString()))].map(BigInt);
    if (propertyIds.length === 0) return [];

    const properties = await this.prisma.property.findMany({
      where: { ownerId, propertyId: { in: propertyIds }, status: "active" },
      orderBy: [{ name: "asc" }, { propertyId: "asc" }],
      select: { propertyId: true, name: true },
    });
    if (properties.length === 0) return [];

    const items = await this.prisma.propertyPricingItem.findMany({
      where: { ownerId, propertyId: { in: properties.map((property) => property.propertyId) }, kind: "FLEXIBLE_SERVICE", status: "active" },
      orderBy: [{ propertyId: "asc" }, { name: "asc" }, { propertyPricingItemId: "asc" }],
      select: {
        propertyPricingItemId: true,
        propertyId: true,
        name: true,
        description: true,
        unit: true,
        priceVersions: {
          where: { effectiveFrom: { lte: effectiveOn } },
          orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }],
          take: 1,
          select: { versionNo: true, effectiveFrom: true, unitPrice: true },
        },
      },
    });

    return properties.map((property) => ({
      property,
      services: items.filter((item) => item.propertyId === property.propertyId),
    }));
  }

  async listItems(ownerId: bigint, propertyId: bigint, kind?: ServiceKind) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true, name: true } });
    if (!property) return null;
    const items = await this.prisma.propertyPricingItem.findMany({
      where: { ownerId, propertyId, ...(kind ? { kind } : { kind: { in: ["FIXED_SERVICE", "FLEXIBLE_SERVICE"] } }) },
      orderBy: [{ kind: "asc" }, { status: "asc" }, { name: "asc" }],
      include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } },
    });
    return { property, items };
  }

  async createItem(ownerId: bigint, propertyId: bigint, input: ServiceItemInput) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } });
    if (!property) return null;
    try {
      return await this.prisma.propertyPricingItem.create({ data: { ownerId, propertyId, kind: input.kind, code: input.code, name: input.name, description: input.description, unit: input.unit, status: "active" } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw serviceError(409, "Mã dịch vụ đã được sử dụng trong khu vực này.");
      throw error;
    }
  }

  async retireItem(ownerId: bigint, propertyId: bigint, itemId: bigint, kind: ServiceKind) {
    const item = await this.prisma.propertyPricingItem.findFirst({ where: { ownerId, propertyId, propertyPricingItemId: itemId, kind }, include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } } });
    if (!item) return null;
    if (item.status === "retired") return item;
    return this.prisma.propertyPricingItem.update({ where: { propertyPricingItemId: itemId }, data: { status: "retired" }, include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } } });
  }

  async publishPrice(ownerId: bigint, propertyId: bigint, itemId: bigint, actorId: bigint, kind: ServiceKind, input: ServicePriceInput) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.propertyPricingItem.findFirst({ where: { ownerId, propertyId, propertyPricingItemId: itemId, kind }, select: { propertyPricingItemId: true, status: true, unit: true } });
      if (!item) return null;
      if (item.status !== "active") throw serviceError(409, "Dịch vụ đã ngưng hoạt động, không thể phát hành giá mới.");
      await tx.$queryRaw`SELECT property_pricing_item_id FROM property_pricing_items WHERE property_pricing_item_id = ${itemId} AND owner_id = ${ownerId} AND property_id = ${propertyId} FOR UPDATE`;
      const versions = await tx.propertyPriceVersion.findMany({ where: { ownerId, propertyId, propertyPricingItemId: itemId, kind }, orderBy: { versionNo: "desc" }, take: 1 });
      const latest = versions[0] ?? null;
      const duplicate = await tx.propertyPriceVersion.findFirst({ where: { propertyPricingItemId: itemId, effectiveFrom: input.effectiveFrom }, select: { propertyPriceVersionId: true } });
      if (duplicate) throw serviceError(409, "Ngày hiệu lực này đã có phiên bản giá. Chọn ngày khác.");
      const created = await tx.propertyPriceVersion.create({ data: {
        propertyPricingItemId: itemId, ownerId, propertyId, kind, versionNo: (latest?.versionNo ?? 0) + 1,
        effectiveFrom: input.effectiveFrom, unitPrice: input.unitPrice, sourceName: input.sourceName,
        sourceReference: input.sourceReference, reason: input.reason, publishedAt: new Date(),
        publishedByAccountId: actorId, createdByAccountId: actorId,
        supersedesVersionId: latest?.propertyPriceVersionId ?? null,
      } });
      return { ...created, unit: item.unit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

}

export function servicePriceInputIsValid(input: ServicePriceInput) {
  return input.unitPrice >= 0n && input.unitPrice <= vndMax;
}
