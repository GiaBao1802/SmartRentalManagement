import type { Property } from "../../../lib/api/propertyApi";
import type { Room } from "../../../lib/api/roomApi";
import type { Resident } from "../../../lib/api/residentApi";
import { invoiceLifecycleLabel } from "../../../lib/invoice-status";

export type BusinessOption = { id: string; label: string; description?: string };

export function normalizeBusinessSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi").trim();
}

export function propertyOption(property: Property): BusinessOption {
  return { id: property.property_id, label: property.name, description: [property.address, property.province].filter(Boolean).join(" · ") };
}

export function filterProperties(properties: Property[], query: string) {
  const needle = normalizeBusinessSearch(query);
  if (!needle) return properties;
  return properties.filter((property) => normalizeBusinessSearch([property.name, property.address, property.province].filter(Boolean).join(" ")).includes(needle));
}

export function roomOption(room: Room): BusinessOption {
  return { id: room.room_id, label: room.room_code, description: "Phòng" };
}

export function residentOption(resident: Resident): BusinessOption {
  return { id: resident.resident_id, label: resident.full_name, description: [resident.national_id, resident.phone].filter(Boolean).join(" · ") || "Chưa có CCCD hoặc số điện thoại" };
}

export function filterResidents(residents: Resident[], query: string) {
  const needle = normalizeBusinessSearch(query);
  if (!needle) return residents;
  return residents.filter((resident) => normalizeBusinessSearch([resident.full_name, resident.national_id, resident.phone].filter(Boolean).join(" ")).includes(needle));
}

export function invoiceResidentLabel(residentId: string | null, residents: Array<{ resident_id: string; full_name: string }>) {
  if (!residentId) return "Chưa gán cư dân đại diện";
  const resident = residents.find((item) => item.resident_id === residentId);
  return resident?.full_name ?? "Cư dân không còn trong danh sách";
}

export function filtersForInvoiceApi(input: {
  property: BusinessOption | null; room: BusinessOption | null; resident: BusinessOption | null;
  status: "draft" | "unpaid" | "paid" | ""; periodStart: string; periodEnd: string;
}) {
  return {
    ...(input.property ? { property_id: input.property.id } : {}),
    ...(input.room ? { room_id: input.room.id } : {}),
    ...(input.resident ? { resident_id: input.resident.id } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.periodStart ? { period_start: input.periodStart } : {}),
    ...(input.periodEnd ? { period_end: input.periodEnd } : {}),
  };
}

export function statusLabel(status: "draft" | "unpaid" | "paid") {
  return invoiceLifecycleLabel(status);
}
