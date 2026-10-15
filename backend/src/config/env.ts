import "dotenv/config";
import { randomBytes } from "node:crypto";

export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  frontendOrigin: string;
  sessionSecret: string;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  loginMaxAttempts: number;
  loginWindowMinutes: number;
};

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = source.NODE_ENV ?? "development";
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  let parsedDatabaseUrl: URL;
  try { parsedDatabaseUrl = new URL(databaseUrl); } catch { throw new Error("DATABASE_URL must be a valid URL"); }
  if (parsedDatabaseUrl.protocol !== "postgres:" && parsedDatabaseUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }

  if (nodeEnv === "production" && !source.FRONTEND_ORIGIN) throw new Error("FRONTEND_ORIGIN is required in production");
  const frontendOrigin = source.FRONTEND_ORIGIN ?? "http://localhost:3000";
  let parsedFrontendOrigin: URL;
  try { parsedFrontendOrigin = new URL(frontendOrigin); } catch { throw new Error("FRONTEND_ORIGIN must be a valid origin"); }
  if (parsedFrontendOrigin.origin !== frontendOrigin || frontendOrigin === "*") {
    throw new Error("FRONTEND_ORIGIN must be one exact origin; wildcard origins are not allowed");
  }

  let sessionSecret = source.SESSION_SECRET ?? "";
  if (nodeEnv === "production" && Buffer.byteLength(sessionSecret) < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes in production");
  }
  if (nodeEnv === "production" && /replace|change[-_ ]?me|example/i.test(sessionSecret)) {
    throw new Error("SESSION_SECRET must not use a placeholder value in production");
  }
  if (nodeEnv !== "production" && !sessionSecret) sessionSecret = randomBytes(32).toString("base64url");
  if (nodeEnv !== "production" && Buffer.byteLength(sessionSecret) < 16) {
    throw new Error("SESSION_SECRET must contain at least 16 bytes when configured");
  }

  const port = positiveInteger(source.PORT, 4000, "PORT");
  if (port > 65535) throw new Error("PORT must be between 1 and 65535");

  return {
    nodeEnv,
    port,
    databaseUrl,
    frontendOrigin,
    sessionSecret,
    sessionIdleMinutes: positiveInteger(source.SESSION_IDLE_MINUTES, 30, "SESSION_IDLE_MINUTES"),
    sessionAbsoluteHours: positiveInteger(source.SESSION_ABSOLUTE_HOURS, 12, "SESSION_ABSOLUTE_HOURS"),
    loginMaxAttempts: positiveInteger(source.AUTH_LOGIN_MAX_ATTEMPTS, 10, "AUTH_LOGIN_MAX_ATTEMPTS"),
    loginWindowMinutes: positiveInteger(source.AUTH_LOGIN_WINDOW_MINUTES, 15, "AUTH_LOGIN_WINDOW_MINUTES"),
  };
}

export const runtimeConfig = loadEnv();
