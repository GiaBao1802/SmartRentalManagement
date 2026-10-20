import { createHash, randomBytes } from "node:crypto";
import { ApiError, validationError } from "../middleware/api-error.js";

export class CredentialGate {
  private readonly tails = new Map<string, Promise<void>>();
  async run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.tails.set(key, current);
    await previous;
    try { return await action(); } finally { release(); if (this.tails.get(key) === current) this.tails.delete(key); }
  }
}
// Shared with login, reset and change-password. Single-process DEV only.
export const credentialGate = new CredentialGate();
export const tokenHash = (purpose: "invitation" | "reset", raw: string) => createHash("sha256").update(`${purpose}:${raw}`).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function validToken(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw invalidToken();
  return value;
}
export const invalidToken = () => new ApiError(400, "TOKEN_INVALID", "Liên kết không hợp lệ, đã dùng hoặc đã hết hạn.");
export const unavailable = () => new ApiError(503, "ACCOUNT_DELIVERY_UNAVAILABLE", "Kênh xác minh an toàn chưa được cấu hình hoặc chưa thể gửi. Lời mời hiện có được giữ lại.");
export function normalizeVietnamPhone(input: string): string {
  const phone = input.replace(/[\s().-]/g, "");
  const value = phone.startsWith("0") ? "+84" + phone.slice(1) : phone.startsWith("84") ? "+" + phone : phone;
  if (!/^\+84[35789]\d{8}$/.test(value)) throw validationError("Số điện thoại Việt Nam không hợp lệ.");
  return value;
}
export function normalizeLogin(input: string): string {
  const value = input.trim();
  if (value.includes("@")) return value.toLowerCase();
  try { return normalizeVietnamPhone(value); } catch { return value; }
}
export type DeliveryStatus = "sent" | "dev_available" | "rejected" | "failed" | "unknown";
export type Recipient = { ownerId: bigint; residentId: bigint | null; phone: string; subject: string };
export interface EnrollmentDelivery {
  readonly kind: "unconfigured" | "dev-test" | "verified-provider";
  resolve(ownerId: bigint, residentId: bigint | null, phone: string): Promise<Recipient | null>;
  send(recipient: Recipient, purpose: "invitation" | "reset", token: string, expiresAt: Date): Promise<DeliveryStatus>;
}
export class UnconfiguredEnrollmentDelivery implements EnrollmentDelivery {
  readonly kind = "unconfigured";
  async resolve(): Promise<null> { return null; }
  async send(): Promise<DeliveryStatus> { return "failed"; }
}
/** Test harness only. No HTTP retrieval, disk writes, logs or real messages. */
export class HarnessEnrollmentDelivery implements EnrollmentDelivery {
  readonly kind = "dev-test";
  private readonly links = new Map<string, { token: string; expiresAt: Date }>();
  readonly bindings = new Map<string, Recipient>();
  outcome: DeliveryStatus = "dev_available";
  constructor(nodeEnv: string, private readonly clock = () => Date.now()) { if (nodeEnv !== "test" && nodeEnv !== "development") throw unavailable(); }
  async resolve(ownerId: bigint, residentId: bigint | null, phone: string) {
    return this.bindings.get(`${ownerId}:${residentId}:${phone}`) ?? null;
  }
  async send(recipient: Recipient, purpose: "invitation" | "reset", token: string, expiresAt: Date) {
    if (this.outcome === "dev_available") this.links.set(`${recipient.subject}:${purpose}`, { token, expiresAt });
    return this.outcome;
  }
  retrieve(subject: string, purpose: "invitation" | "reset") {
    const entry = this.links.get(`${subject}:${purpose}`);
    return entry && entry.expiresAt.getTime() > this.clock() ? entry.token : undefined;
  }
  /** Explicit expired-link retrieval for negative browser tests; adapter is already DEV/test guarded. */
  retrieveExpiredForTest(subject: string, purpose: "invitation" | "reset") { return this.links.get(`${subject}:${purpose}`)?.token; }
  clear() { this.links.clear(); this.bindings.clear(); }
}
export class CredentialRateLimiter {
  private readonly entries = new Map<string, { count: number; until: number }>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  consume(scope: string, now = Date.now()) {
    for (const [key, entry] of this.entries) if (entry.until <= now) this.entries.delete(key);
    const key = createHash("sha256").update(scope).digest("hex");
    let entry = this.entries.get(key);
    if (!entry) { entry = { count: 0, until: now + this.windowMs }; this.entries.set(key, entry); }
    if (++entry.count > this.max) throw new ApiError(429, "RATE_LIMITED", "Vui lòng thử lại sau.", { retry_after: Math.max(1, Math.ceil((entry.until - now) / 1000)) });
  }
}
