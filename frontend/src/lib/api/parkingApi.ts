import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";

export type ParkingPriceVersion = { property_price_version_id: string; version_no: number; effective_from: string; unit_price: string; source_name: string | null; reason: string | null; published_at: string };
export type ParkingPriceItem = { property_pricing_item_id: string; kind: "PARKING"; code: string; name: string; description: string | null; unit: string; status: "active" | "retired"; price_versions: ParkingPriceVersion[] };
export type ParkingResidentContext = { resident: { resident_id: string; full_name: string; phone: string | null }; room: { room_id: string; room_code: string }; contract: { contract_id: string; contract_no: string; status: string; start_date: string; end_date: string; termination_date: string | null; resident_capacity: number; representative_resident_id: string } };
export type ParkingVehicle = { vehicle_id: string; resident_id: string; vehicle_type: string; plate_number: string | null; resident: { resident_id: string; full_name: string }; assignments: { assignment_id: string }[] };
export type ParkingAssignment = { assignment_id: string; parking_slot_id: string; room_id: string; contract_id: string; resident_id: string; vehicle_id: string; started_at: string; ended_at: string | null; status: "active" | "ended" | "revoked"; entitlement_id: string | null; parking_slot: { slot_code: string; parking_area: { name: string } }; room: { room_code: string }; contract: { contract_no: string }; resident: { full_name: string }; vehicle: { vehicle_type: string; plate_number: string | null }; entitlement: { billability: "PAID" | "FREE" | "UNCLASSIFIED"; entitlement_type: string; name: string; pricing_item: ParkingPriceItem | null } | null };
export type ParkingArea = { parking_area_id: string; property_id: string; name: string; location: string | null; active: boolean; slots: ParkingSlot[] };
export type ParkingSlot = { parking_slot_id: string; parking_area_id: string; slot_code: string; status: "active" | "inactive"; assignments: { assignment_id: string }[] };
export type ParkingOverview = { property: { property_id: string; name: string }; areas: ParkingArea[]; slots: ParkingSlot[]; vehicles: number; assignments: ParkingAssignment[]; entitlements: { billability: "PAID" | "FREE" | "UNCLASSIFIED" }[]; parking_items: ParkingPriceItem[] };
export type ParkingBillability = "PAID" | "FREE" | "UNCLASSIFIED";
export type NewParkingAssignment = { parking_slot_id: string; room_id: string; contract_id: string; resident_id: string; vehicle_id: string; started_at: string; entitlement_type: string; billability: ParkingBillability; pricing_item_id: string | null };
const root = (propertyId: string) => `/properties/${encodeURIComponent(propertyId)}`;

export const parkingApi = {
  overview(propertyId: string) { return apiRequest<ParkingOverview>(`${root(propertyId)}/parking`); },
  areas(propertyId: string) { return apiRequest<ParkingArea[]>(`${root(propertyId)}/parking-areas`); },
  createArea(propertyId: string, input: { name: string; location?: string }) { return apiRequest<ParkingArea>(`${root(propertyId)}/parking-areas`, { method: "POST", body: JSON.stringify(input) }); },
  updateArea(areaId: string, input: { name?: string; location?: string | null; active?: boolean }) { return apiRequest<ParkingArea>(`/parking-areas/${encodeURIComponent(areaId)}`, { method: "PATCH", body: JSON.stringify(input) }); },
  createSlot(areaId: string, slot_code: string) { return apiRequest<ParkingSlot>(`/parking-areas/${encodeURIComponent(areaId)}/slots`, { method: "POST", body: JSON.stringify({ slot_code }) }); },
  updateSlot(slotId: string, status: "active" | "inactive") { return apiRequest<ParkingSlot>(`/parking-slots/${encodeURIComponent(slotId)}`, { method: "PATCH", body: JSON.stringify({ status }) }); },
  residents(propertyId: string) { return apiRequest<ParkingResidentContext[]>(`${root(propertyId)}/parking-residents`); },
  vehicles(propertyId: string) { return apiRequest<ParkingVehicle[]>(`${root(propertyId)}/vehicles`); },
  createVehicle(propertyId: string, input: { resident_id: string; vehicle_type: string; plate_number?: string }) { return apiRequest<ParkingVehicle>(`${root(propertyId)}/vehicles`, { method: "POST", body: JSON.stringify(input) }); },
  assignments(propertyId: string) { return apiRequest<ParkingAssignment[]>(`${root(propertyId)}/parking-assignments`); },
  createAssignment(propertyId: string, input: NewParkingAssignment) { return apiRequest<ParkingAssignment>(`${root(propertyId)}/parking-assignments`, { method: "POST", body: JSON.stringify(input) }); },
  classify(propertyId: string, assignmentId: string, input: { entitlement_type: string; billability: ParkingBillability; pricing_item_id: string | null }) { return apiRequest<ParkingAssignment>(`${root(propertyId)}/parking-assignments/${encodeURIComponent(assignmentId)}/entitlement`, { method: "PATCH", body: JSON.stringify(input) }); },
  endAssignment(assignmentId: string, ended_at: string) { return apiRequest<ParkingAssignment>(`/parking-assignments/${encodeURIComponent(assignmentId)}/end`, { method: "POST", body: JSON.stringify({ ended_at }) }); },
  pricing(propertyId: string) { return apiRequest<ParkingPriceItem[]>(`${root(propertyId)}/parking-pricing`); },
};
