import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";
import { stringifyBigInts } from "../utils/ids.js";

export const CONTRACT_FINGERPRINT_VERSION = 1;
const DOMAIN = "goctro-contract-idempotency:v1\n";
const REPLAY_UNAVAILABLE = () => new ApiError(503, "IDEMPOTENCY_REPLAY_UNAVAILABLE", "Yêu cầu chưa thể được xử lý an toàn. Vui lòng thử lại sau.");

export interface ContractResponseKeyProvider {
  active(): { version: string; key: Buffer };
  byVersion(version: string): Buffer | undefined;
}

/** Keys are injected by deployment secret management; local keys belong in ignored backend/.env only. */
export class EnvironmentContractResponseKeyProvider implements ContractResponseKeyProvider {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  active() {
    const version = this.env.CONTRACT_IDEMPOTENCY_ACTIVE_KEY_VERSION;
    if (!version || !/^[A-Za-z0-9._-]{1,64}$/.test(version)) throw REPLAY_UNAVAILABLE();
    const key = this.byVersion(version);
    if (!key) throw REPLAY_UNAVAILABLE();
    return { version, key };
  }
  byVersion(version: string) {
    const raw = this.env.CONTRACT_IDEMPOTENCY_KEYS_JSON;
    if (!raw) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
      const encoded = (parsed as Record<string, unknown>)[version];
      if (typeof encoded !== "string" || !/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(encoded)) return undefined;
      const key = Buffer.from(encoded, "base64");
      return key.length === 32 ? key : undefined;
    } catch { return undefined; }
  }
}

export function hashIdempotencyKey(rawKey: string): Buffer {
  return createHash("sha256").update(rawKey, "ascii").digest();
}

function decimalCanonical(value: Prisma.Decimal): string {
  const fixed = value.toFixed();
  if (!fixed.includes(".")) return fixed;
  const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
}

export function normalizeFingerprintValue(value: unknown): unknown {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) {
    if (!Number.isFinite(value.valueOf())) throw new TypeError("Invalid date in idempotency input");
    return value.toISOString().slice(0, 10);
  }
  if (value instanceof Prisma.Decimal) return decimalCanonical(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Idempotency input numbers must be safe integers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeFingerprintValue(item) ?? null);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = normalizeFingerprintValue(item);
    }
    return result;
  }
  throw new TypeError("Unsupported value in idempotency input");
}

/** JCS-compatible subset for the validated Contract DTOs (integer numbers only). */
export function canonicalContractJson(value: unknown): string {
  return JSON.stringify(normalizeFingerprintValue(value));
}

export function contractFingerprintForVersion(version: number, method: string, operationScope: string, semanticInput: unknown): Buffer {
  if (version !== 1) throw REPLAY_UNAVAILABLE();
  const bytes = `${DOMAIN}${method.toUpperCase()}\n${operationScope}\n${canonicalContractJson(semanticInput)}`;
  return createHash("sha256").update(bytes, "utf8").digest();
}

function aadFor(row: { requestId: bigint; ownerId: bigint; accountId: bigint; operationScope: string; keyHash: Uint8Array; fingerprint: Uint8Array }): Buffer {
  return Buffer.from(JSON.stringify([
    "goctro-contract-idempotency:aad:v1", row.requestId.toString(10), row.ownerId.toString(10),
    row.accountId.toString(10), row.operationScope, Buffer.from(row.keyHash).toString("hex"), Buffer.from(row.fingerprint).toString("hex"),
  ]), "utf8");
}

export function encryptContractReplay(plaintext: Buffer, key: Buffer, keyVersion: string, aad: Buffer, nonce = randomBytes(12)) {
  if (key.length !== 32 || nonce.length !== 12 || !keyVersion || keyVersion.length > 64) throw REPLAY_UNAVAILABLE();
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion };
}

export function decryptContractReplay(ciphertext: Uint8Array, nonce: Uint8Array, authTag: Uint8Array, key: Buffer, aad: Buffer): Buffer {
  try {
    if (key.length !== 32 || nonce.length !== 12 || authTag.length !== 16) throw new Error("invalid encrypted replay envelope");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(authTag));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  } catch { throw REPLAY_UNAVAILABLE(); }
}

export type ContractIdempotentResponse = { status: number; body: unknown };
export type ContractIdempotentResult = { status: number; body: string; replayed: boolean };
export type ContractIdempotentCommand = {
  ownerId: bigint;
  accountId: bigint;
  method: "POST";
  operationScope: string;
  idempotencyKey: string;
  semanticInput: unknown;
  executeMutation: (tx: Prisma.TransactionClient) => Promise<ContractIdempotentResponse>;
};

type ReplayRow = {
  request_id: bigint; request_fingerprint: Uint8Array; fingerprint_version: number; state: string;
  response_status: number | null; response_ciphertext: Uint8Array | null; response_nonce: Uint8Array | null;
  response_auth_tag: Uint8Array | null; response_key_version: string | null;
};

