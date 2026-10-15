import { apiRequest } from "./apiClient";

export type UtilityKind = "ELECTRICITY" | "WATER";
export type ElectricityTier = { electricity_tariff_tier_id: string; tier_no: number; lower_kwh: string; upper_kwh: string | null; unit_price: string };
export type UtilityTariffVersion = {
  utility_tariff_version_id: string; version_no: number; effective_from: string; unit: string; calculation_mode: string;
  flat_unit_price: string | null; source_name: string | null; source_reference: string | null; published_at: string | null;
  created_at: string; tiers: ElectricityTier[];
};
export type UtilityTariff = { utility_tariff_id: string; utility_type: UtilityKind; code: string; name: string; status: "active" | "retired"; versions: UtilityTariffVersion[] };
export type UtilityTariffProperty = { property: { property_id: string; name: string }; tariffs: UtilityTariff[] };
export type NewElectricityVersion = { effective_from: string; source_name?: string; source_reference?: string; tiers: Array<{ tier_no: number; lower_kwh: string; upper_kwh: string | null; unit_price: string }> };
export type NewWaterVersion = { effective_from: string; source_name?: string; source_reference?: string; flat_unit_price: string };

export const utilityTariffApi = {
  getForProperty(propertyId: string) { return apiRequest<UtilityTariffProperty>(`/properties/${encodeURIComponent(propertyId)}/utility-tariffs`); },
  publishElectricity(propertyId: string, input: NewElectricityVersion) {
    return apiRequest<UtilityTariffVersion>(`/properties/${encodeURIComponent(propertyId)}/utility-tariffs/electricity/versions`, { method: "POST", body: JSON.stringify(input) });
  },
  publishWater(propertyId: string, input: NewWaterVersion) {
    return apiRequest<UtilityTariffVersion>(`/properties/${encodeURIComponent(propertyId)}/utility-tariffs/water/versions`, { method: "POST", body: JSON.stringify(input) });
  },
};
