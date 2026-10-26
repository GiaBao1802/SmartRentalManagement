import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";

export type ServiceKind = "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
export type FlexibleServiceConfigurationInput = {
  serviceMode: "BOOKING" | "SUBSCRIPTION";
  availableWeekdays: number[];
  opensAt: string;
  closesAt: string;
  slotDurationMinutes: number | null;
  capacityPerSlot: number | null;
  packageDurationCount: number | null;
  packageDurationUnit: "MONTH" | "YEAR" | null;
};
export type ServiceItemInput = { kind: ServiceKind; code: string; name: string; description: string | null; unit: string; serviceConfiguration?: FlexibleServiceConfigurationInput };
export type ServicePriceInput = { effectiveFrom: Date; unitPrice: bigint; sourceName: string | null; sourceReference: string | null; reason: string | null };

type FlexibleServiceConfigurationRow = {
  property_pricing_item_id: bigint;
  service_mode: "BOOKING" | "SUBSCRIPTION";
  opens_at: string;
  closes_at: string;
  open_monday: boolean;
  open_tuesday: boolean;
  open_wednesday: boolean;
  open_thursday: boolean;
  open_friday: boolean;
  open_saturday: boolean;
  open_sunday: boolean;
  slot_duration_minutes: number | null;
  capacity_per_slot: number | null;
  package_duration_count: number | null;
  package_duration_unit: "MONTH" | "YEAR" | null;
};

const weekdayColumns = ["open_monday", "open_tuesday", "open_wednesday", "open_thursday", "open_friday", "open_saturday", "open_sunday"] as const;

async function upsertFlexibleConfiguration(tx: Prisma.TransactionClient, ownerId: bigint, propertyId: bigint, itemId: bigint, config: FlexibleServiceConfigurationInput) {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = weekdayColumns.map((_, index) => config.availableWeekdays.includes(index + 1));
  await tx.$executeRaw`
    INSERT INTO property_flexible_service_configurations (
      property_pricing_item_id, owner_id, property_id, kind, service_mode,
      opens_at, closes_at, open_monday, open_tuesday, open_wednesday,
      open_thursday, open_friday, open_saturday, open_sunday,
      slot_duration_minutes, capacity_per_slot, package_duration_count, package_duration_unit
    ) VALUES (
      ${itemId}, ${ownerId}, ${propertyId}, 'FLEXIBLE_SERVICE', ${config.serviceMode},
      CAST(${config.opensAt} AS time), CAST(${config.closesAt} AS time),
      ${monday}, ${tuesday}, ${wednesday}, ${thursday}, ${friday}, ${saturday}, ${sunday},
      ${config.slotDurationMinutes}, ${config.capacityPerSlot}, ${config.packageDurationCount}, ${config.packageDurationUnit}
    )
    ON CONFLICT (property_pricing_item_id) DO UPDATE SET
      service_mode = EXCLUDED.service_mode,
      opens_at = EXCLUDED.opens_at,
      closes_at = EXCLUDED.closes_at,
      open_monday = EXCLUDED.open_monday,
      open_tuesday = EXCLUDED.open_tuesday,
      open_wednesday = EXCLUDED.open_wednesday,
      open_thursday = EXCLUDED.open_thursday,
      open_friday = EXCLUDED.open_friday,
      open_saturday = EXCLUDED.open_saturday,
      open_sunday = EXCLUDED.open_sunday,
      slot_duration_minutes = EXCLUDED.slot_duration_minutes,
      capacity_per_slot = EXCLUDED.capacity_per_slot,
      package_duration_count = EXCLUDED.package_duration_count,
      package_duration_unit = EXCLUDED.package_duration_unit,
      updated_at = now()
  `;
}

