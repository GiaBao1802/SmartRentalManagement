import { apiRequest } from "./apiClient";

export type PropertyStatus = "active" | "building" | "paused" | "archived";
export type Property = {
  property_id: string;
  owner_id: string;
  property_code: string;
  name: string;
  province: string;
  address: string;
  manager_name: string | null;
  status: PropertyStatus;
  created_at: string;
  updated_at: string;
};
export type PageMeta = { page: number; page_size: number; total_items: number; total_pages: number };
export type PropertyList = { data: Property[]; meta: PageMeta };
export type PropertyInput = { property_code: string; name: string; province: string; address: string; manager_name?: string };
export type PropertyPatch = Partial<Pick<Property, "name" | "province" | "address" | "manager_name" | "status">>;

export const propertyApi = {
  list(params: { page: number; page_size: number; status?: string; province?: string; search?: string }) {
    const query = new URLSearchParams({ page: String(params.page), page_size: String(params.page_size) });
    if (params.status) query.set("status", params.status);
    if (params.province) query.set("province", params.province);
    if (params.search) query.set("search", params.search);
    return apiRequest<PropertyList>(`/properties?${query}`);
  },
  get(id: string) { return apiRequest<Property>(`/properties/${encodeURIComponent(id)}`); },
  create(input: PropertyInput) { return apiRequest<Property>("/properties", { method: "POST", body: JSON.stringify(input) }); },
  update(id: string, input: PropertyPatch) { return apiRequest<Property>(`/properties/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); },
  archive(id: string) { return apiRequest<Property>(`/properties/${encodeURIComponent(id)}`, { method: "DELETE" }); },
};
