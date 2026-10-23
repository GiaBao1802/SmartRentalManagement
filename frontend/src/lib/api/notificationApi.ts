import { apiRequest } from "./apiClient";
import type { PageMeta } from "./propertyApi";

export type ResidentNotification = {
  notification_id: string;
  notification_type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreferences = {
  new_invoice: boolean;
  overdue_invoice: boolean;
  expiring_contract: boolean;
  complaint_updates: boolean;
  updated_at: string | null;
};

export type NotificationPreferencePatch = Partial<Omit<NotificationPreferences, "updated_at">>;
export type NotificationListQuery = { page: number; page_size: number; unread?: boolean; type?: string };
export type NotificationListResponse = { data: ResidentNotification[]; meta: PageMeta };

export const notificationApi = {
  list(query: NotificationListQuery) {
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.page_size) });
    if (query.unread !== undefined) params.set("unread", String(query.unread));
    if (query.type) params.set("type", query.type);
    return apiRequest<NotificationListResponse>(`/notifications?${params}`);
  },
  markRead(notificationId: string) {
    return apiRequest<ResidentNotification>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" });
  },
  markAllRead() {
    return apiRequest<{ updated_count: number; read_at: string }>("/notifications/read-all", { method: "POST" });
  },
  preferences() {
    return apiRequest<NotificationPreferences>("/notification-preferences");
  },
  updatePreferences(patch: NotificationPreferencePatch) {
    return apiRequest<NotificationPreferences>("/notification-preferences", { method: "PATCH", body: JSON.stringify(patch) });
  },
};
