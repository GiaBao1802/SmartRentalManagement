import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";
import { decimalMilli, formatMilli, lineAmount } from "../invoices/invoice-itemized.calculator.js";

export type ServiceKind = "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
export type ServiceItemInput = { kind: ServiceKind; code: string; name: string; description: string | null; unit: string };
export type ServicePriceInput = { effectiveFrom: Date; unitPrice: bigint; sourceName: string | null; sourceReference: string | null; reason: string | null };
export type FlexibleChargeInput = { roomId: bigint; contractId: bigint; residentId: bigint | null; itemId: bigint; quantity: string; occurredAt: Date; sourceEventKey: string };

const serviceError = (status: number, message: string) => new ApiError(status, status === 409 ? "CONFLICT" : status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message);
const vndMax = 9_223_372_036_854_775_807n;

function hcmDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
}

export class PrismaPropertyServiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

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

  async listCharges(ownerId: bigint, propertyId: bigint, page: number, pageSize: number) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } });
    if (!property) return null;
    const where = { ownerId, propertyId };
    const [charges, total] = await this.prisma.$transaction([
      this.prisma.flexibleServiceCharge.findMany({ where, orderBy: [{ occurredAt: "desc" }, { flexibleServiceChargeId: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: {
        room: { select: { roomCode: true } }, contract: { select: { contractNo: true } }, resident: { select: { fullName: true } },
        pricingItem: { select: { code: true, name: true } },
      } }),
      this.prisma.flexibleServiceCharge.count({ where }),
    ]);
    return { charges, meta: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) } };
  }

  async createCharge(ownerId: bigint, propertyId: bigint, actorId: bigint, input: FlexibleChargeInput) {
    const date = hcmDate(input.occurredAt);
    let quantityMilli: bigint;
    try { quantityMilli = decimalMilli(input.quantity); } catch { throw serviceError(400, "Số lượng phải lớn hơn 0 và tối đa 3 chữ số thập phân."); }
    if (quantityMilli <= 0n) throw serviceError(400, "Số lượng phải lớn hơn 0.");
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findFirst({ where: { ownerId, propertyId, roomId: input.roomId, contractId: input.contractId }, select: {
        contractId: true, status: true, startDate: true, endDate: true, terminationDate: true, representativeResidentId: true,
      } });
      if (!contract) return null;
      const effectiveEnd = contract.status === "terminated" && contract.terminationDate ? contract.terminationDate : contract.endDate;
      if (date < contract.startDate || date > effectiveEnd || contract.status === "draft") throw serviceError(400, "Ngày phát sinh phải nằm trong thời hạn hợp đồng.");
      if (input.residentId !== null) {
        const associated = contract.representativeResidentId === input.residentId || Boolean(await tx.roomResident.findFirst({ where: { ownerId, propertyId, roomId: input.roomId, contractId: input.contractId, residentId: input.residentId, startedAt: { lte: date }, OR: [{ endedAt: null }, { endedAt: { gte: date } }] }, select: { occupancyId: true } }));
        if (!associated) throw serviceError(404, "Không tìm thấy người thuê trong hợp đồng này.");
      }
      const item = await tx.propertyPricingItem.findFirst({ where: { ownerId, propertyId, propertyPricingItemId: input.itemId }, select: { propertyPricingItemId: true, kind: true, status: true, unit: true, name: true } });
      if (!item) return null;
      if (item.kind !== "FLEXIBLE_SERVICE") throw serviceError(400, "Chỉ dịch vụ phát sinh mới được ghi nhận theo sự kiện.");
      if (item.status !== "active") throw serviceError(409, "Dịch vụ đã ngưng hoạt động, không thể tạo phát sinh mới.");
      const version = await tx.propertyPriceVersion.findFirst({ where: { ownerId, propertyId, propertyPricingItemId: input.itemId, kind: "FLEXIBLE_SERVICE", effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] });
      if (!version) throw serviceError(409, "Chưa có phiên bản giá hiệu lực tại ngày phát sinh.");
      const amount = lineAmount(quantityMilli, version.unitPrice);
      const canonical = JSON.stringify({ owner_id: ownerId.toString(), property_id: propertyId.toString(), room_id: input.roomId.toString(), contract_id: input.contractId.toString(), resident_id: input.residentId?.toString() ?? null, item_id: input.itemId.toString(), quantity: formatMilli(quantityMilli), occurred_at: input.occurredAt.toISOString() });
      const fingerprint = createHash("sha256").update(canonical).digest();
      const prior = await tx.flexibleServiceCharge.findFirst({ where: { ownerId, sourceSystem: "GOCTRO_ADMIN", sourceEventKey: input.sourceEventKey } });
      if (prior) {
        if (Buffer.compare(Buffer.from(prior.payloadFingerprint), fingerprint) !== 0) throw serviceError(409, "Khóa chống trùng đã được dùng cho nội dung phát sinh khác.");
        return { charge: prior, replayed: true };
      }
      try {
        const charge = await tx.flexibleServiceCharge.create({ data: {
          ownerId, propertyId, roomId: input.roomId, contractId: input.contractId, residentId: input.residentId,
          propertyPricingItemId: input.itemId, kind: "FLEXIBLE_SERVICE", propertyPriceVersionId: version.propertyPriceVersionId,
          occurredAt: input.occurredAt, quantity: new Prisma.Decimal(formatMilli(quantityMilli)), unit: item.unit,
          unitPriceSnapshot: version.unitPrice, amount, sourceSystem: "GOCTRO_ADMIN", sourceEventKey: input.sourceEventKey,
          payloadFingerprint: fingerprint, status: "READY", actorAccountId: actorId,
        } });
        return { charge, replayed: false };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw serviceError(409, "Khóa phát sinh đã được ghi nhận. Tải lại danh sách để kiểm tra.");
        throw error;
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

export function servicePriceInputIsValid(input: ServicePriceInput) {
  return input.unitPrice >= 0n && input.unitPrice <= vndMax;
}
