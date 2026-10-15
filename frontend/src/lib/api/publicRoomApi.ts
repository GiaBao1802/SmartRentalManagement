import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";

export type PublicRoomImage = { image_id: string; url: string; is_cover?: boolean; sort_order?: number };
export type PublicRoomListItem = {
  room_id: string;
  room_code: string;
  property: { name: string; province: string; address: string };
  default_rent: string;
  area_m2: string;
  default_capacity: number;
  status: "available";
  public_description: string | null;
  cover_image: { image_id: string; url: string } | null;
};
export type PublicRoomDetail = Omit<PublicRoomListItem, "cover_image"> & {
  cover_image: { image_id: string; url: string } | null;
  images: PublicRoomImage[];
};
export type PublicRoomListResponse = { data: PublicRoomListItem[]; meta: PageMeta };
export type PublicRoomFilters = {
  province?: string;
  address?: string;
  price_min?: string;
  price_max?: string;
  area_min?: string;
  area_max?: string;
  capacity_min?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "area_asc" | "area_desc";
  page?: number;
  page_size?: number;
};
export type PublicContactRequestInput = {
  room_id: string;
  requester_name: string;
  phone: string;
  email?: string;
  message?: string;
};
export type PublicContactRequestAck = { contact_request_id: string; status: "new" };

export type ContactRequestStatus = "new" | "contacted" | "closed";
export type AdminContactRequest = {
  contact_request_id: string;
  property_id: string;
  room_id: string | null;
  requester_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: ContactRequestStatus;
  created_at: string;
  updated_at: string;
  property: { property_id: string; name: string; province: string; address: string };
  room: { room_id: string; room_code: string } | null;
};
export type AdminContactRequestList = { data: AdminContactRequest[]; meta: PageMeta };
export type AdminContactRequestFilters = { page?: number; page_size?: number; property_id?: string; status?: ContactRequestStatus; created_at?: string };

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
const apiBase = new URL(apiBaseUrl);
const apiBasePath = apiBase.pathname.replace(/\/$/, "");
const publicRoomFilterKeys = ["province", "address", "price_min", "price_max", "area_min", "area_max", "capacity_min", "sort"] as const;

export function serializePublicRoomFilters(filters: PublicRoomFilters): URLSearchParams {
  const query = new URLSearchParams();
  query.set("page", String(filters.page ?? 1));
  query.set("page_size", String(filters.page_size ?? 20));
  for (const key of publicRoomFilterKeys) {
    const value = filters[key];
    if (typeof value === "string" && value.trim()) query.set(key, value.trim());
  }
  return query;
}

export function resolvePublicRoomImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    const imageUrl = new URL(path, `${apiBaseUrl}/`);
    if (imageUrl.origin !== apiBase.origin) return null;
    const imagePath = imageUrl.pathname;
    const publicImagePrefix = `${apiBasePath}/public/room-images/`;
    if (!imagePath.startsWith(publicImagePrefix)) return null;
    const imageId = imagePath.slice(publicImagePrefix.length);
    return /^\d+$/.test(imageId) ? `/api/public/room-images/${imageId}` : null;
  }
  catch { return null; }
}

export function listPublicRooms(filters: PublicRoomFilters = {}) {
  return apiRequest<PublicRoomListResponse>(`/public/rooms?${serializePublicRoomFilters(filters)}`, { authRequired: false });
}

export function getPublicRoom(roomId: string) {
  return apiRequest<PublicRoomDetail>(`/public/rooms/${encodeURIComponent(roomId)}`, { authRequired: false });
}

export function createPublicContactRequest(input: PublicContactRequestInput) {
  return apiRequest<PublicContactRequestAck>("/public/contact-requests", { method: "POST", authRequired: false, body: JSON.stringify(input) });
}

export const publicRoomApi = { list: listPublicRooms, get: getPublicRoom, contact: createPublicContactRequest };

export const adminContactRequestApi = {
  list(filters: AdminContactRequestFilters = {}) {
    const query = new URLSearchParams({ page: String(filters.page ?? 1), page_size: String(filters.page_size ?? 20) });
    if (filters.property_id) query.set("property_id", filters.property_id);
    if (filters.status) query.set("status", filters.status);
    if (filters.created_at) query.set("created_at", filters.created_at);
    return apiRequest<AdminContactRequestList>(`/contact-requests?${query}`);
  },
  get(id: string) { return apiRequest<AdminContactRequest>(`/contact-requests/${encodeURIComponent(id)}`); },
  updateStatus(id: string, status: ContactRequestStatus) {
    return apiRequest<AdminContactRequest>(`/contact-requests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  },
};
