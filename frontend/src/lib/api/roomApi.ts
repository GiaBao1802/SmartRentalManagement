import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";

export type RoomStatus = "available" | "occupied" | "inactive";
export const marketplaceAmenityOptions = [
  { code: "air_conditioning", label: "Máy lạnh" }, { code: "parking", label: "Bãi gửi xe" },
  { code: "wifi", label: "Wi-Fi" }, { code: "elevator", label: "Thang máy" },
  { code: "washing_machine", label: "Máy giặt" }, { code: "refrigerator", label: "Tủ lạnh" },
  { code: "water_heater", label: "Máy nước nóng" }, { code: "private_kitchen", label: "Bếp riêng" },
  { code: "private_bathroom", label: "Nhà vệ sinh riêng" }, { code: "balcony", label: "Ban công" },
  { code: "cats_allowed", label: "Cho nuôi mèo" }, { code: "dogs_allowed", label: "Cho nuôi chó" },
] as const;
export type MarketplaceAmenity = typeof marketplaceAmenityOptions[number]["code"];
export const marketplaceAmenityLabels: Record<string, string> = Object.fromEntries(marketplaceAmenityOptions.map(({ code, label }) => [code, label]));
export type Room = {
  room_id: string;
  owner_id: string;
  property_id: string;
  room_code: string;
  default_rent: string;
  area_m2: string;
  default_capacity: number;
  is_active: boolean;
  is_public: boolean;
  public_description: string | null;
  marketplace_amenities: MarketplaceAmenity[];
  status: RoomStatus;
  occupancy_count: number;
  contract_capacity: number | null;
  current_contract: { contract_id: string; contract_no: string; start_date: string; end_date: string; status: string } | null;
};
export type RoomList = { data: Room[]; meta: PageMeta };
export type RoomListStatus = RoomStatus;
export type RoomInput = {
  room_code: string;
  default_rent: string;
  area_m2: string;
  default_capacity: number;
  is_active: boolean;
  is_public: boolean;
  public_description?: string | null;
  marketplace_amenities?: MarketplaceAmenity[];
};
export type RoomPatch = Partial<RoomInput>;

export const roomApi = {
  list(propertyId: string, page: number, pageSize = 20, status?: RoomListStatus, search?: string) {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) query.set("status", status);
    if (search?.trim()) query.set("search", search.trim());
    return apiRequest<RoomList>(`/properties/${encodeURIComponent(propertyId)}/rooms?${query}`);
  },
  get(id: string) { return apiRequest<Room>(`/rooms/${encodeURIComponent(id)}`); },
  create(propertyId: string, input: RoomInput) { return apiRequest<Room>(`/properties/${encodeURIComponent(propertyId)}/rooms`, { method: "POST", body: JSON.stringify(input) }); },
  update(id: string, input: RoomPatch) { return apiRequest<Room>(`/rooms/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); },
  reactivate(id: string) { return apiRequest<Room>(`/rooms/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ is_active: true }) }); },
  deactivate(id: string) { return apiRequest<Room>(`/rooms/${encodeURIComponent(id)}`, { method: "DELETE" }); },
};
