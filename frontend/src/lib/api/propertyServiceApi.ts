import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";

export type ServiceKind = "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
export type ServicePriceVersion = { price_version_id: string; version_no: number; effective_from: string; unit_price: string; source_name: string | null; source_reference: string | null; reason: string | null; published_at: string };
export type PropertyPricingItem = { pricing_item_id: string; kind: ServiceKind; code: string; name: string; description: string | null; unit: string; status: "active" | "retired"; created_at?: string; price_versions: ServicePriceVersion[]; current_price_version: ServicePriceVersion | null };
export type PropertyServiceList = { property: { property_id: string; name: string }; items: PropertyPricingItem[] };
export type FlexibleServiceCharge = { flexible_service_charge_id: string; property_id: string; room_id: string; contract_id: string; resident_id: string | null; service: { code: string; name: string }; room_code?: string; contract_no?: string; resident_name: string | null; quantity: string; unit: string; unit_price_snapshot: string; amount: string; occurred_at: string; status: "READY" | "INVOICED" | "VOID"; invoice_id: string | null; source_system: string; source_event_key: string };
export type ChargePage = { data: FlexibleServiceCharge[]; meta: PageMeta };
export type NewPricingItem = { kind: ServiceKind; code: string; name: string; description?: string; unit: string };
export type NewServicePrice = { effective_from: string; unit_price: string; source_name?: string; source_reference?: string; reason?: string };
export type NewFlexibleCharge = { room_id: string; contract_id: string; resident_id?: string | null; pricing_item_id: string; quantity: string; occurred_at: string };

export const propertyServiceApi = {
  list(propertyId: string, kind?: ServiceKind) { const query = kind ? `?kind=${encodeURIComponent(kind)}` : ""; return apiRequest<PropertyServiceList>(`/properties/${encodeURIComponent(propertyId)}/pricing-items${query}`); },
  create(propertyId: string, input: NewPricingItem) { return apiRequest<PropertyPricingItem>(`/properties/${encodeURIComponent(propertyId)}/pricing-items`, { method: "POST", body: JSON.stringify(input) }); },
  retire(propertyId: string, itemId: string, kind: ServiceKind) { return apiRequest<PropertyPricingItem>(`/properties/${encodeURIComponent(propertyId)}/pricing-items/${encodeURIComponent(itemId)}/retire?kind=${kind}`, { method: "POST", body: "{}" }); },
  publishPrice(propertyId: string, itemId: string, kind: ServiceKind, input: NewServicePrice) { return apiRequest<ServicePriceVersion>(`/properties/${encodeURIComponent(propertyId)}/pricing-items/${encodeURIComponent(itemId)}/price-versions?kind=${kind}`, { method: "POST", body: JSON.stringify(input) }); },
  listCharges(propertyId: string, page = 1, pageSize = 20) { return apiRequest<ChargePage>(`/properties/${encodeURIComponent(propertyId)}/flexible-service-charges?page=${page}&page_size=${pageSize}`); },
  createCharge(propertyId: string, input: NewFlexibleCharge, idempotencyKey: string) { return apiRequest<FlexibleServiceCharge>(`/properties/${encodeURIComponent(propertyId)}/flexible-service-charges`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) }); },
};
