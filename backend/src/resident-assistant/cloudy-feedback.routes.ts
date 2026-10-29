import express, { type RequestHandler } from "express";
import { ApiError, validationError } from "../middleware/api-error.js";
import { authenticateRequest, requireResident, requireSuperadmin, type AuthDependencies } from "../middleware/auth.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import {
  validateCloudyFeedbackReviewInput,
  type CloudyFeedbackFilter,
  type CloudyFeedbackRepository,
} from "./cloudy-feedback.repository.js";

const STATUSES = ["new", "reviewed", "no_action", "included_in_eval"] as const;
const INTENTS = ["services", "meter", "requests", "invoice", "other", "ambiguous"] as const;
const id = (value: unknown) => { try { return parseBigIntId(value); } catch { throw validationError("Mã câu hỏi không hợp lệ."); } };

function integer(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) throw validationError("Bộ lọc trang không hợp lệ.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw validationError("Bộ lọc trang không hợp lệ.");
  return parsed;
}

function isoDate(value: unknown, name: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw validationError(`Ngày ${name} không hợp lệ.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw validationError(`Ngày ${name} không hợp lệ.`);
  return date;
}

function listFilter(query: Record<string, unknown>): CloudyFeedbackFilter {
  if (Object.keys(query).some((key) => !["page", "page_size", "status", "intent", "from", "to"].includes(key))) throw validationError("Bộ lọc không được hỗ trợ.");
  if (query.status !== undefined && !STATUSES.includes(query.status as typeof STATUSES[number])) throw validationError("Trạng thái lọc không hợp lệ.");
  if (query.intent !== undefined && !INTENTS.includes(query.intent as typeof INTENTS[number])) throw validationError("Nhãn ý định không hợp lệ.");
  const from = isoDate(query.from, "bắt đầu");
  const to = isoDate(query.to, "kết thúc");
  if (from && to && from > to) throw validationError("Khoảng thời gian không hợp lệ.");
  return {
    page: integer(query.page, 1, 1, 1_000_000),
    pageSize: integer(query.page_size, 20, 1, 100),
    ...(query.status ? { status: query.status as CloudyFeedbackFilter["status"] } : {}),
    ...(query.intent ? { intent: query.intent as CloudyFeedbackFilter["intent"] } : {}),
    ...(from ? { from } : {}), ...(to ? { to } : {}),
  };
}

export function createCloudyFeedbackRouter(auth: AuthDependencies, repository: CloudyFeedbackRepository): express.Router {
  const router = express.Router();
  const resident: RequestHandler[] = [authenticateRequest(auth), requireResident];
  const superadmin: RequestHandler[] = [authenticateRequest(auth), requireSuperadmin];

  router.get("/me/assistant/feedback-preference", ...resident, async (request, response, next) => {
    try {
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: await repository.getPreference(request.auth!.accountId) });
    } catch (error) { next(error); }
  });

  router.put("/me/assistant/feedback-preference", ...resident, async (request, response, next) => {
    try {
      if (!request.body || Object.keys(request.body).length !== 1 || typeof request.body.enabled !== "boolean") throw validationError("Chọn bật hoặc tắt chia sẻ câu hỏi chưa hiểu.");
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: await repository.setPreference(request.auth!.accountId, request.body.enabled) });
    } catch (error) { next(error); }
  });

  router.get("/platform/cloudy/unresolved-feedback", ...superadmin, async (request, response, next) => {
    try {
      const filter = listFilter(request.query as Record<string, unknown>);
      const result = await repository.list(filter);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: result.rows, meta: { page: filter.page, page_size: filter.pageSize, total_items: result.total, total_pages: Math.ceil(result.total / filter.pageSize) } });
    } catch (error) { next(error); }
  });

  router.get("/platform/cloudy/unresolved-feedback/:feedback_id", ...superadmin, async (request, response, next) => {
    try {
      const result = await repository.detail(id(request.params.feedback_id));
      if (!result) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy câu hỏi.");
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: result });
    } catch (error) { next(error); }
  });

  router.patch("/platform/cloudy/unresolved-feedback/:feedback_id", ...superadmin, async (request, response, next) => {
    try {
      const input = validateCloudyFeedbackReviewInput(request.body);
      const result = await repository.review({ feedbackId: id(request.params.feedback_id), reviewerAccountId: request.platformAuth!.accountId, ...input });
      if (!result) throw new ApiError(409, "CONFLICT", "Câu hỏi đã được người khác cập nhật. Tải lại trước khi duyệt.");
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: result });
    } catch (error) { next(error); }
  });

  return router;
}
