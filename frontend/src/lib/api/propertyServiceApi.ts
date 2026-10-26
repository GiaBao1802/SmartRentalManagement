import { apiRequest } from "./apiClient";

export type ServiceKind = "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
export type ServicePriceVersion = { price_version_id: string; version_no: number; effective_from: string; unit_price: string; source_name: string | null; source_reference: string | null; reason: string | null; published_at: string };
export type FlexibleServiceConfiguration = {
  service_mode: "BOOKING" | "SUBSCRIPTION";
  available_weekdays: number[];
  opens_at: string;
  closes_at: string;
  booking: { slot_duration_minutes: number; capacity_per_slot: number } | null;
  subscription: { duration_count: number; duration_unit: "MONTH" | "YEAR" } | null;
};
export type FlexibleServiceConfigurationInput =
  | { service_mode: "BOOKING"; available_weekdays: number[]; opens_at: string; closes_at: string; booking: { slot_duration_minutes: number; capacity_per_slot: number } }
  | { service_mode: "SUBSCRIPTION"; available_weekdays: number[]; opens_at: string; closes_at: string; subscription: { duration_count: number; duration_unit: "MONTH" | "YEAR" } };
export type PropertyPricingItem = { pricing_item_id: string; kind: ServiceKind; code: string; name: string; description: string | null; unit: string; status: "active" | "retired"; created_at?: string; price_versions: ServicePriceVersion[]; current_price_version: ServicePriceVersion | null; service_configuration: FlexibleServiceConfiguration | null };
export type PropertyServiceList = { property: { property_id: string; name: string }; items: PropertyPricingItem[] };
export type NewPricingItem = { kind: "FIXED_SERVICE" | "PARKING"; code: string; name: string; description?: string; unit: string } | { kind: "FLEXIBLE_SERVICE"; code: string; name: string; description?: string; service_configuration: FlexibleServiceConfigurationInput };
export type NewServicePrice = { effective_from: string; unit_price: string; source_name?: string; source_reference?: string; reason?: string };

export const propertyServiceApi = {
  list(propertyId: string, kind?: ServiceKind) { const query = kind ? `?kind=${encodeURIComponent(kind)}` : ""; return apiRequest<PropertyServiceList>(`/properties/${encodeURIComponent(propertyId)}/pricing-items${query}`); },
  create(propertyId: string, input: NewPricingItem) { return apiRequest<PropertyPricingItem>(`/properties/${encodeURIComponent(propertyId)}/pricing-items`, { method: "POST", body: JSON.stringify(input) }); },
  saveFlexibleConfiguration(propertyId: string, itemId: string, input: FlexibleServiceConfigurationInput) { return apiRequest<PropertyPricingItem>(`/properties/${encodeURIComponent(propertyId)}/pricing-items/${encodeURIComponent(itemId)}/service-configuration?kind=FLEXIBLE_SERVICE`, { method: "PUT", body: JSON.stringify(input) }); },
  retire(propertyId: string, itemId: string, kind: ServiceKind) { return apiRequest<PropertyPricingItem>(`/properties/${encodeURIComponent(propertyId)}/pricing-items/${encodeURIComponent(itemId)}/retire?kind=${kind}`, { method: "POST", body: "{}" }); },
  publishPrice(propertyId: string, itemId: string, kind: ServiceKind, input: NewServicePrice) { return apiRequest<ServicePriceVersion>(`/properties/${encodeURIComponent(propertyId)}/pricing-items/${encodeURIComponent(itemId)}/price-versions?kind=${kind}`, { method: "POST", body: JSON.stringify(input) }); },
};
