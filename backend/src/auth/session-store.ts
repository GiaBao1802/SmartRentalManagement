import { randomBytes, createHmac } from "node:crypto";

export type SessionRecord = {
  tokenHash: string;
  accountId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
};

export interface SessionStore {
  set(record: SessionRecord): Promise<void>;
  get(tokenHash: string): Promise<SessionRecord | null>;
  touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<void>;
  revoke(tokenHash: string): Promise<void>;
  revokeAccount(accountId: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private operationCount = 0;

  private pruneExpired(now = Date.now()): void {
    this.operationCount += 1;
    if (this.operationCount % 128 !== 0) return;
    for (const [tokenHash, record] of this.sessions) {
      if (record.expiresAt <= now || record.absoluteExpiresAt <= now) this.sessions.delete(tokenHash);
    }
  }

  async set(record: SessionRecord): Promise<void> { this.pruneExpired(); this.sessions.set(record.tokenHash, record); }
  async get(tokenHash: string): Promise<SessionRecord | null> {
    this.pruneExpired();
    const record = this.sessions.get(tokenHash);
    if (record && (record.expiresAt <= Date.now() || record.absoluteExpiresAt <= Date.now())) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return record ?? null;
  }
  async touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<void> {
    const record = this.sessions.get(tokenHash);
    if (record) this.sessions.set(tokenHash, { ...record, lastSeenAt, expiresAt });
  }
  async revoke(tokenHash: string): Promise<void> { this.sessions.delete(tokenHash); }
  async revokeAccount(accountId: string): Promise<void> {
    for (const [tokenHash, record] of this.sessions) if (record.accountId === accountId) this.sessions.delete(tokenHash);
  }
}

export function createSessionStore(nodeEnv: string): SessionStore {
  if (nodeEnv === "production") throw new Error("Production requires a durable server-side session store; the in-memory adapter is development/test only");
  return new InMemorySessionStore();
}

export function createOpaqueSessionToken(): string { return randomBytes(32).toString("base64url"); }
export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
