import { apiRequest } from "./apiClient";

export type ResidentService = {
  service_id: string;
  name: string;
  description: string | null;
  unit: string;
  current_price: { unit_price: string; effective_from: string } | null;
  service_configuration: {
    service_mode: "BOOKING" | "SUBSCRIPTION";
    available_weekdays: number[];
    opens_at: string;
    closes_at: string;
    booking: { slot_duration_minutes: number; capacity_per_slot: number } | null;
    subscription: { duration_count: number; duration_unit: "MONTH" | "YEAR" } | null;
  } | null;
};

export type ResidentServiceProperty = {
  property_id: string;
  property_name: string;
  services: ResidentService[];
};

export type ResidentServiceSlot = { start_time: string; end_time: string; remaining_capacity: number };
export type ResidentServiceAvailability = {
  service_id: string;
  service_date: string;
  timezone: "Asia/Ho_Chi_Minh";
  unit: string;
  unit_price: string | null;
  price_effective_from: string | null;
  slots: ResidentServiceSlot[];
};
export type ResidentServiceBooking = {
  booking_id: string;
  service_name: string;
  property_name?: string;
  service_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  amount: string | null;
  unit: string | null;
  invoice_no: string | null;
  invoice_status: "draft" | "unpaid" | "paid" | null;
  decision_note: string | null;
  can_cancel: boolean;
  can_approve: boolean;
  resident_name?: string;
  room_code?: string;
  contract_no?: string;
  cancelled_at: string | null;
  created_at?: string;
};

export const residentServiceApi = {
  list() {
    return apiRequest<ResidentServiceProperty[]>("/me/services");
  },
  availability(serviceId: string, date: string) {
    return apiRequest<ResidentServiceAvailability>(`/me/services/${encodeURIComponent(serviceId)}/availability?date=${encodeURIComponent(date)}`);
  },
  book(serviceId: string, serviceDate: string, startTime: string) {
    return apiRequest<ResidentServiceBooking>(`/me/services/${encodeURIComponent(serviceId)}/bookings`, { method: "POST", body: JSON.stringify({ service_date: serviceDate, start_time: startTime }) });
  },
  bookings() {
    return apiRequest<ResidentServiceBooking[]>("/me/service-bookings");
  },
  cancel(bookingId: string) {
    return apiRequest<ResidentServiceBooking>(`/me/service-bookings/${encodeURIComponent(bookingId)}/cancel`, { method: "POST", body: "{}" });
  },
};
