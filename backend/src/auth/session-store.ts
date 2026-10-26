import { randomBytes, createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

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
  touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<boolean>;
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
  async touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<boolean> {
    const record = this.sessions.get(tokenHash);
    if (!record || record.expiresAt <= Date.now() || record.absoluteExpiresAt <= Date.now()) return false;
    this.sessions.set(tokenHash, { ...record, lastSeenAt, expiresAt });
    return true;
  }
  async revoke(tokenHash: string): Promise<void> { this.sessions.delete(tokenHash); }
  async revokeAccount(accountId: string): Promise<void> {
    for (const [tokenHash, record] of this.sessions) if (record.accountId === accountId) this.sessions.delete(tokenHash);
  }
}

type SessionRow = {
  token_hash: string;
  account_id: bigint;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  absolute_expires_at: Date;
};

/** Shared, durable store for production. The database contains only the HMAC of the browser token. */
export class PostgresSessionStore implements SessionStore {
  constructor(private readonly db: PrismaClient) {}

  async set(record: SessionRecord): Promise<void> {
    await this.db.$executeRaw`
      INSERT INTO auth_sessions (token_hash, account_id, created_at, last_seen_at, expires_at, absolute_expires_at)
      VALUES (${record.tokenHash}, ${BigInt(record.accountId)}, ${new Date(record.createdAt)},
              ${new Date(record.lastSeenAt)}, ${new Date(record.expiresAt)}, ${new Date(record.absoluteExpiresAt)})`;
    // Expired rows never grant access; remove them at login to limit growth without a separate worker.
    await this.db.$executeRaw`DELETE FROM auth_sessions WHERE expires_at <= now()`;
  }

  async get(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.db.$queryRaw<SessionRow[]>`
      SELECT token_hash, account_id, created_at, last_seen_at, expires_at, absolute_expires_at
      FROM auth_sessions WHERE token_hash = ${tokenHash}`;
    const row = rows[0];
    if (!row) return null;
    return {
      tokenHash: row.token_hash.trim(), accountId: row.account_id.toString(),
      createdAt: row.created_at.getTime(), lastSeenAt: row.last_seen_at.getTime(),
      expiresAt: row.expires_at.getTime(), absoluteExpiresAt: row.absolute_expires_at.getTime(),
    };
  }

  async touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<boolean> {
    const updated = await this.db.$executeRaw`
      UPDATE auth_sessions
      SET last_seen_at = GREATEST(last_seen_at, ${new Date(lastSeenAt)}),
          expires_at = GREATEST(expires_at, LEAST(absolute_expires_at, ${new Date(expiresAt)}))
      WHERE token_hash = ${tokenHash} AND expires_at > now() AND absolute_expires_at > now()`;
    return updated === 1;
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM auth_sessions WHERE token_hash = ${tokenHash}`;
  }

  async revokeAccount(accountId: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM auth_sessions WHERE account_id = ${BigInt(accountId)}`;
  }
}

export function createSessionStore(nodeEnv: string, db?: PrismaClient): SessionStore {
  if (nodeEnv === "production") {
    if (!db) throw new Error("Production requires a PostgreSQL session store");
    return new PostgresSessionStore(db);
  }
  return new InMemorySessionStore();
}

export function createOpaqueSessionToken(): string { return randomBytes(32).toString("base64url"); }
export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
