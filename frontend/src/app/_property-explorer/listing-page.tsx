import type { Metadata } from "next";
import Explorer from "./explorer";
import "./explorer.css";
import type { PublicRoomFilters } from "../../lib/api/publicRoomApi";
import { marketplaceAmenityOptions, type MarketplaceAmenity } from "../../lib/api/roomApi";

export const metadata: Metadata = { title: "Tìm phòng · Bản đồ Việt Nam", description: "Khám phá phòng đang cho thuê trên bản đồ 34 tỉnh thành, lọc giá, diện tích và xem chi tiết phòng công khai." };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function positivePage(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : fallback;
}
function parsedAmenities(value: string | undefined): MarketplaceAmenity[] | undefined {
  if (!value) return undefined;
  const supported = new Set<string>(marketplaceAmenityOptions.map(({ code }) => code));
  const values = value.split(",");
  if (values.length > supported.size || values.some(code => !supported.has(code)) || new Set(values).size !== values.length) return undefined;
  return values as MarketplaceAmenity[];
}
function parsedPropertyFacilities(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 10 || values.some(name => !name.trim() || name.trim().length > 150) || new Set(values.map(name => name.trim().toLocaleLowerCase("vi"))).size !== values.length) return undefined;
  return values.map(name => name.trim());
}

export default async function PublicRoomsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const rawSort = first(query.sort);
  const sort = ["newest", "price_asc", "price_desc", "area_asc", "area_desc"].includes(rawSort ?? "") ? rawSort as PublicRoomFilters["sort"] : "newest";
  const parsedPageSize = positivePage(first(query.page_size), 12);
  const pageSize = parsedPageSize <= 100 ? parsedPageSize : 12;
  const initialFilters: PublicRoomFilters = {
    province: first(query.province)?.slice(0, 120),
    address: first(query.address)?.slice(0, 200),
    location: first(query.location)?.slice(0, 100),
    price_min: first(query.price_min)?.slice(0, 19),
    price_max: first(query.price_max)?.slice(0, 19),
    area_min: first(query.area_min)?.slice(0, 12),
    area_max: first(query.area_max)?.slice(0, 12),
    capacity_min: first(query.capacity_min)?.slice(0, 7),
    amenities: parsedAmenities(first(query.amenities)),
    property_facilities: parsedPropertyFacilities(query.property_facilities),
    sort,
    page: positivePage(first(query.page), 1),
    page_size: pageSize,
  };
  return <Explorer initialFilters={Object.keys(query).length ? initialFilters : undefined} />;
}
