import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("backend/.env DATABASE_URL is required");
const source = new URL(sourceUrl);
const originalDatabase = source.pathname.slice(1);
const safeDb = `goctro_contract_idempotency_${Date.now()}_${randomBytes(3).toString("hex")}`;
if (!/^[a-z0-9_]+$/.test(safeDb)) throw new Error("generated disposable database name was invalid");
const maintenance = new URL(source);
maintenance.pathname = "/postgres";
const admin = new pg.Client({ connectionString: maintenance.toString(), connectionTimeoutMillis: 5_000 });
let created = false;

try {
  await admin.connect();
  const server = await admin.query("SELECT current_database() AS db, inet_server_port() AS port, current_setting('server_version') AS version");
  if (!String(server.rows[0].version).startsWith("18.")) throw new Error("local PostgreSQL is not version 18");
  if (originalDatabase === safeDb) throw new Error("refusing to target the source database");
  await admin.query(`CREATE DATABASE "${safeDb}"`);
  created = true;

  const targetUrl = new URL(source);
  targetUrl.pathname = `/${safeDb}`;
  const target = new pg.Client({ connectionString: targetUrl.toString(), connectionTimeoutMillis: 5_000 });
  await target.connect();
  const dbSource = path.resolve(root, "..", "GocTro-SmartBuilding", "Database V1.5");
  const schema = await readFile(path.join(dbSource, "schema.sql"), "utf8");
  const seed = await readFile(path.resolve(dbSource, "..", "Database V1.4", "seed.sql"), "utf8");
  await target.query(schema);
  await target.query(seed);
  const tableCount = await target.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
  if (tableCount.rows[0].count !== 28) throw new Error(`disposable Database V1.5 expected 28 tables; found ${tableCount.rows[0].count}`);
  await target.end();

  const env = {
    ...process.env,
    CONTRACT_IDEMPOTENCY_TEST_DATABASE_URL: targetUrl.toString(),
    CONTRACT_IDEMPOTENCY_ACTIVE_KEY_VERSION: "runtime-test-key-v1",
    CONTRACT_IDEMPOTENCY_KEYS_JSON: JSON.stringify({ "runtime-test-key-v1": randomBytes(32).toString("base64") }),
  };
  console.log(`Disposable PostgreSQL 18 database prepared: ${safeDb} (28 V1.5 tables, V1.4 synthetic seed).`);
  const testFile = path.join(root, "backend", "src", "contracts", "contract-idempotency.integration.test.ts");
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(process.execPath, [tsx, "--test", testFile], { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  console.error("Disposable PostgreSQL Contract runtime validation failed.", error instanceof Error ? error.message.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[redacted]") : "Unknown error");
  process.exitCode = 1;
} finally {
  if (created) {
    try { await admin.query(`DROP DATABASE "${safeDb}" WITH (FORCE)`); console.log(`Disposable database removed: ${safeDb}.`); }
    catch { console.error(`Could not remove disposable database ${safeDb}; manual cleanup may be required.`); process.exitCode = 1; }
  }
  await admin.end().catch(() => undefined);
}
