import express, { type RequestHandler } from "express";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, requireAuthenticated } from "../middleware/auth.js";
import { foreignResourceNotFound } from "../middleware/auth.js";
import { validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { NotificationPreferencesPatch, PrismaNotificationRepository } from "./notification.repository.js";

type Dependencies = AuthDependencies & { notificationRepository: PrismaNotificationRepository };
const preferenceFields = new Map<string, keyof NotificationPreferencesPatch>([
  ["new_invoice", "newInvoice"],
  ["overdue_invoice", "overdueInvoice"],
  ["expiring_contract", "expiringContract"],
  ["complaint_updates", "complaintUpdates"],
]);

function parsePositiveInteger(value: unknown, fallback: number, name: string, maximum: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw validationError(`${name} không hợp lệ.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw validationError(`${name} không hợp lệ.`);
  return parsed;
}

function validateListQuery(query: Record<string, unknown>) {
  const allowed = new Set(["page", "page_size", "unread", "type"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) throw validationError("Bộ lọc thông báo không hợp lệ.");
  let unread: boolean | undefined;
  if (query.unread !== undefined) {
    if (query.unread !== "true" && query.unread !== "false") throw validationError("Bộ lọc chưa đọc không hợp lệ.");
    unread = query.unread === "true";
  }
  let type: string | undefined;
  if (query.type !== undefined) {
    if (typeof query.type !== "string" || !query.type.trim() || query.type.trim().length > 40) throw validationError("Loại thông báo không hợp lệ.");
    type = query.type.trim();
  }
  return {
    page: parsePositiveInteger(query.page, 1, "page", 1_000_000),
    pageSize: parsePositiveInteger(query.page_size, 20, "page_size", 100),
    unread,
    type,
  };
}

function notificationDto(row: NonNullable<Awaited<ReturnType<PrismaNotificationRepository["markRead"]>>>) {
  return {
    notification_id: row.notificationId.toString(),
    notification_type: row.notificationType,
    title: row.title,
    body: row.body,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

function preferencesDto(row: Awaited<ReturnType<PrismaNotificationRepository["getPreferences"]>>) {
  return {
    new_invoice: row.newInvoice,
    overdue_invoice: row.overdueInvoice,
    expiring_contract: row.expiringContract,
    complaint_updates: row.complaintUpdates,
    updated_at: row.updatedAt?.toISOString() ?? null,
  };
}

function validatePreferencesPatch(body: unknown): NotificationPreferencesPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError("Tùy chọn thông báo không hợp lệ.");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length === 0) throw validationError("Hãy chọn ít nhất một tùy chọn cần cập nhật.");
  const patch: NotificationPreferencesPatch = {};
  for (const [key, value] of Object.entries(input)) {
    const field = preferenceFields.get(key);
    if (!field || typeof value !== "boolean") throw validationError("Tùy chọn thông báo không hợp lệ.");
    patch[field] = value;
  }
  return patch;
}

export function createNotificationRouter(deps: Dependencies): express.Router {
  const router = express.Router();
  const authenticated: RequestHandler[] = [authenticateRequest(deps), requireAuthenticated];

  router.get("/notifications", ...authenticated, async (request, response, next) => {
    try {
      const filter = validateListQuery(request.query as Record<string, unknown>);
      const result = await deps.notificationRepository.list(request.auth!.accountId, filter);
      sendJson(response, 200, {
        data: result.rows.map((row) => notificationDto(row)),
        meta: { page: filter.page, page_size: filter.pageSize, total_items: result.total, total_pages: Math.ceil(result.total / filter.pageSize) },
      });
    } catch (error) { next(error); }
  });

  router.patch("/notifications/:notification_id/read", ...authenticated, async (request, response, next) => {
    try {
      let notificationId: bigint;
      try { notificationId = parseBigIntId(request.params.notification_id); }
      catch { throw validationError("Mã thông báo không hợp lệ."); }
      const row = await deps.notificationRepository.markRead(request.auth!.accountId, notificationId);
      if (!row) foreignResourceNotFound();
      sendJson(response, 200, { data: notificationDto(row) });
    } catch (error) { next(error); }
  });

  router.post("/notifications/read-all", ...authenticated, async (request, response, next) => {
    try {
      const result = await deps.notificationRepository.markAllRead(request.auth!.accountId);
      sendJson(response, 200, { data: { updated_count: result.updatedCount, read_at: result.readAt.toISOString() } });
    } catch (error) { next(error); }
  });

  router.get("/notification-preferences", ...authenticated, async (request, response, next) => {
    try {
      const result = await deps.notificationRepository.getPreferences(request.auth!.accountId);
      sendJson(response, 200, { data: preferencesDto(result) });
    } catch (error) { next(error); }
  });

  router.patch("/notification-preferences", ...authenticated, async (request, response, next) => {
    try {
      const patch = validatePreferencesPatch(request.body);
      const result = await deps.notificationRepository.updatePreferences(request.auth!.accountId, patch);
      sendJson(response, 200, { data: preferencesDto(result) });
    } catch (error) { next(error); }
  });

  return router;
}