async function readFlexibleConfigurations(tx: Prisma.TransactionClient | PrismaClient, ownerId: bigint, propertyId: bigint) {
  return tx.$queryRaw<FlexibleServiceConfigurationRow[]>`
    SELECT property_pricing_item_id, service_mode, to_char(opens_at, 'HH24:MI') AS opens_at,
      to_char(closes_at, 'HH24:MI') AS closes_at, open_monday, open_tuesday,
      open_wednesday, open_thursday, open_friday, open_saturday, open_sunday,
      slot_duration_minutes, capacity_per_slot, package_duration_count, package_duration_unit
    FROM property_flexible_service_configurations
    WHERE owner_id = ${ownerId} AND property_id = ${propertyId}
  `;
}

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
    const configurations = kind === "FIXED_SERVICE" ? [] : await readFlexibleConfigurations(this.prisma, ownerId, propertyId);
    const configByItem = new Map(configurations.map((config) => [config.property_pricing_item_id.toString(), config]));
    return { property, items: items.map((item) => ({ ...item, flexibleServiceConfiguration: configByItem.get(item.propertyPricingItemId.toString()) ?? null })) };
  }

  async createItem(ownerId: bigint, propertyId: bigint, input: ServiceItemInput) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } });
    if (!property) return null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.kind === "FLEXIBLE_SERVICE" && !input.serviceConfiguration) throw serviceError(400, "Cần cấu hình kiểu sử dụng và lịch cho tiện ích phát sinh.");
        if (input.kind !== "FLEXIBLE_SERVICE" && input.serviceConfiguration) throw serviceError(400, "Chỉ tiện ích phát sinh mới nhận cấu hình lịch hoặc gói.");
        const item = await tx.propertyPricingItem.create({ data: { ownerId, propertyId, kind: input.kind, code: input.code, name: input.name, description: input.description, unit: input.unit, status: "active" } });
        if (!input.serviceConfiguration) return { ...item, flexibleServiceConfiguration: null };
        await upsertFlexibleConfiguration(tx, ownerId, propertyId, item.propertyPricingItemId, input.serviceConfiguration);
        const configuration = (await readFlexibleConfigurations(tx, ownerId, propertyId)).find((row) => row.property_pricing_item_id === item.propertyPricingItemId);
        return { ...item, flexibleServiceConfiguration: configuration ?? null };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw serviceError(409, "Mã dịch vụ đã được sử dụng trong khu vực này.");
      throw error;
    }
  }

  async saveFlexibleConfiguration(ownerId: bigint, propertyId: bigint, itemId: bigint, config: FlexibleServiceConfigurationInput) {
    return this.prisma.$transaction(async (tx) => {
      const [item] = await tx.$queryRaw<Array<{ status: string; service_mode: string | null; price_version_count: bigint }>>`
        SELECT i.status, c.service_mode,
          (SELECT count(*) FROM property_price_versions pv
            WHERE pv.property_pricing_item_id = i.property_pricing_item_id) AS price_version_count
        FROM property_pricing_items i
        LEFT JOIN property_flexible_service_configurations c
          ON c.property_pricing_item_id = i.property_pricing_item_id
        WHERE i.owner_id = ${ownerId} AND i.property_id = ${propertyId}
          AND i.property_pricing_item_id = ${itemId} AND i.kind = 'FLEXIBLE_SERVICE'
        FOR UPDATE OF i
      `;
      if (!item) return null;
      if (item.status !== "active") throw serviceError(409, "Tiện ích đã ngưng hoạt động, không thể sửa cấu hình.");
      if (item.service_mode && item.service_mode !== config.serviceMode) throw serviceError(409, "Không thể đổi loại sử dụng sau khi đã cấu hình. Tạo tiện ích mới để đổi giữa đặt lịch và gói.");
      if (!item.service_mode && item.price_version_count > 0n) throw serviceError(409, "Tiện ích cũ đã có lịch sử giá. Hãy tạo tiện ích mới để giữ nguyên ý nghĩa các mức giá cũ.");

      if (!item.service_mode) {
        const unit = config.serviceMode === "BOOKING" ? "lượt" : "gói";
        await tx.$executeRaw`UPDATE property_pricing_items SET unit = ${unit}, updated_at = now()
          WHERE property_pricing_item_id = ${itemId} AND owner_id = ${ownerId} AND property_id = ${propertyId}`;
      }
      await upsertFlexibleConfiguration(tx, ownerId, propertyId, itemId, config);
      return tx.propertyPricingItem.findFirst({
        where: { ownerId, propertyId, propertyPricingItemId: itemId, kind: "FLEXIBLE_SERVICE" },
        include: { priceVersions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }] } },
      }).then(async (updated) => {
        if (!updated) return null;
        const configuration = (await readFlexibleConfigurations(tx, ownerId, propertyId)).find((row) => row.property_pricing_item_id === itemId);
        return { ...updated, flexibleServiceConfiguration: configuration ?? null };
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
