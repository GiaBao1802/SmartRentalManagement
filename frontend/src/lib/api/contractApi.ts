import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";

export type ContractStatus = "draft" | "active" | "expired" | "terminated";
export type ContractResource = {
  contract_id: string;
  contract_no: string;
  room_id: string;
  property_id: string;
  owner_id: string;
  representative_resident_id: string;
  previous_contract_id: string | null;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  revision: number;
  rent_amount: string;
  deposit_amount: string;
  resident_capacity: number;
  initial_electric_kwh: string | null;
  initial_water_m3: string | null;
  termination_date: string | null;
  termination_reason: string | null;
  final_electric_kwh: string | null;
  final_water_m3: string | null;
  deposit_deduction: string | null;
  deposit_settlement_amount: string | null;
  created_at: string;
  updated_at: string;
  room?: { room_id: string; room_code: string; property: { property_id: string; name: string; province: string; address: string } };
  representative_resident?: { resident_id: string; full_name: string };
  successor?: { contract_id: string; contract_no: string; status: ContractStatus; revision: number };
};

export type ContractListQuery = {
  page: number;
  page_size: number;
  property_id?: string;
  room_id?: string;
  representative_resident_id?: string;
  status?: ContractStatus;
  expiring_before?: string;
  contract_no?: string;
};
export type ContractListResponse = { data: ContractResource[]; meta: PageMeta };
export type ContractCreate = {
  contract_no: string;
  room_id: string;
  representative_resident_id: string;
  start_date: string;
  end_date: string;
  rent_amount: string;
  deposit_amount: string;
  resident_capacity: number;
  initial_electric_kwh: string | null;
  initial_water_m3: string | null;
};
export type ContractPatch = Partial<Omit<ContractCreate, "room_id">> & { change_reason?: string };
export type ContractRenewal = { contract_no: string; start_date: string; end_date: string };
export type ContractTermination = {
  termination_date: string;
  termination_reason: string;
  final_electric_kwh: string;
  final_water_m3: string;
  deposit_deduction: string;
  deposit_settlement_amount: string;
};
export type ContractHistoryEntry = {
  revision: number;
  change_type: string;
  change_reason: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  changed_by_account_id: string;
  created_at: string;
};
export type ContractHistoryResponse = { data: ContractHistoryEntry[]; meta: PageMeta };
export type ContractDocument = {
  document_id: string;
  contract_id: string;
  property_id: string;
  owner_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  document_type: "contract" | "renewal" | "termination" | "attachment" | string;
  version: number;
  checksum_sha256: string;
  status: string;
  uploaded_by_account_id: string;
  signed_at: string | null;
  signature_provider: string | null;
  signature_reference: string | null;
  created_at: string;
  updated_at: string;
};
export type ContractDocumentRead = ContractDocument & { download_url: string | null };

const resource = <T,>(path: string) => apiRequest<T>(path);
const idempotency = () => crypto.randomUUID();

export const contractApi = {
  list(query: ContractListQuery) {
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) });
    for (const key of ["property_id", "room_id", "representative_resident_id", "status", "expiring_before", "contract_no"] as const) {
      const value = query[key];
      if (value) params.set(key, value);
    }
    return resource<ContractListResponse>(`/contracts?${params}`);
  },
  get(id: string) { return resource<ContractResource>(`/contracts/${encodeURIComponent(id)}`); },
  create(input: ContractCreate) {
    return apiRequest<ContractResource>("/contracts", { method: "POST", headers: { "Idempotency-Key": idempotency() }, body: JSON.stringify(input) });
  },
  activate(id: string) {
    return apiRequest<ContractResource>(`/contracts/${encodeURIComponent(id)}/activate`, { method: "POST", headers: { "Idempotency-Key": idempotency() }, body: "{}" });
  },
  update(id: string, input: ContractPatch, revision?: number) {
    return apiRequest<ContractResource>(`/contracts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: revision === undefined ? undefined : { "If-Match": `"${revision}"` },
      body: JSON.stringify(input),
    });
  },
  history(id: string, page = 1, pageSize = 20) {
    return resource<ContractHistoryResponse>(`/contracts/${encodeURIComponent(id)}/history?page=${page}&page_size=${pageSize}`);
  },
  renew(id: string, revision: number, input: ContractRenewal) {
    return apiRequest<ContractResource>(`/contracts/${encodeURIComponent(id)}/renew`, { method: "POST", headers: { "If-Match": `"${revision}"`, "Idempotency-Key": idempotency() }, body: JSON.stringify(input) });
  },
  terminate(id: string, revision: number, input: ContractTermination) {
    return apiRequest<ContractResource>(`/contracts/${encodeURIComponent(id)}/terminate`, { method: "POST", headers: { "If-Match": `"${revision}"`, "Idempotency-Key": idempotency() }, body: JSON.stringify(input) });
  },
  documents(id: string) { return resource<ContractDocument[]>(`/contracts/${encodeURIComponent(id)}/documents`); },
  readDocument(id: string) { return resource<ContractDocumentRead>(`/contract-documents/${encodeURIComponent(id)}`); },
  uploadDocument(id: string, file: File, documentType: ContractDocument["document_type"]) {
    const body = new FormData();
    body.set("document_type", documentType);
    body.set("file", file);
    return apiRequest<ContractDocument>(`/contracts/${encodeURIComponent(id)}/documents`, { method: "POST", headers: { "Idempotency-Key": idempotency() }, body });
  },
};

export type ResidentContractSummary = Omit<ContractResource, "representative_resident">;
export type ResidentContractsResponse = { data: ResidentContractSummary[]; meta: PageMeta };

