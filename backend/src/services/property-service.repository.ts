import { createHash } from "node:crypto";
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
export type PropertyFacilityInput = { name: string; description: string | null; location: string | null };

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

type ResidentBookableServiceRow = FlexibleServiceConfigurationRow & {
  owner_id: bigint;
  resident_id: bigint;
  property_id: bigint;
  service_name: string;
  unit: string;
  price_version_id: bigint | null;
  unit_price: bigint | null;
  price_effective_from: string | null;
};

type ResidentServiceBookingRow = {
  booking_id: bigint;
  owner_id?: bigint;
  resident_id?: bigint;
  property_id?: bigint;
  room_id?: bigint;
  contract_id?: bigint;
  service_id?: bigint;
  service_name_snapshot: string;
  service_date: string;
  slot_start: string;
  slot_end: string;
  slot_duration_minutes: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  cancelled_at: Date | null;
  decision_at?: Date | null;
  decision_note?: string | null;
  flexible_service_charge_id?: bigint | null;
  charge_amount?: bigint | null;
  unit_snapshot?: string;
  invoice_no?: string | null;
  invoice_status?: string | null;
  resident_name?: string;
  room_code?: string;
  contract_no?: string;
  current_unit_price?: bigint | null;
  price_version_id?: bigint | null;
  property_name?: string;
  created_at: Date;
  can_cancel?: boolean;
  can_approve?: boolean;
};

export type ResidentServiceBookingInput = { serviceDate: string; startTime: string };
export type ResidentServiceBookingDecisionInput = { decision: "APPROVE" | "REJECT"; reason: string | null };

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
const minuteOfDay = (time: string) => { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; };
const timeOfDay = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const localWeekday = (date: string) => { const day = new Date(`${date}T00:00:00.000Z`).getUTCDay(); return day === 0 ? 7 : day; };
const localSlotStart = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const bookingChargeFingerprint = (values: Record<string, string>) => createHash("sha256").update(JSON.stringify(values)).digest();

async function findResidentBookableService(
  tx: Prisma.TransactionClient | PrismaClient,
  ownerId: bigint,
  residentId: bigint,
  serviceId: bigint,
  serviceDate: string,
  lockConfiguration = false,
) {
  const lockClause = lockConfiguration ? Prisma.sql`FOR UPDATE OF c` : Prisma.empty;
  const rows = await tx.$queryRaw<ResidentBookableServiceRow[]>`
    SELECT i.owner_id, i.property_id, i.property_pricing_item_id,
      ${residentId}::bigint AS resident_id, i.name AS service_name, i.unit,
      price.property_price_version_id AS price_version_id, price.unit_price,
      to_char(price.effective_from, 'YYYY-MM-DD') AS price_effective_from,
      c.service_mode, to_char(c.opens_at, 'HH24:MI') AS opens_at,
      to_char(c.closes_at, 'HH24:MI') AS closes_at,
      c.open_monday, c.open_tuesday, c.open_wednesday, c.open_thursday,
      c.open_friday, c.open_saturday, c.open_sunday,
      c.slot_duration_minutes, c.capacity_per_slot,
      c.package_duration_count, c.package_duration_unit
    FROM property_pricing_items i
    JOIN properties p ON p.property_id = i.property_id AND p.owner_id = i.owner_id
    JOIN property_flexible_service_configurations c
      ON c.property_pricing_item_id = i.property_pricing_item_id
      AND c.owner_id = i.owner_id AND c.property_id = i.property_id AND c.kind = i.kind
    LEFT JOIN LATERAL (
      SELECT v.property_price_version_id, v.unit_price, v.effective_from
      FROM property_price_versions v
      WHERE v.property_pricing_item_id = i.property_pricing_item_id
        AND v.owner_id = i.owner_id AND v.property_id = i.property_id
        AND v.kind = i.kind AND v.published_at IS NOT NULL
        AND v.effective_from <= CAST(${serviceDate} AS date)
      ORDER BY v.effective_from DESC, v.version_no DESC
      LIMIT 1
    ) price ON true
    WHERE i.owner_id = ${ownerId} AND i.property_pricing_item_id = ${serviceId}
      AND i.kind = 'FLEXIBLE_SERVICE' AND i.status = 'active' AND p.status = 'active'
      AND EXISTS (
        SELECT 1 FROM room_residents rr
        JOIN contracts ct ON ct.contract_id = rr.contract_id AND ct.room_id = rr.room_id
          AND ct.property_id = rr.property_id AND ct.owner_id = rr.owner_id
        WHERE rr.owner_id = i.owner_id AND rr.resident_id = ${residentId}
          AND rr.property_id = i.property_id AND rr.status = 'active'
          AND rr.contract_id IS NOT NULL
          AND rr.started_at <= CAST(${serviceDate} AS date)
          AND (rr.ended_at IS NULL OR rr.ended_at >= CAST(${serviceDate} AS date))
          AND ct.status = 'active' AND ct.start_date <= CAST(${serviceDate} AS date)
          AND ct.end_date >= CAST(${serviceDate} AS date)
      )
    ${lockClause}
  `;
  return rows[0] ?? null;
}

