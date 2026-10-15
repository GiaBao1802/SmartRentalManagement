import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { RuntimeConfig } from "../config/env.js";
import { ApiError } from "./api-error.js";

export const CSRF_COOKIE = "gt_csrf";
export const SESSION_COOKIE = "gt_session";

export function getCookie(request: import("express").Request, name: string): string | null {
  const prefix = `${name}=`;
  const item = (request.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(prefix.length)); } catch { return null; }
}

export function makeCsrfToken(secret: string, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000)}.${randomBytes(24).toString("base64url")}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function validCsrfToken(token: string, secret: string, maxAgeMs: number, now = Date.now()): boolean {
  const [timestampText, nonce, providedText, extra] = token.split(".");
  if (!timestampText || !nonce || !providedText || extra !== undefined || !/^\d+$/.test(timestampText)) return false;
  const timestamp = Number(timestampText) * 1000;
  if (!Number.isSafeInteger(timestamp) || timestamp > now + 60_000 || now - timestamp > maxAgeMs) return false;
  const expected = createHmac("sha256", secret).update(`${timestampText}.${nonce}`).digest();
  let provided: Buffer;
  try { provided = Buffer.from(providedText, "base64url"); } catch { return false; }
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function csrfProtection(config: RuntimeConfig): RequestHandler {
  const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  return (request, _response, next) => {
    if (!unsafe.has(request.method.toUpperCase())) { next(); return; }
    const origin = request.get("origin");
    const cookieToken = getCookie(request, CSRF_COOKIE);
    const headerToken = request.get("x-csrf-token");
    const maxAge = config.sessionAbsoluteHours * 60 * 60 * 1000;
    if (origin !== config.frontendOrigin || !cookieToken || !headerToken || !safeEqual(cookieToken, headerToken) || !validCsrfToken(headerToken, config.sessionSecret, maxAge)) {
      next(new ApiError(403, "CSRF_INVALID", "Yêu cầu không vượt qua kiểm tra nguồn gốc.", {}));
      return;
    }
    next();
  };
}
