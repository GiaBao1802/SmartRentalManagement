import { stdin, stdout } from "node:process";
import { Pool } from "pg";
import dotenv from "dotenv";
import { hashPassword } from "../src/auth/password.js";
import { normalizeVietnamPhone } from "../src/accounts/credential-infrastructure.js";

dotenv.config();
const adminEmail = "admin.one@example.test";
const residentEmail = "resident.one@example.test";
const residentPhoneFixture = "+84000000101";

function readHidden(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return Promise.reject(new Error("Run this command in an interactive CMD or PowerShell window."));
  stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData); stdout.write("\n"); error ? reject(error) : resolve(value); };
    const onData = (chunk: Buffer | string) => { for (const character of String(chunk)) { if (character === "\u0003") return finish(new Error("Cancelled.")); if (character === "\r" || character === "\n") return finish(); if (character === "\u0008" || character === "\u007f") { if (value.length) { value = value.slice(0, -1); stdout.write("\b \b"); } continue; } if (character >= " ") { value += character; stdout.write("*"); } } };
    stdin.setEncoding("utf8"); stdin.setRawMode(true); stdin.resume(); stdin.on("data", onData);
  });
}

async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Refusing to run unless NODE_ENV=development.");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing from backend/.env.");
  let databaseUrl: URL; try { databaseUrl = new URL(connectionString); } catch { throw new Error("DATABASE_URL is invalid; its value is hidden."); }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
  const isSupportedPort = databaseUrl.port === "5432" || databaseUrl.port === "55448";
  const isDisposableTarget = databaseUrl.port === "55448" && databaseName.startsWith("goctro_setup_test_");
  if (!isLoopback || !isSupportedPort || ["postgres", "template0", "template1"].includes(databaseName) || (databaseUrl.port === "55448" && !isDisposableTarget)) throw new Error("Refusing to write: target must be local port 5432, or disposable 127.0.0.1:55448 with database prefix goctro_setup_test_.");

  const mode = (await readHidden("Type INITIAL for first setup or RESET to replace provisioned credentials: ")).toUpperCase();
  if (mode !== "INITIAL" && mode !== "RESET") throw new Error("Choose INITIAL or RESET explicitly.");
  if (mode === "RESET" && await readHidden(`Type RESET ${databaseName} to confirm target: `) !== `RESET ${databaseName}`) throw new Error("Target confirmation did not match.");

  if (mode === "INITIAL") {
    const preflightPool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
    try {
      const client = await preflightPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        const target = await client.query<{ major: string; table_count: number }>("SELECT split_part(current_setting('server_version'), '.', 1) AS major, (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS table_count");
        if (target.rows[0]?.major !== "18" || target.rows[0]?.table_count !== 40) throw new Error("Target is not PostgreSQL 18 V1.8 with 40 public tables; no data changed.");
        const admin = await client.query<{ account_id: string; owner_id: string | null; role: string; status: string }>(`SELECT a.account_id,a.owner_id,a.role,a.status FROM accounts a JOIN owners o ON o.owner_id=a.owner_id WHERE lower(a.email)=lower($1) AND a.role='admin' FOR UPDATE OF a`, [adminEmail]);
        const resident = await client.query<{ account_id: string; owner_id: string | null; resident_id: string | null; role: string; status: string; resident_owner_id: string; occupancy_count: number; contract_count: number }>(`SELECT a.account_id,a.owner_id,a.resident_id,a.role,a.status,r.owner_id AS resident_owner_id,(SELECT count(*)::int FROM room_residents rr WHERE rr.resident_id=r.resident_id AND rr.owner_id=r.owner_id AND rr.status='active' AND rr.ended_at IS NULL) AS occupancy_count,(SELECT count(*)::int FROM contracts c WHERE c.representative_resident_id=r.resident_id AND c.owner_id=r.owner_id AND c.status='active' AND c.end_date>=CURRENT_DATE) AS contract_count FROM accounts a JOIN residents r ON r.resident_id=a.resident_id WHERE lower(a.email)=lower($1) AND a.role='resident' FOR UPDATE OF a`, [residentEmail]);
        if (admin.rowCount !== 1 || resident.rowCount !== 1) throw new Error("Expected exactly one seeded Admin and Resident account; no data changed.");
        const a = admin.rows[0]!, r = resident.rows[0]!;
        if (a.role !== "admin" || a.status !== "active" || !a.owner_id) throw new Error("Admin fixture is not active or lacks a valid Owner; no data changed.");
        if (r.role !== "resident" || r.status !== "active" || !r.resident_id || r.resident_owner_id !== a.owner_id || r.occupancy_count < 1 || r.contract_count < 1) throw new Error("Resident fixture is not active, correctly linked, or portal-ready; no data changed.");
        const hashes = await client.query<{ provisioned_count: number }>("SELECT count(*)::int AS provisioned_count FROM accounts WHERE account_id IN ($1,$2) AND password_hash ~ '^scrypt\\$[a-fA-F0-9]{32}\\$[a-fA-F0-9]{128}$'", [a.account_id, r.account_id]);
        const provisionedCount = hashes.rows[0]?.provisioned_count ?? 0;
        if (provisionedCount > 0) throw new Error(provisionedCount === 2 ? "Credentials are already provisioned; choose RESET and confirm the target." : "Credential state is partial or uncertain; choose RESET and confirm the target.");
        await client.query("ROLLBACK");
      } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
    } finally { await preflightPool.end(); }
  }

  const adminPassword = await readHidden(`New DEV password for ${adminEmail} (12-1024 characters; input hidden): `);
  const adminConfirmation = await readHidden("Confirm Admin password (input hidden): ");
  const residentPassword = await readHidden(`New DEV password for Resident ${residentEmail} (12-1024 characters; input hidden): `);
  const residentConfirmation = await readHidden("Confirm Resident password (input hidden): ");
  for (const [label, password, confirmation] of [["Admin", adminPassword, adminConfirmation], ["Resident", residentPassword, residentConfirmation]] as const) { if (password.length < 12 || password.length > 1024) throw new Error(`${label} password must be 12-1024 characters.`); if (password !== confirmation) throw new Error(`${label} passwords do not match.`); }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try { const client = await pool.connect(); try {
    await client.query("BEGIN"); await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const target = await client.query<{ database_name: string; major: string; table_count: number }>("SELECT current_database() AS database_name, split_part(current_setting('server_version'), '.', 1) AS major, (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS table_count");
    if (target.rows[0]?.major !== "18" || target.rows[0]?.table_count !== 40) throw new Error("Target is not PostgreSQL 18 V1.8 with 40 public tables; no data changed.");
    const admin = await client.query<{ account_id: string; owner_id: string | null; role: string; status: string }>(`SELECT a.account_id,a.owner_id,a.role,a.status FROM accounts a JOIN owners o ON o.owner_id=a.owner_id WHERE lower(a.email)=lower($1) FOR UPDATE OF a`, [adminEmail]);
    const residentPhoneValid = (() => { try { normalizeVietnamPhone(residentPhoneFixture); return true; } catch { return false; } })();
    const resident = await client.query<{ account_id: string; owner_id: string | null; resident_id: string | null; role: string; status: string; resident_owner_id: string; occupancy_count: number; contract_count: number }>(`SELECT a.account_id,a.owner_id,a.resident_id,a.role,a.status,r.owner_id AS resident_owner_id,(SELECT count(*)::int FROM room_residents rr WHERE rr.resident_id=r.resident_id AND rr.owner_id=r.owner_id AND rr.status='active' AND rr.ended_at IS NULL) AS occupancy_count,(SELECT count(*)::int FROM contracts c WHERE c.representative_resident_id=r.resident_id AND c.owner_id=r.owner_id AND c.status='active' AND c.end_date>=CURRENT_DATE) AS contract_count FROM accounts a JOIN residents r ON r.resident_id=a.resident_id WHERE lower(a.email)=lower($1) AND a.role='resident' FOR UPDATE OF a`, [residentEmail]);
    if (admin.rowCount !== 1 || resident.rowCount !== 1) throw new Error("Expected exactly one seeded Admin and Resident account; no data changed.");
    const a = admin.rows[0]!, r = resident.rows[0]!;
    if (a.role !== "admin" || a.status !== "active" || !a.owner_id) throw new Error("Admin fixture is not active or lacks a valid Owner; no data changed.");
    if (r.role !== "resident" || r.status !== "active" || !r.resident_id || r.resident_owner_id !== a.owner_id || r.occupancy_count < 1 || r.contract_count < 1) throw new Error("Resident fixture is not active, correctly linked, or portal-ready; no data changed.");
    if (mode === "INITIAL") { const hashes = await client.query<{ password_hash: string }>("SELECT password_hash FROM accounts WHERE account_id IN ($1,$2) FOR UPDATE", [a.account_id, r.account_id]); if (hashes.rows.some(row => row.password_hash.startsWith("scrypt$") && row.password_hash.split("$").length === 3)) throw new Error("Credentials appear already provisioned; choose RESET and confirm the target."); }
    await client.query("UPDATE accounts SET password_hash=$1,updated_at=now() WHERE account_id=$2", [await hashPassword(adminPassword), a.account_id]);
    await client.query("UPDATE accounts SET password_hash=$1,updated_at=now() WHERE account_id=$2", [await hashPassword(residentPassword), r.account_id]);
    await client.query("COMMIT"); stdout.write(`DEV credentials provisioned on ${target.rows[0]!.database_name}.\nAdmin email: ${adminEmail}\nResident login email: ${residentEmail}\nResident phone fixture: ${residentPhoneFixture} (not accepted by Auth V1; email fallback used)\nNo Account was created; role/status/profile data were not changed.\n`);
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); } } finally { await pool.end(); }
}
main().catch((error: unknown) => { const message = error instanceof Error ? error.message : "Unknown error."; console.error(`DEV credential provisioning failed: ${message}`); process.exitCode = 1; });
