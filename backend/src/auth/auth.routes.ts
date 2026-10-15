import express, { type RequestHandler } from "express";
import type { RuntimeConfig } from "../config/env.js";
import type { CurrentAccountRecord, LoginAccountRecord } from "./auth.types.js";
import { createSessionRecord, newSessionToken, type AuthDependencies } from "../middleware/auth.js";
import { getCookie, makeCsrfToken, CSRF_COOKIE, SESSION_COOKIE } from "../middleware/csrf.js";
import { ApiError, unauthenticated, validationError } from "../middleware/api-error.js";
import { verifyPassword } from "./password.js";
import { hashSessionToken } from "./session-store.js";
import { sendJson } from "../utils/ids.js";
import { authenticateRequest } from "../middleware/auth.js";

class LoginRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetsAt: number }>();
  private checks = 0;
  constructor(private readonly maximum: number, private readonly windowMs: number) {}
  consume(key: string, now = Date.now()): number | null {
    this.checks += 1;
    if (this.checks % 128 === 0) {
      for (const [address, bucket] of this.buckets) if (bucket.resetsAt <= now) this.buckets.delete(address);
    }
    const current = this.buckets.get(key);
    if (!current || current.resetsAt <= now) {
      this.buckets.set(key, { count: 1, resetsAt: now + this.windowMs });
      return null;
    }
    current.count += 1;
    if (current.count > this.maximum) return Math.max(1, Math.ceil((current.resetsAt - now) / 1000));
    return null;
  }
}

function setCookie(response: express.Response, name: string, value: string, config: RuntimeConfig, options: { httpOnly: boolean; maxAgeSeconds: number }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=/api/v1`, "SameSite=Lax", `Max-Age=${options.maxAgeSeconds}`];
  if (options.httpOnly) parts.push("HttpOnly");
  if (config.nodeEnv === "production") parts.push("Secure");
  response.append("Set-Cookie", parts.join("; "));
}

function clearCookie(response: express.Response, name: string, config: RuntimeConfig, httpOnly: boolean) {
  const parts = [`${name}=`, "Path=/api/v1", "SameSite=Lax", "Max-Age=0"];
  if (httpOnly) parts.push("HttpOnly");
  if (config.nodeEnv === "production") parts.push("Secure");
  response.append("Set-Cookie", parts.join("; "));
}

function safeProfile(account: CurrentAccountRecord | LoginAccountRecord) {
  if (account.role === "admin" && account.owner && account.ownerId !== null && account.residentId === null && account.ownerId === account.owner.ownerId) {
    return { owner_id: account.owner.ownerId.toString(), display_name: account.owner.displayName };
  }
  if (account.role === "resident" && account.resident && account.residentId === account.resident.residentId && account.ownerId === null && account.resident.ownerId > 0n) {
    return { resident_id: account.resident.residentId.toString(), full_name: account.resident.fullName };
  }
  return null;
}

function safeAccount(account: CurrentAccountRecord | LoginAccountRecord) {
  return { account_id: account.accountId.toString(), role: account.role, email: account.email, phone: account.phone, status: account.status };
}

function createCsrfHandler(config: RuntimeConfig): RequestHandler {
  return (request, response) => {
    const token = makeCsrfToken(config.sessionSecret);
    const ttlSeconds = config.sessionAbsoluteHours * 60 * 60;
    response.setHeader("Cache-Control", "no-store");
    setCookie(response, CSRF_COOKIE, token, config, { httpOnly: false, maxAgeSeconds: ttlSeconds });
    response.setHeader("X-CSRF-Token", token);
    sendJson(response, 200, { data: { csrf_token: token } });
  };
}

export function createAuthRouter(deps: AuthDependencies): express.Router {
  const router = express.Router();
  const limiter = new LoginRateLimiter(deps.config.loginMaxAttempts, deps.config.loginWindowMinutes * 60 * 1000);

  router.get("/csrf", createCsrfHandler(deps.config));

  router.post("/login", async (request, response, next) => {
    try {
      const login = typeof request.body?.login === "string" ? request.body.login.trim() : "";
      const password = typeof request.body?.password === "string" ? request.body.password : "";
      if (!login || !password) throw validationError("Nhập email hoặc số điện thoại và mật khẩu.");
      if (login.length > 254) throw unauthenticated();
      if (password.length > 1024) {
        await verifyPassword(password.slice(0, 1024), undefined);
        throw unauthenticated();
      }
      const retryAfter = limiter.consume(request.ip || "unknown");
      if (retryAfter !== null) {
        response.setHeader("Retry-After", String(retryAfter));
        throw new ApiError(429, "RATE_LIMITED", "Vui lòng thử lại sau.", {});
      }

      const candidates = await deps.repository.findCandidates(login);
      const account = candidates.length === 1 ? candidates[0] : null;
      const passwordMatches = await verifyPassword(password, account?.passwordHash);
      const profile = account && safeProfile(account);
      if (!account || !passwordMatches || account.status !== "active" || !profile) throw unauthenticated();

      const now = Date.now();
      const token = newSessionToken();
      const tokenHash = hashSessionToken(token, deps.config.sessionSecret);
      const session = createSessionRecord(account.accountId, tokenHash, deps.config, now);
      await deps.sessions.set(session);
      response.setHeader("Cache-Control", "no-store");
      setCookie(response, SESSION_COOKIE, token, deps.config, {
        httpOnly: true,
        maxAgeSeconds: Math.max(1, Math.floor((session.expiresAt - now) / 1000)),
      });
      sendJson(response, 200, {
        data: {
          account: safeAccount(account),
          profile,
          expires_at: new Date(session.expiresAt).toISOString(),
        },
      });
    } catch (error) { next(error); }
  });

  router.get("/me", authenticateRequest(deps), (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const context = request.auth!;
    const account = {
      account_id: context.accountId.toString(),
      role: context.role,
      email: context.account.email,
      phone: context.account.phone,
      status: context.account.status,
    };
    const profile = context.role === "admin"
      ? { owner_id: context.owner.ownerId.toString(), display_name: context.owner.displayName }
      : { resident_id: context.resident.residentId.toString(), full_name: context.resident.fullName };
    sendJson(response, 200, { data: { account, profile } });
  });

  router.post("/logout", async (request, response, next) => {
    try {
      const token = getCookie(request, SESSION_COOKIE);
      if (token) await deps.sessions.revoke(hashSessionToken(token, deps.config.sessionSecret));
      response.setHeader("Cache-Control", "no-store");
      clearCookie(response, SESSION_COOKIE, deps.config, true);
      sendJson(response, 200, { data: { logged_out: true } });
    } catch (error) { next(error); }
  });

  return router;
}
