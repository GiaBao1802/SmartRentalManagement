import { apiRequest } from "./apiClient";
import type { Occupancy } from "./residentApi";

export type OccupancyCreate = { resident_id: string; contract_id?: string | null; started_at: string };
export type OccupancyTransfer = { source_occupancy_id: string; room_id: string; contract_id: string | null; started_at: string };

export const occupancyApi = {
  listForRoom(roomId: string) { return apiRequest<Occupancy[]>(`/rooms/${encodeURIComponent(roomId)}/residents`); },
  add(roomId: string, input: OccupancyCreate) {
    return apiRequest<Occupancy>(`/rooms/${encodeURIComponent(roomId)}/residents`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) });
  },
  end(occupancyId: string, endedAt: string) {
    return apiRequest<Occupancy>(`/occupancies/${encodeURIComponent(occupancyId)}/end`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ ended_at: endedAt }) });
  },
  transfer(residentId: string, input: OccupancyTransfer) {
    return apiRequest<{ source_occupancy_id: string; destination: Occupancy }>(`/residents/${encodeURIComponent(residentId)}/transfer`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) });
  },
};
