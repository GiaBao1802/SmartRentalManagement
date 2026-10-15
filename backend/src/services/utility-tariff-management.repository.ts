import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";

export type UtilityKind = "ELECTRICITY" | "WATER";
export type PublishedUtilityVersionInput = {
  utilityType: UtilityKind;
  effectiveFrom: Date;
  sourceName: string | null;
  sourceReference: string | null;
  flatUnitPrice?: bigint;
  tiers?: Array<{ tierNo: number; lowerKwh: string; upperKwh: string | null; unitPrice: bigint }>;
};

export class PrismaUtilityTariffManagementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForProperty(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true, name: true } });
    if (!property) return null;
    const tariffs = await this.prisma.utilityTariff.findMany({
      where: { ownerId, propertyId },
      orderBy: [{ utilityType: "asc" }, { status: "asc" }, { utilityTariffId: "asc" }],
      include: { versions: { orderBy: [{ effectiveFrom: "desc" }, { versionNo: "desc" }], include: { tiers: { orderBy: { tierNo: "asc" } } } } },
    });
    return { property, tariffs };
  }

  async publishVersion(ownerId: bigint, propertyId: bigint, actorId: bigint, input: PublishedUtilityVersionInput) {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } });
      if (!property) return null;

      // Serialize tariff creation/version numbering per Owner+Property+utility.
      await tx.$queryRaw`SELECT property_id FROM properties WHERE property_id = ${propertyId} AND owner_id = ${ownerId} FOR UPDATE`;
      const all = await tx.utilityTariff.findMany({ where: { ownerId, propertyId, utilityType: input.utilityType }, orderBy: { utilityTariffId: "asc" }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1, select: { utilityTariffVersionId: true, versionNo: true } } } });
      const active = all.filter((tariff) => tariff.status === "active");
      if (active.length > 1) throw new ApiError(409, "CONFLICT", "Khu vực đang có nhiều biểu giá hoạt động cùng loại. Hãy rà soát cấu hình trước khi tạo phiên bản mới.");

      let tariff = active[0];
      if (!tariff) {
        const names = input.utilityType === "ELECTRICITY" ? ["ELECTRICITY", "Biểu giá điện"] : ["WATER", "Giá nước"];
        tariff = await tx.utilityTariff.create({ data: {
          ownerId, propertyId, utilityType: input.utilityType,
          code: `${input.utilityType}-${randomUUID()}`,
          name: names[1], status: "active",
        }, include: { versions: { select: { utilityTariffVersionId: true, versionNo: true } } } });
      }

      const latest = tariff.versions[0] ?? null;
      const sameDate = await tx.utilityTariffVersion.findFirst({
        where: { utilityTariffId: tariff.utilityTariffId, effectiveFrom: input.effectiveFrom, publishedAt: { not: null } },
        select: { utilityTariffVersionId: true },
      });
      if (sameDate) throw new ApiError(409, "CONFLICT", "Đã có phiên bản giá được phát hành từ ngày hiệu lực này. Chọn ngày khác để tránh thay đổi cách chọn giá cho hóa đơn nháp.");
      const versionNo = Math.max(0, ...all.flatMap((item) => item.versions.map((version) => version.versionNo))) + 1;
      const created = await tx.utilityTariffVersion.create({ data: {
        utilityTariffId: tariff.utilityTariffId, ownerId, propertyId, utilityType: input.utilityType,
        versionNo, effectiveFrom: input.effectiveFrom,
        unit: input.utilityType === "ELECTRICITY" ? "kWh" : "m3",
        calculationMode: input.utilityType === "ELECTRICITY" ? "PROGRESSIVE" : "FLAT",
        flatUnitPrice: input.utilityType === "WATER" ? input.flatUnitPrice! : null,
        sourceName: input.sourceName, sourceReference: input.sourceReference,
        createdByAccountId: actorId,
        supersedesVersionId: latest?.utilityTariffVersionId ?? null,
      } });
      if (input.utilityType === "ELECTRICITY") {
        await tx.electricityTariffTier.createMany({ data: (input.tiers ?? []).map((tier) => ({
          utilityTariffVersionId: created.utilityTariffVersionId,
          tierNo: tier.tierNo, lowerKwh: new Prisma.Decimal(tier.lowerKwh),
          upperKwh: tier.upperKwh === null ? null : new Prisma.Decimal(tier.upperKwh), unitPrice: tier.unitPrice,
        })) });
      }
      const publishedAt = new Date();
      return tx.utilityTariffVersion.update({
        where: { utilityTariffVersionId: created.utilityTariffVersionId },
        data: { publishedAt, publishedByAccountId: actorId },
        include: { tiers: { orderBy: { tierNo: "asc" } }, tariff: { select: { utilityTariffId: true, utilityType: true, code: true, name: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
