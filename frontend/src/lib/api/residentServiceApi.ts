import { apiRequest } from "./apiClient";

export type ResidentService = {
  service_id: string;
  name: string;
  description: string | null;
  unit: string;
  current_price: { unit_price: string; effective_from: string } | null;
};

export type ResidentServiceProperty = {
  property_id: string;
  property_name: string;
  services: ResidentService[];
};

export const residentServiceApi = {
  list() {
    return apiRequest<ResidentServiceProperty[]>("/me/services");
  },
};
