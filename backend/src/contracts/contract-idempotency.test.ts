import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EnvironmentContractResponseKeyProvider,
  canonicalContractJson,
  contractFingerprintForVersion,
  decryptContractReplay,
  encryptContractReplay,
  hashIdempotencyKey,
} from "./contract-idempotency.js";
import { ApiError } from "../middleware/api-error.js";
import { Prisma } from "@prisma/client";

test("idempotency key persists only a stable SHA-256 digest", () => {
  const digest = hashIdempotencyKey("retry-key-1");
  assert.equal(digest.length, 32);
  assert.equal(digest.toString("hex"), hashIdempotencyKey("retry-key-1").toString("hex"));
  assert.notEqual(digest.toString("ascii"), "retry-key-1");
});

test("canonical JSON sorts object keys and preserves array order", () => {
  assert.equal(canonicalContractJson({ z: 1, a: { y: 2, x: 1 } }), '{"a":{"x":1,"y":2},"z":1}');
  assert.notEqual(canonicalContractJson(["a", "b"]), canonicalContractJson(["b", "a"]));
});

test("fingerprint normalization stabilizes BigInt, dates, decimal and money integers", () => {
  const a = { resident_id: 9007199254740993n, start_date: new Date("2026-10-15T00:00:00.000Z"), amount: 3500000n, reading: new Prisma.Decimal("12.500") };
  const b = { reading: new Prisma.Decimal("12.5"), amount: 3500000n, start_date: new Date("2026-10-15T00:00:00.000Z"), resident_id: 9007199254740993n };
  assert.equal(canonicalContractJson(a), canonicalContractJson(b));
  assert.match(canonicalContractJson(a), /"9007199254740993"/);
  assert.match(canonicalContractJson(a), /"2026-10-15"/);
  assert.match(canonicalContractJson(a), /"12.5"/);
});

test("null and omitted fields remain distinct and semantic changes change fingerprint", () => {
  const scope = "contracts.create";
  assert.notEqual(contractFingerprintForVersion(1, "POST", scope, { initial_water_m3: null }).toString("hex"), contractFingerprintForVersion(1, "POST", scope, {}).toString("hex"));
  assert.notEqual(contractFingerprintForVersion(1, "POST", scope, { rent_amount: 10n }).toString("hex"), contractFingerprintForVersion(1, "POST", scope, { rent_amount: 11n }).toString("hex"));
  assert.notEqual(contractFingerprintForVersion(1, "POST", scope, {}).toString("hex"), contractFingerprintForVersion(1, "PUT", scope, {}).toString("hex"));
});

test("AES-256-GCM replay encrypts/decrypts and authenticates associated data", () => {
  const key = Buffer.alloc(32, 7); const aad = Buffer.from('["request","owner","scope"]');
  const encrypted = encryptContractReplay(Buffer.from('{"data":{"contract_id":"1"}}'), key, "v1", aad, Buffer.alloc(12, 4));
  assert.equal(decryptContractReplay(encrypted.ciphertext, encrypted.nonce, encrypted.authTag, key, aad).toString(), '{"data":{"contract_id":"1"}}');
  assert.throws(() => decryptContractReplay(encrypted.ciphertext, encrypted.nonce, encrypted.authTag, key, Buffer.from("swapped")), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === "IDEMPOTENCY_REPLAY_UNAVAILABLE");
  assert.throws(() => decryptContractReplay(encrypted.ciphertext, encrypted.nonce, encrypted.authTag, Buffer.alloc(32, 8), aad), (error: unknown) => error instanceof ApiError && error.status === 503);
});

test("key provider resolves active and historical versions without exposing key material", () => {
  const oldKey = Buffer.alloc(32, 1).toString("base64"); const newKey = Buffer.alloc(32, 2).toString("base64");
  const provider = new EnvironmentContractResponseKeyProvider({ CONTRACT_IDEMPOTENCY_ACTIVE_KEY_VERSION: "new", CONTRACT_IDEMPOTENCY_KEYS_JSON: JSON.stringify({ old: oldKey, new: newKey }) });
  assert.equal(provider.active().version, "new");
  assert.equal(provider.active().key.length, 32);
  assert.equal(provider.byVersion("old")?.length, 32);
  assert.equal(provider.byVersion("missing"), undefined);
  assert.throws(() => new EnvironmentContractResponseKeyProvider({}).active(), (error: unknown) => error instanceof ApiError && error.status === 503);
});

test("unknown historical fingerprint version fails closed", () => {
  assert.throws(() => contractFingerprintForVersion(2, "POST", "contracts.create", {}), (error: unknown) => error instanceof ApiError && error.status === 503);
});
