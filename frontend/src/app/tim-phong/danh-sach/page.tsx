import type { Metadata } from "next";
import MarketplaceSearchResults from "../../_property-explorer/marketplace-search-results";
import type { PublicRoomFilters } from "../../../lib/api/publicRoomApi";
import { marketplaceAmenityOptions, type MarketplaceAmenity } from "../../../lib/api/roomApi";

export const metadata: Metadata = {
  title: "Danh sách phòng đang cho thuê · Góc Trọ",
  description: "Lọc, so sánh và xem chi tiết các phòng trọ đang được công khai trên Góc Trọ.",
};

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function boundedInteger(value: string | undefined, fallback: number, max = 1_000_000) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
}
function parsedAmenities(value: string | undefined): MarketplaceAmenity[] | undefined {
  if (!value) return undefined;
  const supported = new Set<string>(marketplaceAmenityOptions.map(item => item.code));
  const codes = value.split(",");
  if (codes.length > supported.size || codes.some(code => !supported.has(code)) || new Set(codes).size !== codes.length) return undefined;
  return codes as MarketplaceAmenity[];
}
function parsedPropertyFacilities(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 10 || values.some(name => !name.trim() || name.trim().length > 150) || new Set(values.map(name => name.trim().toLocaleLowerCase("vi"))).size !== values.length) return undefined;
  return values.map(name => name.trim());
}

export default async function MarketplaceSearchResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const requestedSort = first(query.sort);
  const sort = ["newest", "price_asc", "price_desc", "area_asc", "area_desc"].includes(requestedSort ?? "") ? requestedSort as PublicRoomFilters["sort"] : "newest";
  const requestedPageSize = boundedInteger(first(query.page_size), 12, 48);
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
    page: boundedInteger(first(query.page), 1),
    page_size: [12, 24, 48].includes(requestedPageSize) ? requestedPageSize : 12,
  };
  return <MarketplaceSearchResults initialFilters={initialFilters} />;
}
