import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SessionStore } from "../auth/session-store.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { ApiError, unauthenticated, validationError } from "../middleware/api-error.js";
import { foreignResourceNotFound } from "../middleware/auth.js";
import { credentialGate, CredentialGate, invalidToken, newToken, normalizeLogin, normalizeVietnamPhone, tokenHash, unavailable, type DeliveryStatus, type EnrollmentDelivery, type Recipient } from "./credential-infrastructure.js";
import type { EnrollmentRepository, ResetAccount } from "./enrollment.repository.js";

type Material = { hash: string; sealed: Buffer; phone: string; expiresAt: Date; recipient: Recipient; outcome?: DeliveryStatus };
type Reset = Material & { accountId: bigint };
type Operation = { until: number; resend: boolean; result?: { invitation_id: string; resident_id: string; status: string; expires_at: Date; delivery_status: DeliveryStatus } };
export class EnrollmentService {
  private readonly locks = new CredentialGate();
  private readonly encryptionKey = randomBytes(32);
  private seal(raw: string) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv); const bytes = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), bytes]); }
  private open(sealed: Buffer) { const cipher = createDecipheriv("aes-256-gcm", this.encryptionKey, sealed.subarray(0, 12)); cipher.setAuthTag(sealed.subarray(12, 28)); return Buffer.concat([cipher.update(sealed.subarray(28)), cipher.final()]).toString("utf8"); }
  private readonly materials = new Map<string, Material>();
  private readonly resets = new Map<string, Reset>(); // Hash-indexed reset state; retry material is encrypted under a process-ephemeral key.
  private readonly operations = new Map<string, Operation>();
  constructor(private readonly repo: EnrollmentRepository, private readonly sessions: SessionStore, private readonly delivery: EnrollmentDelivery, nodeEnv: string, private readonly now = () => new Date(), private readonly deliveryTimeoutMs = 10_000) {
    // There is deliberately no production fallback to RAM reset/replay or DEV delivery.
    if (nodeEnv === "production") throw unavailable();
  }
  private prune() {
    const now = this.now().getTime();
    for (const [key, item] of this.materials) if (item.expiresAt.getTime() <= now) this.materials.delete(key);
    for (const [key, item] of this.resets) if (item.expiresAt.getTime() <= now) this.resets.delete(key);
    for (const [key, item] of this.operations) if (item.until <= now) this.operations.delete(key);
  }
  private async send(material: Material, purpose: "invitation" | "reset") {
    if (material.outcome === "unknown" || material.outcome === "sent" || material.outcome === "dev_available") return material.outcome;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { material.outcome = await Promise.race([
      this.delivery.send(material.recipient, purpose, this.open(material.sealed), material.expiresAt),
      new Promise<DeliveryStatus>(resolve => { timer = setTimeout(() => resolve("unknown"), this.deliveryTimeoutMs); }),
    ]); } catch { material.outcome = "unknown"; } finally { if (timer) clearTimeout(timer); }
    return material.outcome;
  }
  async issue(owner: bigint, resident: bigint, actor: bigint, key: string, resend: boolean) {
    this.prune();
    const operation = tokenHash("invitation", `${owner}:${actor}:${resident}:${key}`);
    return this.locks.run(`resident:${owner}:${resident}`, async () => {
      const previous = this.operations.get(operation);
      if (previous?.result) {
        // Retry must retain the original semantic request.
        if (previous.resend !== resend) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "Khóa đã dùng cho yêu cầu khác.");
        return previous.result;
      }
      const row = await this.repo.resident(owner, resident);
      if (!row) foreignResourceNotFound();
      if (row.hasAccount) throw new ApiError(409, "ACCOUNT_ALREADY_EXISTS", "Cư dân đã có tài khoản.");
      if (!row.phone || row.archivedAt) throw unavailable();
      const phone = normalizeVietnamPhone(row.phone);
      const recipient = await this.delivery.resolve(owner, resident, phone);
      if (!recipient || recipient.ownerId !== owner || recipient.residentId !== resident || recipient.phone !== phone) throw unavailable();
      const issuedAt = this.now();
      const raw = newToken(), expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60_000);
      const invitation = await this.repo.issue(owner, resident, actor, tokenHash("invitation", raw), phone, expiresAt, resend, issuedAt);
      const id = invitation.invitationId.toString();
      let material = this.materials.get(id);
      // Old pending links may outlive this process. Never replace or invalidate them silently.
      if (!material && !invitation.created) throw unavailable();
      if (!material) {
        material = { hash: tokenHash("invitation", raw), sealed: this.seal(raw), phone, expiresAt: invitation.expiresAt, recipient }; this.materials.set(id, material);
      }
      if (material.phone !== phone || material.recipient.subject !== recipient.subject) throw unavailable();
      // An explicit new resend operation may redeliver the SAME confirmed link.
      // Ambiguous timeout is never retried automatically.
      if (resend && (material.outcome === "sent" || material.outcome === "dev_available")) material.outcome = undefined;
      const delivery_status = await this.send(material, "invitation");
      const result = { invitation_id: id, resident_id: resident.toString(), status: invitation.status, expires_at: invitation.expiresAt, delivery_status };
      this.operations.set(operation, { until: invitation.expiresAt.getTime(), resend, result });
      return result;
    });
  }
  async inspect(purpose: "invitation" | "reset", raw: string) {
    this.prune();
    const hash = tokenHash(purpose, raw);
    if (purpose === "invitation") {
      const material = [...this.materials.values()].find(entry => entry.hash === hash);
      if (!material) throw invalidToken();
      const expiresAt = await this.repo.inspectInvitation(hash, material.phone, this.now());
      if (!expiresAt) throw invalidToken();
      return { valid: true as const, expires_at: expiresAt };
    }
    const reset = this.resets.get(hash);
    if (!reset || reset.expiresAt <= this.now() || !await this.repo.account(reset.accountId)) throw invalidToken();
    return { valid: true as const, expires_at: reset.expiresAt };
  }
  async accept(raw: string, password: string) {
    this.prune();
    const hash = tokenHash("invitation", raw);
    const material = [...this.materials.values()].find(m => m.hash === hash);
    if (!material) throw invalidToken();
    await this.repo.accept(hash, material.phone, await hashPassword(password), this.now());
  }
  private async requestReset(account: ResetAccount) {
    return credentialGate.run(account.accountId.toString(), async () => {
      this.prune();
      const existing = [...this.resets.values()].find(r => r.accountId === account.accountId);
      if (existing) return this.send(existing, "reset");
      if (!account.phone) throw unavailable();
      const owner = account.resident?.ownerId ?? account.ownerId;
      if (!owner) throw unavailable();
      const phone = normalizeVietnamPhone(account.phone);
      const recipient = await this.delivery.resolve(owner, account.residentId, phone);
      if (!recipient || recipient.ownerId !== owner || recipient.residentId !== account.residentId || recipient.phone !== phone) throw unavailable();
      const raw = newToken(); const entry: Reset = { hash: tokenHash("reset", raw), sealed: this.seal(raw), accountId: account.accountId, phone, recipient, expiresAt: new Date(this.now().getTime() + 30 * 60_000) };
      this.resets.set(tokenHash("reset", raw), entry);
      return this.send(entry, "reset");
    });
  }
  async forgot(login: string) {
    const candidates = await this.repo.lookup(normalizeLogin(login));
    if (candidates.length === 1) { try { await this.requestReset(candidates[0]); } catch { /* Existence-neutral response; no raw provider errors. */ } }
    return { requested: true };
  }
  async adminReset(owner: bigint, accountId: bigint) {
    const account = await this.repo.account(accountId);
    if (!account || account.role !== "resident" || account.resident?.ownerId !== owner) foreignResourceNotFound();
    return { requested: true, delivery_status: await this.requestReset(account) };
  }
  async reset(raw: string, password: string) {
    this.prune();
    const key = tokenHash("reset", raw), entry = this.resets.get(key);
    if (!entry) throw invalidToken();
    const hash = await hashPassword(password);
    await credentialGate.run(entry.accountId.toString(), async () => {
      if (this.resets.get(key) !== entry || entry.expiresAt <= this.now()) throw invalidToken();
      await this.repo.password(entry.accountId, hash, async () => { if (entry.expiresAt <= this.now()) throw invalidToken(); await this.sessions.revokeAccount(entry.accountId.toString()); });
      this.revokeResets(entry.accountId);
    });
  }
  private revokeResets(accountId: bigint) { for (const [key, entry] of this.resets) if (entry.accountId === accountId) this.resets.delete(key); }
  async change(accountId: bigint, current: string, password: string) {
    await credentialGate.run(accountId.toString(), async () => {
      const account = await this.repo.account(accountId);
      if (!account || !await verifyPassword(current, account.passwordHash)) throw unauthenticated();
      await this.repo.password(accountId, await hashPassword(password), () => this.sessions.revokeAccount(accountId.toString()));
      this.revokeResets(accountId);
    });
  }
}
export function passwordInput(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 1024) throw validationError("Mật khẩu cần từ 12 đến 1024 ký tự.");
  return value;
}
