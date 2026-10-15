import { apiRequest } from "./apiClient";
import type { ContractDocument, ContractDocumentRead, ContractResource, ResidentContractsResponse } from "./contractApi";
import type { PageMeta } from "./propertyApi";

export type ResidenceStatus = "living" | "left";
export type ResidenceRegistrationStatus = "not_completed" | "temporary_resident" | "temporary_absence";

export type Resident = {
  resident_id: string;
  owner_id: string;
  national_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  gender: string | null;
  residence_status: ResidenceStatus;
  residence_registration_status: ResidenceRegistrationStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  room_residents?: Occupancy[];
  representative_contracts?: ResidentContractSummary[];
};

export type ResidentContractSummary = Omit<ContractResource, "representative_resident">;
export type ResidentContractDetail = ResidentContractSummary;

export type Occupancy = {
  occupancy_id: string;
  room_id: string;
  property_id: string;
  owner_id: string;
  resident_id: string;
  contract_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: "active" | "ended";
  created_at: string;
  updated_at: string;
  resident?: Resident;
  room?: {
    room_id: string;
    room_code: string;
    property?: { property_id: string; name: string; province?: string; address?: string };
  };
  contract?: { contract_id: string; contract_no: string; status: string; start_date: string; end_date: string; resident_capacity: number; revision?: number } | null;
};

export type ResidentInput = {
  national_id?: string | null;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  residence_registration_status?: ResidenceRegistrationStatus;
};
export type ResidentList = { data: Resident[]; meta: PageMeta };
export type ResidentListQuery = {
  page: number;
  page_size: number;
  residence_status?: ResidenceStatus;
  residence_registration_status?: ResidenceRegistrationStatus;
  property_id?: string;
  room_id?: string;
};
export type MeRental = { resident: Resident; occupancies: Occupancy[]; representative_contracts: ResidentContractSummary[] };
export type ResidentContracts = ResidentContractsResponse;

export const residentApi = {
  list(params: ResidentListQuery) {
    const query = new URLSearchParams({ page: String(params.page), page_size: String(params.page_size) });
    if (params.residence_status) query.set("residence_status", params.residence_status);
    if (params.residence_registration_status) query.set("residence_registration_status", params.residence_registration_status);
    if (params.property_id) query.set("property_id", params.property_id);
    if (params.room_id) query.set("room_id", params.room_id);
    return apiRequest<ResidentList>(`/residents?${query}`);
  },
  get(id: string) { return apiRequest<Resident>(`/residents/${encodeURIComponent(id)}`); },
  searchByNationalId(nationalId: string) { return apiRequest<Resident>("/residents/search", { method: "POST", body: JSON.stringify({ national_id: nationalId }) }); },
  create(input: ResidentInput) { return apiRequest<Resident>("/residents", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) }); },
  update(id: string, input: Partial<ResidentInput>) { return apiRequest<Resident>(`/residents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); },
  archive(id: string) { return apiRequest<Resident>(`/residents/${encodeURIComponent(id)}`, { method: "DELETE" }); },
  meRental() { return apiRequest<MeRental>("/me/rental"); },
  meContracts(page = 1, pageSize = 20) { return apiRequest<ResidentContracts>(`/me/contracts?page=${page}&page_size=${pageSize}`); },
  contractDetail(id: string) { return apiRequest<ResidentContractDetail>(`/contracts/${encodeURIComponent(id)}`); },
  contractDocuments(id: string) { return apiRequest<ContractDocument[]>(`/contracts/${encodeURIComponent(id)}/documents`); },
  contractDocument(id: string) { return apiRequest<ContractDocumentRead>(`/contract-documents/${encodeURIComponent(id)}`); },
};
