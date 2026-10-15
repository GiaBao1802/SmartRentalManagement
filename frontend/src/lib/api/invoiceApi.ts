import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";

export type InvoiceStatus = "draft" | "unpaid" | "paid";

export type InvoiceResource = {
  invoice_id: string;
  invoice_no: string;
  contract_id: string;
  property_id: string;
  owner_id: string;
  period_start: string;
  period_end: string;
  due_date: string | null;
  finalized_at: string | null;
  rent_amount: string;
  electricity_previous_kwh: string | null;
  electricity_current_kwh: string | null;
  electricity_amount: string;
  water_previous_m3: string | null;
  water_current_m3: string | null;
  water_amount: string;
  service_amount: string;
  total_amount: string;
  status: InvoiceStatus;
  revision: number;
  snapshot_kind: "NOT_FINALIZED" | "LEGACY_AGGREGATE" | "ITEMIZED";
  is_overdue: boolean;
  amount_provisional: boolean;
  contract: {
    contract_id: string;
    contract_no: string;
    room_id: string;
    property_id: string;
    room_code: string | null;
    representative_resident_id: string | null;
    property: { property_id: string; name: string; province: string; address: string } | null;
  } | null;
  payment_summary: { attempt_count: number; successful_amount: string; latest_status: string | null };
};

export type InvoiceListQuery = {
  page: number;
  page_size: number;
  property_id?: string;
  room_id?: string;
  resident_id?: string;
  status?: InvoiceStatus;
  period_start?: string;
  period_end?: string;
};

export type InvoiceListResponse = { data: InvoiceResource[]; meta: PageMeta };
export type BillingWorkspaceState = "UPCOMING" | "IN_PROGRESS" | "REMINDER_DUE" | "MISSING_DRAFT" | "MISSING_DATA" | "READY_TO_FINALIZE" | "FINALIZED_UNPAID" | "OVERDUE" | "PAID";
export type BillingWorkspaceQuery = {
  page: number; page_size: number; property_id?: string; room_id?: string; resident_id?: string;
  invoice_status?: InvoiceStatus; period_start?: string; period_end?: string; state?: BillingWorkspaceState;
};
export type BillingWorkspaceRow = {
  contract_no: string;
  contract_id: string;
  property: { property_id: string; name: string; province: string; address: string };
  room: { room_code: string };
  resident: { resident_id: string; full_name: string };
  period: { period_start: string; period_end: string };
  state: { code: BillingWorkspaceState; label: string };
  reminder: { due: boolean; recorded: boolean };
  draft_expected: boolean;
  invoice: { invoice_id: string; invoice_no: string; status: InvoiceStatus; due_date: string | null; is_overdue: boolean; total_amount: string; amount_provisional: boolean } | null;
  missing_or_invalid: Array<{ code: string; category: string; message: string }>;
};
export type BillingWorkspaceResponse = {
  data: BillingWorkspaceRow[];
  meta: PageMeta;
  summary: {
    contracts_on_page: number; needs_attention_on_page: number; drafts_on_page: number; finalized_on_page: number; missing_data_on_page: number; ready_to_finalize_on_page: number;
    finalized_unpaid: number; paid: number; overdue: number;
    unpaid_preview: Array<{ invoice_id: string; invoice_no: string; property_name: string; room_code: string; resident_name: string; period_start: string; period_end: string; due_date: string | null; is_overdue: boolean }>;
  };
};
export type InvoiceItemCategory = "RENT" | "ELECTRICITY" | "WATER" | "FIXED_SERVICE" | "FLEXIBLE_SERVICE" | "PARKING";
export type InvoiceElectricityTier = {
  tier_no: number;
  lower_kwh: string;
  upper_kwh: string | null;
  quantity: string;
  unit_price: string;
  amount: string;
};
export type InvoiceItem = {
  invoice_item_id: string;
  category: InvoiceItemCategory;
  item_key: string;
  label: string;
  description: string | null;
  quantity: string;
  unit: string;
  unit_price: string | null;
  amount: string;
  electricity_tiers?: InvoiceElectricityTier[];
};
export type InvoiceDetailResponse = InvoiceResource & {
  itemization_available: boolean;
  invoice_items: InvoiceItem[];
};
export type DraftMeterReadings = {
  electricity_current_kwh?: string;
  water_current_m3?: string;
};

const idempotency = () => crypto.randomUUID();

export const invoiceApi = {
  billingWorkspace(query: BillingWorkspaceQuery) {
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) });
    for (const key of ["property_id", "room_id", "resident_id", "invoice_status", "period_start", "period_end", "state"] as const) {
      const value = query[key]?.trim();
      if (value) params.set(key, value);
    }
    return apiRequest<BillingWorkspaceResponse>(`/billing/workspace?${params}`);
  },
  list(query: InvoiceListQuery) {
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) });
    for (const key of ["property_id", "room_id", "resident_id", "status", "period_start", "period_end"] as const) {
      const value = query[key]?.trim();
      if (value) params.set(key, value);
    }
    return apiRequest<InvoiceListResponse>(`/invoices?${params}`);
  },
  getInvoiceDetail(id: string) {
    return apiRequest<InvoiceDetailResponse>(`/invoices/${encodeURIComponent(id)}`);
  },
  updateDraftMeterReadings(id: string, input: DraftMeterReadings) {
    return apiRequest<InvoiceDetailResponse>(`/invoices/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  finalizeInvoice(id: string, input: Required<DraftMeterReadings>) {
    return apiRequest<InvoiceDetailResponse>(`/invoices/${encodeURIComponent(id)}/finalize`, {
      method: "POST", headers: { "Idempotency-Key": idempotency() }, body: JSON.stringify(input),
    });
  },
};
