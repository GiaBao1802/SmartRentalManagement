import express from "express";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest } from "../middleware/auth.js";
import { validationError } from "../middleware/api-error.js";
import { sendJson } from "../utils/ids.js";
import { CredentialRateLimiter, normalizeLogin, validToken } from "./credential-infrastructure.js";
import { EnrollmentService, passwordInput } from "./enrollment.service.js";
export function exactBody(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw validationError("Body không hợp lệ.");
  return value as Record<string, unknown>;
}
export function createEnrollmentRouter(auth: AuthDependencies, service: EnrollmentService) {
  const router = express.Router();
  const limiter = new CredentialRateLimiter(auth.config.loginMaxAttempts, auth.config.loginWindowMinutes * 60_000);
  router.use(["/auth/credential-link/inspect", "/auth/accept-invitation", "/auth/forgot-password", "/auth/reset-password", "/auth/change-password"], (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer"); next(); });
  router.post("/auth/credential-link/inspect", async (request, response, next) => {
    try {
      limiter.consume(`inspect:${request.ip}`);
      const body = exactBody(request.body, ["purpose", "token"]);
      if (body.purpose !== "invitation" && body.purpose !== "reset") throw validationError("purpose không hợp lệ.");
      sendJson(response, 200, { data: await service.inspect(body.purpose, validToken(body.token)) });
    } catch (error) { next(error); }
  });
  for (const purpose of ["accept-invitation", "reset-password"] as const) router.post(`/auth/${purpose}`, async (request, response, next) => {
    try {
      limiter.consume(`${purpose}:${request.ip}`);
      const body = exactBody(request.body, ["token", "password"]);
      const token = validToken(body.token), password = passwordInput(body.password);
      if (purpose === "accept-invitation") await service.accept(token, password); else await service.reset(token, password);
      sendJson(response, 200, { data: purpose === "accept-invitation" ? { accepted: true } : { reset: true } });
    } catch (error) { next(error); }
  });
  router.post("/auth/forgot-password", async (request, response, next) => {
    try {
      const body = exactBody(request.body, ["login"]);
      if (typeof body.login !== "string" || !body.login.trim() || body.login.length > 254) throw validationError("Nhập email hoặc số điện thoại.");
      limiter.consume(`forgot-ip:${request.ip}`); limiter.consume(`forgot-login:${normalizeLogin(body.login)}`);
      sendJson(response, 202, { data: await service.forgot(body.login) });
    } catch (error) { next(error); }
  });
  router.post("/auth/change-password", authenticateRequest(auth), async (request, response, next) => {
    try {
      limiter.consume(`change:${request.auth!.accountId}`);
      const body = exactBody(request.body, ["current_password", "password"]);
      if (typeof body.current_password !== "string" || body.current_password.length > 1024) throw validationError("Nhập mật khẩu hiện tại.");
      await service.change(request.auth!.accountId, body.current_password, passwordInput(body.password));
      sendJson(response, 200, { data: { changed: true } });
    } catch (error) { next(error); }
  });
  router.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    const value = error as { status?: number; details?: { retry_after?: number } };
    if (value.details?.retry_after) response.setHeader("Retry-After", String(value.details.retry_after));
    next(error);
  });
  return router;
}
