import { apiRequest } from "./apiClient";

export type OwnerRoomReport = {
  property_id: string; property_name: string; province: string; room_id: string; room_code: string; room_status: string;
  is_active: boolean; area_m2: string; rent_amount: string; capacity: number; occupants: number; active_contracts: number; registration_incomplete: number;
  active_vehicles: number; vehicle_types: string[]; open_requests: number;
  latest_invoice: null | { period_start: string; period_end: string; status: string; electricity_kwh: number | null; water_m3: number | null };
};

export type OwnerOperationsReport = {
  generated_at: string;
  scope: { property_id: string | null; property_count: number };
  properties: Array<{ property_id: string; name: string; province: string; status: string }>;
  summary: {
    active_properties: number; active_rooms: number; occupied_rooms: number; available_rooms: number; occupancy_percent: number;
    current_residents: number; registration_incomplete: number; temporary_residents: number; temporary_absences: number;
    expiring_contracts_30_days: number; unpaid_invoices: number; overdue_invoices: number; unpaid_amount: string;
    open_requests: number; resolved_requests: number; active_vehicles: number;
  };
  financial: {
    basis: "invoice_period";
    current_month: string;
    current_month_rent_billed: string;
    current_month_rent_on_paid_invoices: string;
    unpaid_rent_amount: string;
    months: Array<{ month: string; rent_billed: string; rent_on_paid_invoices: string }>;
  };
  requests: { by_category: Array<{ category: string; count: number }>; busiest_rooms: Array<{ property_name: string; room_code: string; count: number }> };
  highest_electricity_rooms: OwnerRoomReport[];
  highest_water_rooms: OwnerRoomReport[];
  most_vehicles_rooms: OwnerRoomReport[];
  rooms: OwnerRoomReport[];
};

export const ownerReportApi = {
  overview(propertyId?: string) {
    const path = propertyId ? `/properties/${encodeURIComponent(propertyId)}/dashboard` : "/dashboard/summary";
    return apiRequest<OwnerOperationsReport>(path);
  },
};