export class ContractIdempotencyService {
  constructor(private readonly prisma: PrismaClient, private readonly keys: ContractResponseKeyProvider, private readonly maxRetries = 3) {}

  async execute(command: ContractIdempotentCommand): Promise<ContractIdempotentResult> {
    const keyHash = hashIdempotencyKey(command.idempotencyKey);
    const fingerprint = contractFingerprintForVersion(CONTRACT_FINGERPRINT_VERSION, command.method, command.operationScope, command.semanticInput);
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const inserted = await tx.$queryRaw<Array<{ request_id: bigint }>>`
            INSERT INTO contract_idempotency_requests
              (owner_id, account_id, operation_scope, idempotency_key_hash, request_fingerprint, fingerprint_version, state)
            VALUES (${command.ownerId}, ${command.accountId}, ${command.operationScope}, ${keyHash}, ${fingerprint}, ${CONTRACT_FINGERPRINT_VERSION}, 'in_progress')
            ON CONFLICT (owner_id, account_id, operation_scope, idempotency_key_hash) DO NOTHING
            RETURNING request_id`;

          if (inserted.length === 0) {
            const rows = await tx.$queryRaw<ReplayRow[]>`
              SELECT request_id, request_fingerprint, fingerprint_version, state, response_status,
                     response_ciphertext, response_nonce, response_auth_tag, response_key_version
              FROM contract_idempotency_requests
              WHERE owner_id = ${command.ownerId} AND account_id = ${command.accountId}
                AND operation_scope = ${command.operationScope} AND idempotency_key_hash = ${keyHash}
              FOR UPDATE`;
            const row = rows[0];
            if (!row) throw REPLAY_UNAVAILABLE();
            let expected: Buffer;
            try { expected = contractFingerprintForVersion(row.fingerprint_version, command.method, command.operationScope, command.semanticInput); }
            catch (error) { this.logUnavailable(row.request_id, command.operationScope, "fingerprint_version_unavailable"); throw error; }
            const savedFingerprint = Buffer.from(row.request_fingerprint);
            if (savedFingerprint.length !== expected.length || !timingSafeEqual(savedFingerprint, expected)) {
              throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "Khóa Idempotency-Key đã được sử dụng với dữ liệu khác.");
            }
            if (row.state !== "completed" || row.response_status === null || !row.response_ciphertext || !row.response_nonce || !row.response_auth_tag || !row.response_key_version) {
              this.logUnavailable(row.request_id, command.operationScope, "committed_in_progress_or_incomplete");
              throw REPLAY_UNAVAILABLE();
            }
            const replayKey = this.keys.byVersion(row.response_key_version);
            if (!replayKey) { this.logUnavailable(row.request_id, command.operationScope, "key_version_unavailable"); throw REPLAY_UNAVAILABLE(); }
            const plain = decryptContractReplay(row.response_ciphertext, row.response_nonce, row.response_auth_tag, replayKey, aadFor({
              requestId: row.request_id, ownerId: command.ownerId, accountId: command.accountId, operationScope: command.operationScope,
              keyHash, fingerprint: savedFingerprint,
            }));
            return { status: row.response_status, body: plain.toString("utf8"), replayed: true };
          }

          const requestId = inserted[0]!.request_id;
          // Resolve the active key only for a new command. Existing records must remain
          // replayable by their stored key version even during key rotation.
          const activeKey = this.keys.active();
          const response = await command.executeMutation(tx);
          if (response.status < 200 || response.status >= 300) throw new Error("Only successful Contract responses can be committed as idempotent results");
          const serialized = Buffer.from(stringifyBigInts(response.body), "utf8");
          const encrypted = encryptContractReplay(serialized, activeKey.key, activeKey.version, aadFor({
            requestId, ownerId: command.ownerId, accountId: command.accountId, operationScope: command.operationScope,
            keyHash, fingerprint,
          }));
          const updated = await tx.$executeRaw`
            UPDATE contract_idempotency_requests SET state = 'completed', response_status = ${response.status},
              response_ciphertext = ${encrypted.ciphertext}, response_nonce = ${encrypted.nonce}, response_auth_tag = ${encrypted.authTag},
              response_key_version = ${encrypted.keyVersion}, completed_at = clock_timestamp()
            WHERE request_id = ${requestId} AND state = 'in_progress'`;
          if (updated !== 1) throw REPLAY_UNAVAILABLE();
          return { status: response.status, body: serialized.toString("utf8"), replayed: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt >= this.maxRetries) throw error;
      }
    }
  }

  private logUnavailable(requestId: bigint, operationScope: string, reason: string) {
    console.error(JSON.stringify({ event: "contract_idempotency_replay_unavailable", request_id: requestId.toString(), operation_scope: operationScope, reason }));
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    const metaCode = error.meta?.code;
    return metaCode === "40001" || metaCode === "40P01";
  }
  if (error && typeof error === "object" && "code" in error) return ["40001", "40P01"].includes(String((error as { code: unknown }).code));
  return false;
}
