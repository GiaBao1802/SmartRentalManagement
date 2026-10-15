const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

export function parseBigIntId(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new TypeError("ID must be a positive decimal string");
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed > POSTGRES_BIGINT_MAX) throw new TypeError("ID is outside the supported range");
  return parsed;
}

export function stringifyBigInts<T>(value: T): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString(10) : item);
}

export function sendJson(response: import("express").Response, status: number, value: unknown): void {
  response.status(status).type("application/json").send(stringifyBigInts(value));
}
