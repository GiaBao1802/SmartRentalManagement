import type { EnrollmentService } from "./enrollment.service.js";
import { CredentialRateLimiter } from "./credential-infrastructure.js";
import express from "express";
import { authenticateRequest, requireAdmin, getAdminOwnerId, foreignResourceNotFound, type AuthDependencies } from "../middleware/auth.js";
import { ApiError, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { AccountListQuery, AccountManagementRepository, AccountRecord, InvitationRecord } from "./account.types.js";
import { AccountManagementService } from "./account.service.js";

function id(value: unknown) { try { return parseBigIntId(value); } catch { throw validationError("ID phải là chuỗi số nguyên dương."); } }
function number(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw validationError("Phân trang không hợp lệ.");
  return Number(value);
}
function query(input: Record<string, unknown>, accounts = false): AccountListQuery {
  const allowed = accounts ? ["page", "page_size", "role", "status", "resident_id"] : ["page", "page_size"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw validationError("Bộ lọc không được hỗ trợ.");
  if (input.role !== undefined && input.role !== "admin" && input.role !== "resident") throw validationError("Vai trò không hợp lệ.");
  if (input.status !== undefined && input.status !== "active" && input.status !== "locked") throw validationError("Trạng thái không hợp lệ.");
  return { page: number(input.page, 1, 1_000_000), page_size: number(input.page_size, 20, 100), role: input.role as AccountListQuery["role"], status: input.status as AccountListQuery["status"], residentId: input.resident_id === undefined ? undefined : id(input.resident_id) };
}
function body(input: unknown, fields: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !fields.includes(key))) throw validationError("Body có trường không được hỗ trợ.");
}
function requireKey(request: express.Request) {
  const key = request.get("Idempotency-Key");
  if (!key || key.length > 128 || !/^[\x21-\x7e]+$/.test(key)) throw validationError("Idempotency-Key là bắt buộc và phải gồm 1–128 ký tự ASCII hiển thị.");
  return key;
}
export function accountDto(row: AccountRecord) {
  return { account_id: row.accountId.toString(), resident_id: row.residentId?.toString() ?? null, role: row.role, email: row.email, phone: row.phone, status: row.status,
    last_login_at: row.lastLoginAt, created_at: row.createdAt, updated_at: row.updatedAt,
    resident: row.resident ? { resident_id: row.resident.residentId.toString(), full_name: row.resident.fullName } : null };
}
export function invitationDto(row: InvitationRecord) {
  return { invitation_id: row.invitationId.toString(), resident_id: row.residentId.toString(), status: row.status === "pending" && row.expiresAt <= new Date() ? "expired" : row.status,
    expires_at: row.expiresAt, accepted_at: row.acceptedAt, created_at: row.createdAt, updated_at: row.updatedAt };
}
export function createAccountManagementRouter(auth: AuthDependencies, repository: AccountManagementRepository, enrollment?: EnrollmentService) {
  const router = express.Router();
  const admin = [authenticateRequest(auth), requireAdmin];
  const deliveryLimiter = new CredentialRateLimiter(auth.config.loginMaxAttempts, auth.config.loginWindowMinutes * 60_000);
  const service = new AccountManagementService(repository, auth.sessions);
  const owner = (request: express.Request) => getAdminOwnerId(request.auth!);
  router.use(["/accounts", "/account-invitations"], (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
  router.get("/accounts", ...admin, async (request, response, next) => {
    try { const input = query(request.query, true); const result = await repository.list(owner(request), input);
      sendJson(response, 200, { data: result.rows.map(accountDto), meta: { page: input.page, page_size: input.page_size, total_items: result.total, total_pages: Math.ceil(result.total / input.page_size) } }); }
    catch (error) { next(error); }
  });
  router.get("/accounts/:account_id", ...admin, async (request, response, next) => {
    try { const result = await repository.find(owner(request), id(request.params.account_id)); if (!result) foreignResourceNotFound(); sendJson(response, 200, { data: accountDto(result) }); }
    catch (error) { next(error); }
  });
  router.patch("/accounts/:account_id/status", ...admin, async (request, response, next) => {
    try { body(request.body, ["status"]); const status: unknown = request.body.status; if (status !== "active" && status !== "locked") throw validationError("status phải là active hoặc locked.");
      const result = await service.setStatus(owner(request), id(request.params.account_id), status); sendJson(response, 200, { data: accountDto(result) }); }
    catch (error) { next(error); }
  });
  router.get("/residents/:resident_id/account-invitations", ...admin, async (request, response, next) => {
    try { response.setHeader("Cache-Control", "no-store"); const residentId = id(request.params.resident_id); const ownerId = owner(request); if (!await repository.residentExists(ownerId, residentId)) foreignResourceNotFound();
      const input = query(request.query); const result = await repository.invitations(ownerId, residentId, input.page, input.page_size);
      sendJson(response, 200, { data: result.rows.map(invitationDto), meta: { page: input.page, page_size: input.page_size, total_items: result.total, total_pages: Math.ceil(result.total / input.page_size) } }); }
    catch (error) { next(error); }
  });
  router.post("/account-invitations/:invitation_id/revoke", ...admin, async (request, response, next) => {
    try { requireKey(request); body(request.body ?? {}, []); const result = await service.revoke(owner(request), id(request.params.invitation_id)); sendJson(response, 200, { data: invitationDto(result) }); }
    catch (error) { next(error); }
  });
  router.post("/residents/:resident_id/account-invitations", ...admin, async (request, response, next) => {
    try { const key = requireKey(request); body(request.body ?? {}, ["resend"]); if (request.body?.resend !== undefined && request.body.resend !== true) throw validationError("resend phải là true."); const residentId = id(request.params.resident_id); if (!await repository.residentExists(owner(request), residentId)) foreignResourceNotFound();
      if (!enrollment) service.deliveryUnavailable(); deliveryLimiter.consume(`invite:${request.auth!.accountId}:${residentId}`);
      sendJson(response, 202, { data: await enrollment!.issue(owner(request), residentId, request.auth!.accountId, key, request.body?.resend === true) }); }
    catch (error) { next(error); }
  });
  router.post("/accounts/:account_id/password-reset", ...admin, async (request, response, next) => {
    try { requireKey(request); body(request.body ?? {}, []); const account = await repository.find(owner(request), id(request.params.account_id)); if (!account) foreignResourceNotFound();
      if (account.role !== "resident") throw new ApiError(403, "FORBIDDEN", "Chỉ quản lý đặt lại mật khẩu cư dân trong phạm vi."); if (!enrollment) service.deliveryUnavailable(); deliveryLimiter.consume(`reset:${request.auth!.accountId}:${account.accountId}`); sendJson(response, 202, { data: await enrollment!.adminReset(owner(request), account.accountId) }); }
    catch (error) { next(error); }
  });
  router.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    const retryAfter = (error as { details?: { retry_after?: number } })?.details?.retry_after;
    if (retryAfter) response.setHeader("Retry-After", String(retryAfter));
    next(error);
  });
  return router;
}
