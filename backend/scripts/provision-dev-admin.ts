import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const adminEmail = "admin.one@example.test";

function readHidden(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command in an interactive CMD or PowerShell window."));
  }

  stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") return finish(new Error("Cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u0008" || character === "\u007f") {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    };

    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function hashPassword(password: string): string {
  // Keep the local provisioning format identical to backend/src/auth/password.ts.
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Refusing to run unless NODE_ENV=development.");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing from backend/.env.");

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL in backend/.env is not a valid URL; its value is hidden.");
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || databaseUrl.port !== "5432" || databaseName !== "Goctro_test3") {
    throw new Error("Refusing to write: DATABASE_URL must target localhost:5432/Goctro_test3.");
  }

  const password = await readHidden(`New DEV password for ${adminEmail} (12+ characters; input hidden): `);
  if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
  const confirmation = await readHidden("Confirm DEV password (input hidden): ");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        account_id: string;
        owner_id: string | null;
        role: string;
        status: string;
      }>(
        `SELECT a.account_id, a.owner_id, a.role, a.status
         FROM accounts AS a
         JOIN owners AS o ON o.owner_id = a.owner_id
         WHERE lower(a.email) = lower($1)
         FOR UPDATE OF a`,
        [adminEmail],
      );

      if (result.rowCount !== 1) throw new Error("Expected exactly one seeded DEV Admin account; none or duplicates were found.");
      const account = result.rows[0]!;
      if (account.role !== "admin" || account.status !== "active" || !account.owner_id) {
        throw new Error("The existing account is not an active Admin with an Owner profile; no data was changed.");
      }

      await client.query(
        "UPDATE accounts SET password_hash = $1, updated_at = now() WHERE account_id = $2",
        [hashPassword(password), account.account_id],
      );
      await client.query("COMMIT");
      stdout.write(`DEV password updated for existing active Admin ${adminEmail}. No account was created.\n`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(`DEV Admin provisioning failed: ${message}`);
  process.exitCode = 1;
});
