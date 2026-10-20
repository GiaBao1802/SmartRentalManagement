import { apiRequest } from "../../lib/api/apiClient";
import type { PublicRoomListItem, PublicRoomListResponse, PublicRoomFilters } from "../../lib/api/publicRoomApi";
import { serializePublicRoomFilters } from "../../lib/api/publicRoomApi";

export type Province = { code: string; name: string; public_properties: number; public_rooms: number;
  system_properties: null; boarding_properties: null; apartment_properties: null };
export type Overview = { mode: "live" | "mock"; provinces: Province[]; unmapped_rooms: number; note: string };
export type GeoFeature = { properties: { code: string; name: string }; geometry: { type: "MultiPolygon"; coordinates: number[][][][] } };
export type Geography = { type: "FeatureCollection"; features: GeoFeature[] };
export const emptyFilters: PublicRoomFilters = { sort: "newest", page: 1, page_size: 6 };
export function overview() { return apiRequest<Overview>("/public/explorer", { authRequired: false }); }
export function rooms(code: string, filters: PublicRoomFilters) {
  const query = serializePublicRoomFilters(filters); query.set("province_code", code);
  return apiRequest<PublicRoomListResponse>(`/public/explorer/rooms?${query}`, { authRequired: false });
}

// Deliberately separate demo adapter. Never activated automatically on API failure.
const demoRooms: (PublicRoomListItem & { province_code: string })[] = [
  ["79", "Hồ Chí Minh", "Góc Trọ · Không gian mẫu", "Khu vực Thủ Đức (minh họa)", "3200000", "24.00", 2],
  ["79", "Hồ Chí Minh", "Góc Trọ · Không gian mẫu", "Khu vực Thủ Đức (minh họa)", "4500000", "35.00", 3],
  ["01", "Hà Nội", "Góc Trọ · Nhà mẫu Hà Nội", "Khu vực Cầu Giấy (minh họa)", "3800000", "28.00", 2],
  ["48", "Đà Nẵng", "Góc Trọ · Nhà mẫu Đà Nẵng", "Khu vực Hải Châu (minh họa)", "2800000", "22.00", 2],
  ["75", "Đồng Nai", "Góc Trọ · Nhà mẫu Đồng Nai", "Khu vực Biên Hòa (minh họa)", "2200000", "20.00", 2],
].map((r, i) => ({ province_code: String(r[0]), room_id: `demo-${i}`, room_code: `M${i + 101}`, property: { province: String(r[1]), name: String(r[2]), address: String(r[3]) }, default_rent: String(r[4]), area_m2: String(r[5]), default_capacity: Number(r[6]), status: "available", public_description: "Phòng minh họa để đánh giá tương tác, không phải tin cho thuê thực tế.", cover_image: null }));
export function demoOverview(geo: Geography): Overview {
  return { mode: "mock", unmapped_rooms: 0, note: "Dữ liệu minh họa riêng; không ghi vào PostgreSQL.", provinces: geo.features.map(f => {
    const rows = demoRooms.filter(r => r.province_code === f.properties.code);
    return { ...f.properties, public_rooms: rows.length, public_properties: new Set(rows.map(r => r.property.name)).size,
      system_properties: null, boarding_properties: null, apartment_properties: null };
  }) };
}
export function demoResults(code: string, f: PublicRoomFilters): PublicRoomListResponse {
  let data = demoRooms.filter(r => r.province_code === code && (!f.address || r.property.address.toLocaleLowerCase("vi").includes(f.address.toLocaleLowerCase("vi")))
    && (!f.price_min || BigInt(r.default_rent) >= BigInt(f.price_min)) && (!f.price_max || BigInt(r.default_rent) <= BigInt(f.price_max))
    && (!f.area_min || Number(r.area_m2) >= Number(f.area_min)) && (!f.area_max || Number(r.area_m2) <= Number(f.area_max))
    && (!f.capacity_min || r.default_capacity >= Number(f.capacity_min)));
  if (f.sort?.startsWith("price")) data = [...data].sort((a,b) => (Number(a.default_rent)-Number(b.default_rent)) * (f.sort === "price_desc" ? -1 : 1));
  if (f.sort?.startsWith("area")) data = [...data].sort((a,b) => (Number(a.area_m2)-Number(b.area_m2)) * (f.sort === "area_desc" ? -1 : 1));
  const total = data.length, page = f.page ?? 1, size = f.page_size ?? 6;
  return { data: data.slice((page-1)*size, page*size), meta: { page, page_size: size, total_items: total, total_pages: Math.ceil(total/size) } };
}
