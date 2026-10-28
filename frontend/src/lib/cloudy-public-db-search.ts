import { isFilterContext, type FilterContext } from "./cloudy-filter-context";
export type LiveRoom = { room_id: string; room_code: string; property: { name: string; province: string; address: string }; default_rent: string; area_m2: string; default_capacity: number };
type ListResponse = { data: LiveRoom[]; meta: { total_items: number; total_pages: number; page: number; page_size: number } };
type Fetcher = typeof fetch;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();
function isLiveRoom(value: unknown): value is LiveRoom {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<LiveRoom>;
  const property = room.property;
  return typeof room.room_id === "string" && /^\d+$/.test(room.room_id)
    && typeof room.room_code === "string" && room.room_code.length > 0
    && !!property && typeof property === "object"
    && typeof property.name === "string" && typeof property.province === "string" && typeof property.address === "string"
    && typeof room.default_rent === "string" && Number.isFinite(Number(room.default_rent)) && Number(room.default_rent) >= 0
    && typeof room.area_m2 === "string" && Number.isFinite(Number(room.area_m2)) && Number(room.area_m2) > 0
    && Number.isSafeInteger(room.default_capacity) && Number(room.default_capacity) > 0;
}
function bounds(terms: FilterContext["price"] | FilterContext["area"], scale: number) {
  let min: number | undefined; let max: number | undefined;
  for (const term of terms) {
    const scaled = term.value * scale;
    if (!Number.isSafeInteger(scaled)) throw new Error("Unsupported filter precision");
    if (term.op === "gt") min = Math.max(min ?? -Infinity, scaled + 1);
    if (term.op === "gte") min = Math.max(min ?? -Infinity, scaled);
    if (term.op === "eq") { min = Math.max(min ?? -Infinity, scaled); max = Math.min(max ?? Infinity, scaled); }
    if (term.op === "lt") max = Math.min(max ?? Infinity, scaled - 1);
    if (term.op === "lte") max = Math.min(max ?? Infinity, scaled);
  }
  return { min, max };
}
function fmtArea(cents: number) { return (cents / 100).toFixed(2).replace(/\.00$/, ""); }
function contextSummary(f: FilterContext) {
  const parts: string[] = []; const symbols: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=" };
  if (f.location) parts.push(`khu vực ${f.location}`);
  for (const [field, label, unit] of [[f.price, "giá", "đ/tháng"], [f.area, "diện tích", "m²"]] as const) for (const c of field) parts.push(`${label} ${symbols[c.op]} ${c.value.toLocaleString("vi-VN")} ${unit}`);
  if (f.occupants) parts.push(`sức chứa từ ${f.occupants} người`);
  const amenityLabels: Record<string, string> = { air_conditioning: "máy lạnh/điều hòa", parking: "bãi gửi xe", wifi: "wifi", elevator: "thang máy", washing_machine: "máy giặt", refrigerator: "tủ lạnh", water_heater: "máy nước nóng", private_kitchen: "bếp riêng", private_bathroom: "nhà vệ sinh riêng", balcony: "ban công", unspecified_amenity: "tiện ích", cats_allowed: "nuôi mèo", dogs_allowed: "nuôi chó" };
  for (const amenity of f.amenities) parts.push(`có ${amenityLabels[amenity]}`);
  return parts.join("; ") || "mọi điều kiện đang hỗ trợ";
}
function empty(context: FilterContext) { return { text: `Hiện không có phòng đang công khai khớp toàn bộ điều kiện trên database. Mình chưa tự nới điều kiện.\n\nĐã xác nhận: ${contextSummary(context)}`, source: "public_database" as const, model: "qwen3:1.7b" as const, status: "no_matches" as const, context }; }
export async function searchPublicDatabaseRooms(context: FilterContext, signal: AbortSignal, fetchImpl: Fetcher = fetch, configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1") {
  if (!isFilterContext(context)) throw new Error("Invalid filter context");
  if (context.amenities.length) {
    const labels: Record<string, string> = { air_conditioning: "máy lạnh/điều hòa", parking: "bãi gửi xe", wifi: "wifi", elevator: "thang máy", washing_machine: "máy giặt", refrigerator: "tủ lạnh", water_heater: "máy nước nóng", private_kitchen: "bếp riêng", private_bathroom: "nhà vệ sinh riêng", balcony: "ban công", unspecified_amenity: "tiện ích", cats_allowed: "nuôi mèo", dogs_allowed: "nuôi chó" };
    const requested = context.amenities.map(amenity => labels[amenity]).join(", ");
    return { text: `Mình hiểu yêu cầu: ${contextSummary(context)}. Tuy nhiên, tin phòng công khai hiện chưa có dữ liệu đã xác minh cho tiện ích ${requested}, nên mình chưa thể lọc hoặc khẳng định phòng nào có các tiện ích này. Hiện mình lọc được khu vực, giá thuê, diện tích và sức chứa. Bạn có thể chọn “Sửa yêu cầu” để bỏ tiện ích rồi tiếp tục.`, source: "public_database" as const, model: "qwen3:1.7b" as const, status: "needs_clarification" as const, context: null };
  }
  const base = new URL(configuredBase);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || !["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Public API must use a loopback URL in the local demo");
  base.pathname = `${base.pathname.replace(/\/$/, "")}/`;
  const rent = bounds(context.price, 1); const area = bounds(context.area, 100);
  if ((rent.min !== undefined && rent.min > 9_223_372_036_854_775_807) || (rent.max !== undefined && rent.max < 0) || (area.min !== undefined && area.min > 99_999_999) || (area.max !== undefined && area.max < 1) || (rent.min !== undefined && rent.max !== undefined && rent.min > rent.max) || (area.min !== undefined && area.max !== undefined && area.min > area.max)) return empty(context);
  const query = new URLSearchParams({ page: "1", page_size: "100", sort: "price_asc" });
  if (rent.min !== undefined) query.set("price_min", String(rent.min)); if (rent.max !== undefined) query.set("price_max", String(rent.max));
  if (area.min !== undefined) query.set("area_min", fmtArea(area.min)); if (area.max !== undefined) query.set("area_max", fmtArea(area.max));
  if (context.occupants !== null) query.set("capacity_min", String(context.occupants));
  const firstUrl = new URL(`public/rooms?${query}`, base); const rows: LiveRoom[] = []; let total = 0; let totalPages = 0; let pageSize = 0;
  for (let page = 1; page <= 10; page++) {
    const url = new URL(firstUrl); url.searchParams.set("page", String(page));
    const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal });
    if (!response.ok) throw new Error("Public database API unavailable");
    const body = await response.json() as ListResponse;
    if (!body || !Array.isArray(body.data) || !body.meta || !Number.isSafeInteger(body.meta.total_items) || body.meta.total_items < 0
      || !Number.isSafeInteger(body.meta.total_pages) || body.meta.total_pages < 0 || !Number.isSafeInteger(body.meta.page_size) || body.meta.page_size < 1
      || body.meta.page !== page || body.data.length > body.meta.page_size || !body.data.every(isLiveRoom)
      || body.meta.total_pages !== Math.ceil(body.meta.total_items / body.meta.page_size)) throw new Error("Invalid public database response");
    if (page === 1) {
      total = body.meta.total_items; totalPages = body.meta.total_pages; pageSize = body.meta.page_size;
      if (totalPages > 10) throw new Error("Public result exceeds safe scan limit");
    } else if (body.meta.total_items !== total || body.meta.total_pages !== totalPages || body.meta.page_size !== pageSize) throw new Error("Public result changed during pagination");
    rows.push(...body.data);
    if (page >= totalPages) break;
    if (page === 10) throw new Error("Public result exceeds safe scan limit");
  }
  const needle = context.location ? normalize(context.location) : null;
  const matches = rows.filter(room => !needle || normalize(`${room.property.province} ${room.property.address}`).includes(needle));
  const cards = matches.slice(0, 5).map(room => ({ id: room.room_id, name: room.room_code, property: room.property.name, province: room.property.province, rent: Number(room.default_rent), area: Number(room.area_m2), capacity: room.default_capacity }));
  const summary = contextSummary(context);
  const resultQuery = new URLSearchParams(query);
  resultQuery.set("page", "1"); resultQuery.set("page_size", "12");
  if (context.location) resultQuery.set("location", context.location);
  const text = matches.length
    ? `Mình tìm thấy ${matches.length} phòng đang công khai trong dữ liệu hiện tại. Đây là tối đa 5 phòng, xếp theo giá thuê tăng dần:\n\n${cards.map(c => `• ${c.property} · Phòng ${c.name} — ${c.province}\n${c.rent.toLocaleString("vi-VN")} đ/cả phòng/tháng · ${c.area} m² · tối đa ${c.capacity} người\n[[room:${c.id}]]`).join("\n\n")}\n\n[[results:${encodeURIComponent(resultQuery.toString())}]]\n\nGiá chưa gồm điện nước/phí. Kết quả là tin đang công khai lúc tra cứu, chưa phải xác nhận đặt phòng.\n\nĐã xác nhận: ${summary}`
    : `Hiện không có phòng đang công khai khớp toàn bộ điều kiện trên database. Mình chưa tự nới điều kiện.\n\nĐã xác nhận: ${summary}`;
  return { text, source: "public_database" as const, model: "qwen3:1.7b" as const, status: matches.length ? "preview" as const : "no_matches" as const, context };
}
