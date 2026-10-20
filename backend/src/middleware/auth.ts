import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import type { RuntimeConfig } from "../config/env.js";
import type { AuthRepository, AuthContext, CurrentAccountRecord } from "../auth/auth.types.js";
import type { SessionStore } from "../auth/session-store.js";
import { hashSessionToken } from "../auth/session-store.js";
import { getCookie, SESSION_COOKIE } from "./csrf.js";
import { ApiError, forbidden, unauthenticated, validationError } from "./api-error.js";
import { parseBigIntId } from "../utils/ids.js";

export type AuthDependencies = { config: RuntimeConfig; repository: AuthRepository; sessions: SessionStore };

export const rejectClientAuthority: RequestHandler = (request, _response, next) => {
  const forbiddenKeys = new Set(["owner_id", "role", "ownerId", "residentId"]);
  const body = request.body;
  const query = request.query as Record<string, unknown>;
  const headerKeys = ["owner_id", "resident_id", "role", "x-owner-id", "x-resident-id", "x-role"];
  const path = request.originalUrl.split("?")[0] ?? "";
  const isRoomResidentAdd = request.method === "POST" && /^\/api\/v1\/rooms\/\d+\/residents\/?$/.test(path);
  const isParkingAssignmentCreate = request.method === "POST" && /^\/api\/v1\/properties\/\d+\/parking-assignments\/?$/.test(path);
  const isParkingVehicleCreate = request.method === "POST" && /^\/api\/v1\/properties\/\d+\/vehicles\/?$/.test(path);
  const bodyHasAuthority = body && typeof body === "object" && Object.keys(body).some((key) => forbiddenKeys.has(key) || (key === "resident_id" && ! (isRoomResidentAdd || isParkingAssignmentCreate || isParkingVehicleCreate)));
  const isInvoiceList = request.method === "GET" && request.originalUrl.split("?")[0] === "/api/v1/invoices";
  const isBillingWorkspace = request.method === "GET" && request.originalUrl.split("?")[0] === "/api/v1/billing/workspace";
  // These are allowlisted search filters on this exact GET, never identity authority.
  const isAccountList = request.method === "GET" && path === "/api/v1/accounts";
  const queryHasAuthority = query && typeof query === "object" && Object.keys(query).some((key) => (forbiddenKeys.has(key) && !(key === "role" && isAccountList)) || (key === "resident_id" && !isInvoiceList && !isBillingWorkspace && !isAccountList));
  if (bodyHasAuthority || queryHasAuthority || headerKeys.some((key) => request.headers[key] !== undefined)) {
    next(validationError("Không được gửi trường xác định vai trò hoặc phạm vi Owner/Resident."));
    return;
  }
  next();
};

function resolveContext(account: CurrentAccountRecord): AuthContext | null {
  const safe = { email: account.email, phone: account.phone, status: "active" as const };
  if (account.status !== "active") return null;
  if (account.role === "admin" && account.ownerId !== null && account.residentId === null && account.owner?.ownerId === account.ownerId) {
    return { accountId: account.accountId, role: "admin", ownerId: account.ownerId, residentId: null, account: safe, owner: account.owner };
  }
  if (account.role === "resident" && account.ownerId === null && account.residentId !== null && account.resident?.residentId === account.residentId && account.resident.ownerId > 0n) {
    return { accountId: account.accountId, role: "resident", ownerId: account.resident.ownerId, residentId: account.residentId, account: safe, resident: account.resident };
  }
  return null;
}

export function authenticateRequest(deps: AuthDependencies): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = getCookie(request, SESSION_COOKIE);
      if (!token || token.length < 32 || token.length > 256) throw unauthenticated();
      const tokenHash = hashSessionToken(token, deps.config.sessionSecret);
      const session = await deps.sessions.get(tokenHash);
      const now = Date.now();
      if (!session || session.expiresAt <= now || session.absoluteExpiresAt <= now) {
        if (session) await deps.sessions.revoke(tokenHash);
        throw unauthenticated();
      }
      let accountId: bigint;
      try { accountId = parseBigIntId(session.accountId); } catch { await deps.sessions.revoke(tokenHash); throw unauthenticated(); }
      const account = await deps.repository.findCurrentAccount(accountId);
      if (!account) { await deps.sessions.revoke(tokenHash); throw unauthenticated(); }
      if (account.status === "locked") {
        await deps.sessions.revokeAccount(session.accountId);
        throw unauthenticated();
      }
      const context = resolveContext(account);
      if (!context) { await deps.sessions.revoke(tokenHash); throw unauthenticated(); }
      const idleExpiry = now + deps.config.sessionIdleMinutes * 60 * 1000;
      await deps.sessions.touch(tokenHash, now, Math.min(idleExpiry, session.absoluteExpiresAt));
      request.auth = context;
      next();
    } catch (error) { next(error); }
  };
}

export const requireAuthenticated: RequestHandler = (request, _response, next) => request.auth ? next() : next(unauthenticated());
export const requireAdmin: RequestHandler = (request, _response, next) => request.auth?.role === "admin" ? next() : request.auth ? next(forbidden()) : next(unauthenticated());
export const requireResident: RequestHandler = (request, _response, next) => request.auth?.role === "resident" ? next() : request.auth ? next(forbidden()) : next(unauthenticated());

export function getAdminOwnerId(context: AuthContext): bigint {
  if (context.role !== "admin") throw forbidden();
  return context.ownerId;
}

export function getResidentContext(context: AuthContext): Extract<AuthContext, { role: "resident" }> {
  if (context.role !== "resident") throw forbidden();
  return context;
}

export function foreignResourceNotFound(): never {
  throw new ApiError(404, "NOT_FOUND", "Không tìm thấy dữ liệu.", {});
}

export function createSessionRecord(accountId: bigint, tokenHash: string, config: RuntimeConfig, now = Date.now()) {
  const absoluteExpiresAt = now + config.sessionAbsoluteHours * 60 * 60 * 1000;
  const expiresAt = Math.min(now + config.sessionIdleMinutes * 60 * 1000, absoluteExpiresAt);
  return { tokenHash, accountId: accountId.toString(), createdAt: now, lastSeenAt: now, expiresAt, absoluteExpiresAt };
}

export function newSessionToken(): string { return randomBytes(32).toString("base64url"); }