function scheduleSlots(service: ResidentBookableServiceRow, serviceDate: string) {
  const day = localWeekday(serviceDate);
  const weekdays = [service.open_monday, service.open_tuesday, service.open_wednesday, service.open_thursday, service.open_friday, service.open_saturday, service.open_sunday];
  if (service.service_mode !== "BOOKING" || !service.slot_duration_minutes || !service.capacity_per_slot || !weekdays[day - 1]) return [];
  const opens = minuteOfDay(service.opens_at);
  const closes = minuteOfDay(service.closes_at);
  const duration = service.slot_duration_minutes;
  const slots: Array<{ start: string; end: string }> = [];
  for (let start = opens; start + duration <= closes; start += duration) {
    const startTime = timeOfDay(start);
    if (localSlotStart(serviceDate, startTime).getTime() > Date.now()) slots.push({ start: startTime, end: timeOfDay(start + duration) });
  }
  return slots;
}

export class PrismaPropertyServiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listFacilities(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true, name: true } });
    if (!property) return null;
    const items = await this.prisma.propertyFacility.findMany({ where: { ownerId, propertyId, active: true }, orderBy: [{ name: "asc" }, { propertyFacilityId: "asc" }], select: { propertyFacilityId: true, name: true, description: true, location: true, active: true, createdAt: true } });
    return { property, items };
  }

  async createFacility(ownerId: bigint, propertyId: bigint, input: PropertyFacilityInput) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } });
    if (!property) return null;
    return this.prisma.propertyFacility.create({ data: { ownerId, propertyId, name: input.name, description: input.description, location: input.location }, select: { propertyFacilityId: true, name: true, description: true, location: true, active: true, createdAt: true } });
  }

  async listResidentServices(ownerId: bigint, residentId: bigint, effectiveOn: Date) {
    const occupancies = await this.prisma.$queryRaw<Array<{ property_id: bigint }>>`
      SELECT DISTINCT rr.property_id
      FROM room_residents rr
      JOIN contracts ct ON ct.contract_id = rr.contract_id AND ct.room_id = rr.room_id
        AND ct.property_id = rr.property_id AND ct.owner_id = rr.owner_id
      WHERE rr.owner_id = ${ownerId} AND rr.resident_id = ${residentId}
        AND rr.status = 'active' AND rr.contract_id IS NOT NULL
        AND rr.started_at <= CAST(${effectiveOn} AS date)
        AND (rr.ended_at IS NULL OR rr.ended_at >= CAST(${effectiveOn} AS date))
        AND ct.status = 'active' AND ct.start_date <= CAST(${effectiveOn} AS date)
        AND ct.end_date >= CAST(${effectiveOn} AS date)
    `;
    const propertyIds = [...new Set(occupancies.map((row) => row.property_id.toString()))].map(BigInt);
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

    const facilities = await this.prisma.propertyFacility.findMany({
      where: { ownerId, propertyId: { in: properties.map((property) => property.propertyId) }, active: true },
      orderBy: [{ propertyId: "asc" }, { name: "asc" }, { propertyFacilityId: "asc" }],
      select: { propertyFacilityId: true, propertyId: true, name: true, description: true, location: true },
    });

    const configurations = new Map<string, FlexibleServiceConfigurationRow>();
    await Promise.all(properties.map(async (property) => {
      const rows = await readFlexibleConfigurations(this.prisma, ownerId, property.propertyId);
      for (const row of rows) configurations.set(row.property_pricing_item_id.toString(), row);
    }));

    return properties.map((property) => ({
      property,
      facilities: facilities.filter((facility) => facility.propertyId === property.propertyId),
      services: items.filter((item) => item.propertyId === property.propertyId).map((item) => ({
        ...item,
        flexibleServiceConfiguration: configurations.get(item.propertyPricingItemId.toString()) ?? null,
      })),
    }));
  }

  async listResidentServiceAvailability(ownerId: bigint, residentId: bigint, serviceId: bigint, serviceDate: string) {
    const service = await findResidentBookableService(this.prisma, ownerId, residentId, serviceId, serviceDate);
    if (!service) return null;
    if (service.service_mode !== "BOOKING") throw serviceError(409, "Gói đăng ký không cần đặt lịch theo từng lượt.");

    const candidates = scheduleSlots(service, serviceDate);
    if (!candidates.length) return {
      serviceId,
      serviceDate,
      unit: service.unit,
      unitPrice: service.unit_price,
      priceEffectiveFrom: service.price_effective_from,
      slots: [],
    };
    const bookings = await this.prisma.$queryRaw<Array<{ slot_start: string; slot_end: string }>>`
      SELECT to_char(slot_start, 'HH24:MI') AS slot_start, to_char(slot_end, 'HH24:MI') AS slot_end
      FROM resident_service_bookings
      WHERE owner_id = ${ownerId} AND property_pricing_item_id = ${serviceId}
        AND service_date = CAST(${serviceDate} AS date) AND status IN ('PENDING', 'APPROVED')
    `;
    const capacity = service.capacity_per_slot!;
    const slots = candidates.flatMap((candidate) => {
      const start = minuteOfDay(candidate.start);
      const end = minuteOfDay(candidate.end);
      const used = bookings.reduce((count, booking) => count + (minuteOfDay(booking.slot_start) < end && minuteOfDay(booking.slot_end) > start ? 1 : 0), 0);
      return used < capacity ? [{ start_time: candidate.start, end_time: candidate.end, remaining_capacity: capacity - used }] : [];
    });
    return {
      serviceId,
      serviceDate,
      unit: service.unit,
      unitPrice: service.unit_price,
      priceEffectiveFrom: service.price_effective_from,
      slots,
    };
  }

  async bookResidentService(ownerId: bigint, residentId: bigint, accountId: bigint, serviceId: bigint, input: ResidentServiceBookingInput) {
    return this.prisma.$transaction(async (tx) => {
      const service = await findResidentBookableService(tx, ownerId, residentId, serviceId, input.serviceDate, true);
      if (!service) return null;
      if (service.service_mode !== "BOOKING" || !service.capacity_per_slot || !service.slot_duration_minutes) throw serviceError(409, "Tiện ích này không có lịch đặt theo từng lượt.");

      const slot = scheduleSlots(service, input.serviceDate).find((candidate) => candidate.start === input.startTime);
      if (!slot) throw serviceError(409, "Khung giờ này không nằm trong lịch mở hoặc đã bắt đầu. Hãy tải lịch trống mới.");
      if (service.price_version_id === null || service.unit_price === null) throw serviceError(409, "Dịch vụ chưa có giá hiệu lực cho ngày đã chọn nên chưa thể gửi yêu cầu.");

      const occupancies = await tx.$queryRaw<Array<{ room_id: bigint; contract_id: bigint; contract_no: string }>>`
        SELECT rr.room_id, rr.contract_id, ct.contract_no
        FROM room_residents rr
        JOIN contracts ct ON ct.contract_id = rr.contract_id AND ct.room_id = rr.room_id
          AND ct.property_id = rr.property_id AND ct.owner_id = rr.owner_id
        WHERE rr.owner_id = ${ownerId} AND rr.resident_id = ${residentId}
          AND rr.property_id = ${service.property_id} AND rr.status = 'active'
          AND rr.contract_id IS NOT NULL
          AND rr.started_at <= CAST(${input.serviceDate} AS date)
          AND (rr.ended_at IS NULL OR rr.ended_at >= CAST(${input.serviceDate} AS date))
          AND ct.status = 'active' AND ct.start_date <= CAST(${input.serviceDate} AS date)
          AND (CASE WHEN ct.status = 'terminated' AND ct.termination_date IS NOT NULL THEN ct.termination_date ELSE ct.end_date END) >= CAST(${input.serviceDate} AS date)
        FOR SHARE OF rr, ct
      `;
      if (occupancies.length === 0) return null;
      if (occupancies.length > 1) throw serviceError(409, "Bạn có nhiều hợp đồng tại khu trọ này trong ngày đã chọn. Hãy liên hệ chủ trọ để xác định phòng tính phí.");

      const existing = await tx.$queryRaw<ResidentServiceBookingRow[]>`
        SELECT booking_id, service_name_snapshot, quoted_unit_price AS charge_amount, unit_snapshot,
          to_char(service_date,'YYYY-MM-DD') AS service_date,
          to_char(slot_start,'HH24:MI') AS slot_start, to_char(slot_end,'HH24:MI') AS slot_end,
          slot_duration_minutes, status, cancelled_at, decision_at, decision_note, created_at
        FROM resident_service_bookings
        WHERE owner_id = ${ownerId} AND resident_id = ${residentId}
          AND property_pricing_item_id = ${serviceId} AND service_date = CAST(${input.serviceDate} AS date)
          AND slot_start = CAST(${input.startTime} AS time) AND status IN ('PENDING', 'APPROVED')
        LIMIT 1
      `;
      if (existing[0]) return { booking: existing[0], created: false };

      const overlap = await tx.$queryRaw<Array<{ total: number }>>`
        SELECT count(*)::int AS total FROM resident_service_bookings
        WHERE owner_id = ${ownerId} AND property_pricing_item_id = ${serviceId}
          AND service_date = CAST(${input.serviceDate} AS date) AND status IN ('PENDING', 'APPROVED')
          AND slot_start < CAST(${slot.end} AS time) AND slot_end > CAST(${slot.start} AS time)
      `;
      if ((overlap[0]?.total ?? 0) >= service.capacity_per_slot) throw serviceError(409, "Khung giờ vừa hết chỗ. Hãy chọn giờ khác.");

      const rows = await tx.$queryRaw<ResidentServiceBookingRow[]>`
        INSERT INTO resident_service_bookings (
          owner_id, resident_id, property_id, room_id, contract_id, property_pricing_item_id, kind,
          service_name_snapshot, quoted_price_version_id, quoted_unit_price, unit_snapshot,
          service_date, slot_start, slot_end,
          slot_duration_minutes, status
        ) VALUES (
          ${ownerId}, ${residentId}, ${service.property_id}, ${occupancies[0].room_id}, ${occupancies[0].contract_id}, ${serviceId}, 'FLEXIBLE_SERVICE',
          ${service.service_name}, ${service.price_version_id}, ${service.unit_price}, ${service.unit},
          CAST(${input.serviceDate} AS date), CAST(${slot.start} AS time), CAST(${slot.end} AS time),
          ${service.slot_duration_minutes}, 'PENDING'
        )
        RETURNING booking_id, service_name_snapshot, to_char(service_date,'YYYY-MM-DD') AS service_date,
          quoted_unit_price AS charge_amount, unit_snapshot, to_char(slot_start,'HH24:MI') AS slot_start, to_char(slot_end,'HH24:MI') AS slot_end,
          slot_duration_minutes, status, cancelled_at, decision_at, decision_note, created_at
      `;
      const booking = rows[0];
      await tx.notification.create({
        data: {
          accountId,
          notificationType: "service_booking_requested",
          title: "Đã gửi yêu cầu đặt tiện ích",
          body: `${service.service_name} · ${input.serviceDate} · ${slot.start}–${slot.end}. Yêu cầu đang chờ chủ trọ duyệt.`,
        },
      });
      const admins = await tx.account.findMany({ where: { ownerId, role: "admin", status: "active" }, select: { accountId: true } });
      if (admins.length) await tx.notification.createMany({ data: admins.map(({ accountId: adminAccountId }) => ({
        accountId: adminAccountId,
        notificationType: "service_booking_requested",
        title: "Cư dân gửi yêu cầu đặt tiện ích",
        body: `${service.service_name} · ${input.serviceDate} · ${slot.start}–${slot.end}. Vui lòng xem mục Tiện ích phát sinh để duyệt yêu cầu.`,
      })) });
      return { booking, created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async listResidentServiceBookings(ownerId: bigint, residentId: bigint) {
    const rows = await this.prisma.$queryRaw<ResidentServiceBookingRow[]>`
      SELECT b.booking_id, b.service_name_snapshot, to_char(b.service_date,'YYYY-MM-DD') AS service_date,
        to_char(b.slot_start,'HH24:MI') AS slot_start, to_char(b.slot_end,'HH24:MI') AS slot_end,
        b.slot_duration_minutes, b.status, b.cancelled_at, b.decision_at, b.decision_note, b.created_at,
        p.name AS property_name, COALESCE(charge.amount, b.quoted_unit_price) AS charge_amount,
        b.unit_snapshot,
        invoice.invoice_no, invoice.status AS invoice_status,
        (b.status = 'PENDING') AS can_cancel
      FROM resident_service_bookings b
      JOIN properties p ON p.property_id = b.property_id AND p.owner_id = b.owner_id
      LEFT JOIN flexible_service_charges charge ON charge.flexible_service_charge_id = b.flexible_service_charge_id
        AND charge.owner_id = b.owner_id AND charge.property_id = b.property_id
      LEFT JOIN invoices invoice ON invoice.invoice_id = charge.invoice_id
        AND invoice.owner_id = charge.owner_id AND invoice.property_id = charge.property_id
      WHERE b.owner_id = ${ownerId} AND b.resident_id = ${residentId}
      ORDER BY CASE WHEN b.status IN ('PENDING','APPROVED') AND (b.service_date + b.slot_start) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 0 ELSE 1 END,
        CASE WHEN b.status IN ('PENDING','APPROVED') AND (b.service_date + b.slot_start) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN b.service_date END ASC,
        CASE WHEN b.status NOT IN ('PENDING','APPROVED') OR (b.service_date + b.slot_start) <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN b.service_date END DESC,
        b.slot_start ASC
      LIMIT 50
    `;
    return rows;
  }

  async listAdminServiceBookings(ownerId: bigint, propertyId: bigint) {
    const property = await this.prisma.property.findFirst({ where: { ownerId, propertyId }, select: { propertyId: true } });
    if (!property) return null;
    return this.prisma.$queryRaw<ResidentServiceBookingRow[]> `
      SELECT b.booking_id, b.service_name_snapshot, p.name AS property_name,
        r.full_name AS resident_name, rm.room_code, ct.contract_no,
        to_char(b.service_date,'YYYY-MM-DD') AS service_date,
        to_char(b.slot_start,'HH24:MI') AS slot_start, to_char(b.slot_end,'HH24:MI') AS slot_end,
        b.slot_duration_minutes, b.status, b.created_at, b.decision_note,
        b.quoted_unit_price AS charge_amount, b.unit_snapshot,
        b.quoted_price_version_id AS price_version_id,
        ((b.service_date + b.slot_start) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS can_approve
      FROM resident_service_bookings b
      JOIN properties p ON p.property_id = b.property_id AND p.owner_id = b.owner_id
      JOIN residents r ON r.resident_id = b.resident_id AND r.owner_id = b.owner_id
      JOIN rooms rm ON rm.room_id = b.room_id AND rm.property_id = b.property_id AND rm.owner_id = b.owner_id
      JOIN contracts ct ON ct.contract_id = b.contract_id AND ct.room_id = b.room_id
        AND ct.property_id = b.property_id AND ct.owner_id = b.owner_id
      WHERE b.owner_id = ${ownerId} AND b.property_id = ${propertyId} AND b.status = 'PENDING'
      ORDER BY b.service_date ASC, b.slot_start ASC, b.created_at ASC, b.booking_id ASC
      LIMIT 100
    `;
  }

  async decideAdminServiceBooking(
    ownerId: bigint,
    propertyId: bigint,
    bookingId: bigint,
    accountId: bigint,
    input: ResidentServiceBookingDecisionInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ResidentServiceBookingRow[]> `
        SELECT booking_id, owner_id, resident_id, property_id, room_id, contract_id,
          property_pricing_item_id AS service_id, quoted_price_version_id AS price_version_id,
          quoted_unit_price AS charge_amount, unit_snapshot,
          service_name_snapshot, to_char(service_date,'YYYY-MM-DD') AS service_date,
          to_char(slot_start,'HH24:MI') AS slot_start, to_char(slot_end,'HH24:MI') AS slot_end,
          slot_duration_minutes, status, decision_at, decision_note, flexible_service_charge_id,
          created_at
        FROM resident_service_bookings
        WHERE owner_id = ${ownerId} AND property_id = ${propertyId} AND booking_id = ${bookingId}
        FOR UPDATE
      `;
      const booking = rows[0];
      if (!booking) return null;

      const desiredStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      if (booking.status === desiredStatus) return { booking, replayed: true };
      if (booking.status !== "PENDING") throw serviceError(409, "Yêu cầu này đã được xử lý trước đó.");

      if (input.decision === "APPROVE") {
        const future = await tx.$queryRaw<Array<{ future: boolean }>> `
          SELECT (CAST(${booking.service_date} AS date) + CAST(${booking.slot_start} AS time)) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS future
        `;
        if (!future[0]?.future) throw serviceError(409, "Khung giờ đã bắt đầu nên không thể duyệt.");

        const service = await findResidentBookableService(tx, ownerId, booking.resident_id!, booking.service_id!, booking.service_date!, true);
        if (!service || service.service_mode !== "BOOKING" || !service.capacity_per_slot) throw serviceError(409, "Dịch vụ hoặc lịch đã ngừng hoạt động; không thể duyệt yêu cầu.");
        const currentSlot = scheduleSlots(service, booking.service_date!).find((slot) => slot.start === booking.slot_start);
        if (!currentSlot || currentSlot.end !== booking.slot_end) throw serviceError(409, "Khung giờ không còn khớp lịch hiện tại; hãy xử lý lại yêu cầu.");

        const eligible = await tx.$queryRaw<Array<{ eligible: boolean }>> `
          SELECT EXISTS (
            SELECT 1 FROM room_residents rr
            JOIN contracts ct ON ct.contract_id = rr.contract_id AND ct.room_id = rr.room_id
              AND ct.property_id = rr.property_id AND ct.owner_id = rr.owner_id
            WHERE rr.owner_id = ${ownerId} AND rr.resident_id = ${booking.resident_id}
              AND rr.property_id = ${propertyId} AND rr.room_id = ${booking.room_id}
              AND rr.contract_id = ${booking.contract_id} AND rr.status = 'active'
              AND rr.started_at <= CAST(${booking.service_date} AS date)
              AND (rr.ended_at IS NULL OR rr.ended_at >= CAST(${booking.service_date} AS date))
              AND ct.status = 'active' AND ct.start_date <= CAST(${booking.service_date} AS date)
              AND ct.end_date >= CAST(${booking.service_date} AS date)
          ) AS eligible
        `;
        if (!eligible[0]?.eligible) throw serviceError(409, "Hợp đồng hoặc thông tin cư trú không còn hiệu lực vào ngày đã chọn.");

        const usage = await tx.$queryRaw<Array<{ total: number }>> `
          SELECT count(*)::int AS total FROM resident_service_bookings
          WHERE owner_id = ${ownerId} AND property_pricing_item_id = ${booking.service_id}
            AND service_date = CAST(${booking.service_date} AS date) AND status IN ('PENDING', 'APPROVED')
            AND slot_start < CAST(${booking.slot_end} AS time) AND slot_end > CAST(${booking.slot_start} AS time)
        `;
        if ((usage[0]?.total ?? 0) > service.capacity_per_slot) throw serviceError(409, "Sức chứa hiện tại thấp hơn số yêu cầu đang giữ chỗ; hãy từ chối bớt yêu cầu trước khi duyệt.");

        const price = await tx.$queryRaw<Array<{ valid: boolean }>> `
          SELECT EXISTS (
            SELECT 1 FROM property_price_versions v
            WHERE v.property_price_version_id = ${booking.price_version_id}
              AND v.property_pricing_item_id = ${booking.service_id} AND v.owner_id = ${ownerId}
              AND v.property_id = ${propertyId} AND v.kind = 'FLEXIBLE_SERVICE'
              AND v.published_at IS NOT NULL AND v.effective_from <= CAST(${booking.service_date} AS date)
              AND v.unit_price = ${booking.charge_amount}
          ) AS valid
        `;
        if (!price[0]?.valid) throw serviceError(409, "Giá đã ghi nhận cho yêu cầu không còn hợp lệ; không thể duyệt.");

        const fingerprint = bookingChargeFingerprint({
          booking_id: String(booking.booking_id),
          owner_id: String(ownerId),
          property_id: String(propertyId),
          room_id: String(booking.room_id),
          contract_id: String(booking.contract_id),
          resident_id: String(booking.resident_id),
          service_id: String(booking.service_id),
          price_version_id: String(booking.price_version_id),
          unit_price: String(booking.charge_amount),
          service_date: booking.service_date!,
          slot_start: booking.slot_start!,
          slot_end: booking.slot_end!,
        });
        const charges = await tx.$queryRaw<Array<{ flexible_service_charge_id: bigint }>> `
          INSERT INTO flexible_service_charges (
            owner_id, property_id, room_id, contract_id, resident_id,
            property_pricing_item_id, kind, property_price_version_id, occurred_at,
            quantity, unit, unit_price_snapshot, amount, source_system, source_event_key,
            payload_fingerprint, status, actor_account_id
          ) VALUES (
            ${ownerId}, ${propertyId}, ${booking.room_id}, ${booking.contract_id}, ${booking.resident_id},
            ${booking.service_id}, 'FLEXIBLE_SERVICE', ${booking.price_version_id},
            (CAST(${booking.service_date} AS date) + CAST(${booking.slot_start} AS time)) AT TIME ZONE 'Asia/Ho_Chi_Minh',
            1.000, ${booking.unit_snapshot}, ${booking.charge_amount}, ${booking.charge_amount},
            'resident_service_booking', 'booking:' || CAST(${booking.booking_id} AS text), ${fingerprint}, 'READY', ${accountId}
          )
          RETURNING flexible_service_charge_id
        `;
        const chargeId = charges[0].flexible_service_charge_id;
        const changed = await tx.$queryRaw<ResidentServiceBookingRow[]> `
          UPDATE resident_service_bookings
          SET status = 'APPROVED', decision_by_account_id = ${accountId}, decision_at = now(),
            decision_note = ${input.reason}, flexible_service_charge_id = ${chargeId}
          WHERE booking_id = ${bookingId} AND owner_id = ${ownerId} AND property_id = ${propertyId} AND status = 'PENDING'
          RETURNING booking_id, service_name_snapshot, to_char(service_date,'YYYY-MM-DD') AS service_date,
            to_char(slot_start,'HH24:MI') AS slot_start, to_char(slot_end,'HH24:MI') AS slot_end,
            slot_duration_minutes, status, decision_at, decision_note, created_at,
            quoted_unit_price AS charge_amount, unit_snapshot, flexible_service_charge_id
        `;
        const residentAccount = await tx.account.findFirst({
          where: { residentId: booking.resident_id, role: "resident", status: "active" },
          select: { accountId: true },
        });
        if (residentAccount) await tx.notification.create({
          data: {
            accountId: residentAccount.accountId,
            notificationType: "service_booking_approved",
            title: "Yêu cầu đặt tiện ích đã được duyệt",
            body: booking.service_name_snapshot + " · " + booking.service_date + " · " + booking.slot_start + "–" + booking.slot_end + ". Phí " + booking.charge_amount?.toLocaleString("vi-VN") + " ₫ sẽ vào hóa đơn theo kỳ hợp đồng.",
          },
        });
        return { booking: changed[0], replayed: false };
      }

      const changed = await tx.$queryRaw<ResidentServiceBookingRow[]> `
        UPDATE resident_service_bookings
        SET status = 'REJECTED', decision_by_account_id = ${accountId}, decision_at = now(), decision_note = ${input.reason}
        WHERE booking_id = ${bookingId} AND owner_id = ${ownerId} AND property_id = ${propertyId} AND status = 'PENDING'
        RETURNING booking_id, service_name_snapshot, to_char(service_date,'YYYY-MM-DD') AS service_date,
          to_char(slot_start,'HH24:MI') AS slot_start, to_char(slot_end,'HH24:MI') AS slot_end,
          slot_duration_minutes, status, decision_at, decision_note, created_at,
          quoted_unit_price AS charge_amount, unit_snapshot
      `;
      const residentAccount = await tx.account.findFirst({
        where: { residentId: booking.resident_id, role: "resident", status: "active" },
        select: { accountId: true },
      });
      if (residentAccount) await tx.notification.create({
        data: {
          accountId: residentAccount.accountId,
          notificationType: "service_booking_rejected",
          title: "Yêu cầu đặt tiện ích chưa được duyệt",
          body: booking.service_name_snapshot + " · " + booking.service_date + " · " + booking.slot_start + "–" + booking.slot_end + (input.reason ? ". Lý do: " + input.reason : ".") + " Khung giờ đã được trả lại.",
        },
      });
      return { booking: changed[0], replayed: false };
    });
  }

  async cancelResidentServiceBooking(ownerId: bigint, residentId: bigint, accountId: bigint, bookingId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ResidentServiceBookingRow[]>`
        UPDATE resident_service_bookings
        SET status = 'CANCELLED', cancelled_at = now()
        WHERE booking_id = ${bookingId} AND owner_id = ${ownerId} AND resident_id = ${residentId}
          AND status = 'PENDING'
        RETURNING booking_id, service_name_snapshot, to_char(service_date,'YYYY-MM-DD') AS service_date,
          to_char(slot_start,'HH24:MI') AS slot_start, to_char(slot_end,'HH24:MI') AS slot_end,
          slot_duration_minutes, status, cancelled_at, decision_at, decision_note, created_at
      `;
      if (!rows[0]) {
        const owned = await tx.$queryRaw<Array<{ status: string }>> `
          SELECT status FROM resident_service_bookings
          WHERE booking_id = ${bookingId} AND owner_id = ${ownerId} AND resident_id = ${residentId}
        `;
        if (!owned[0]) return null;
        throw serviceError(409, "Yêu cầu đã được chủ trọ duyệt hoặc đã có quyết định nên không thể hủy ở đây.");
      }
      await tx.notification.create({
        data: {
          accountId,
          notificationType: "service_booking_cancelled",
          title: "Đã hủy yêu cầu đặt tiện ích",
          body: `${rows[0].service_name_snapshot} · ${rows[0].service_date} · ${rows[0].slot_start}–${rows[0].slot_end}. Khung giờ đã được trả lại.`,
        },
      });
      return rows[0];
    });
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
