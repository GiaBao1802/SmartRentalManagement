import { validationError } from "../middleware/api-error.js";

export const MARKETPLACE_AMENITIES = {
  air_conditioning: "Máy lạnh",
  parking: "Bãi gửi xe",
  wifi: "Wi-Fi",
  elevator: "Thang máy",
  washing_machine: "Máy giặt",
  refrigerator: "Tủ lạnh",
  water_heater: "Máy nước nóng",
  private_kitchen: "Bếp riêng",
  private_bathroom: "Nhà vệ sinh riêng",
  balcony: "Ban công",
  cats_allowed: "Cho nuôi mèo",
  dogs_allowed: "Cho nuôi chó",
} as const;
export type MarketplaceAmenityCode = keyof typeof MARKETPLACE_AMENITIES;

export function parseMarketplaceAmenities(value: unknown): MarketplaceAmenityCode[] {
  if (!Array.isArray(value) || value.length > 12 || value.some((item) => typeof item !== "string" || !Object.hasOwn(MARKETPLACE_AMENITIES, item))) {
    throw validationError("marketplace_amenities chỉ nhận danh sách tiện ích được hỗ trợ.");
  }
  const distinct = [...new Set(value as string[])];
  if (distinct.length !== value.length) throw validationError("marketplace_amenities không được lặp tiện ích.");
  return distinct as MarketplaceAmenityCode[];
}

export function parseMarketplaceAmenityFilter(value: unknown): MarketplaceAmenityCode[] {
  if (typeof value !== "string") throw validationError("amenities không hợp lệ.");
  return parseMarketplaceAmenities(value ? value.split(",") : []);
}
