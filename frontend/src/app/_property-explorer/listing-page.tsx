import type { Metadata } from "next";
import Explorer from "./explorer";
import "./explorer.css";
import type { PublicRoomFilters } from "../../lib/api/publicRoomApi";

export const metadata: Metadata = { title: "Tìm phòng · Bản đồ Việt Nam", description: "Khám phá phòng đang cho thuê trên bản đồ 34 tỉnh thành, lọc giá, diện tích và xem chi tiết phòng công khai." };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function positivePage(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : fallback;
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
    sort,
    page: positivePage(first(query.page), 1),
    page_size: pageSize,
  };
  return <Explorer initialFilters={Object.keys(query).length ? initialFilters : undefined} />;
}
