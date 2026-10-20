import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";
export type AccountResource = {
  account_id: string; resident_id: string | null; role: "admin" | "resident"; email: string | null; phone: string | null; status: "active" | "locked";
  last_login_at: string | null; created_at: string; updated_at: string;
  resident: { resident_id: string; full_name: string } | null;
};
export type AccountListFilters = { page?: number; page_size?: number; role?: "admin" | "resident"; status?: "active" | "locked"; resident_id?: string };
export type AccountListResponse = { data: AccountResource[]; meta: PageMeta };
export type InvitationResource = { invitation_id: string; resident_id: string; status: "pending" | "accepted" | "expired" | "revoked"; expires_at: string; accepted_at: string | null; created_at: string; updated_at: string };
const identifier = (id: string) => { if (!/^[1-9]\d*$/.test(id)) throw new Error("ID không hợp lệ."); return encodeURIComponent(id); };
export const accountApi = {
  list(filters: AccountListFilters = {}) {
    const params = new URLSearchParams({ page: String(filters.page ?? 1), page_size: String(filters.page_size ?? 20) });
    for (const key of ["role", "status", "resident_id"] as const) if (filters[key]) params.set(key, filters[key]);
    return apiRequest<AccountListResponse>(`/accounts?${params}`);
  },
  detail: (id: string) => apiRequest<AccountResource>(`/accounts/${identifier(id)}`),
  setStatus: (id: string, status: "active" | "locked") => apiRequest<AccountResource>(`/accounts/${identifier(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  invitations: (residentId: string, page = 1) => apiRequest<{ data: InvitationResource[]; meta: PageMeta }>(`/residents/${identifier(residentId)}/account-invitations?page=${page}&page_size=20`),
  invite: (residentId: string, key: string, resend = false) => apiRequest<{ invitation_id: string; delivery_status: DeliveryStatus }>(`/residents/${identifier(residentId)}/account-invitations`, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(resend ? { resend: true } : {}) }),
  reset: (accountId: string, key: string) => apiRequest<{ requested: boolean; delivery_status: DeliveryStatus }>(`/accounts/${identifier(accountId)}/password-reset`, { method: "POST", headers: { "Idempotency-Key": key }, body: "{}" }),
  revokeInvitation: (id: string, idempotencyKey: string) => apiRequest<InvitationResource>(`/account-invitations/${identifier(id)}/revoke`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: "{}" }),
};

// One key per user operation; a failed/ambiguous request keeps its key for retry.
// This is client retry identity, not durable server response replay.
export function createInvitationRevoker(makeKey: () => string = () => crypto.randomUUID()) {
  const keys = new Map<string, string>();
  return async (invitationId: string) => {
    let key = keys.get(invitationId);
    if (!key) { key = makeKey(); keys.set(invitationId, key); }
    const result = await accountApi.revokeInvitation(invitationId, key);
    keys.delete(invitationId);
    return result;
  };
}

export type DeliveryStatus = "sent" | "dev_available" | "rejected" | "failed" | "unknown";
export function deliveryMessage(status: DeliveryStatus) { return { sent: "Kênh xác minh đã xác nhận gửi.", dev_available: "Liên kết chỉ sẵn sàng trong test harness DEV; chưa gửi Zalo thật.", rejected: "Kênh xác minh từ chối gửi. Lời mời hiện có được giữ lại.", failed: "Gửi thất bại. Có thể dùng Gửi lại; lời mời vẫn được giữ.", unknown: "Chưa rõ kết quả gửi. Không tự gửi lặp; cần kiểm tra kênh xác minh." }[status]; }
