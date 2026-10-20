import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

// Import the real application with test-only configuration. Never use the local DB.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/never_connect";
process.env.SESSION_SECRET = "retirement-test-only-secret-with-32-bytes";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";

test("retired Contract/Invoice paths stay 410 while V1 and health remain mounted", async (t) => {
  const { default: app } = await import("./app.js");
  const { prisma } = await import("./lib/prisma.js");
  const server = createServer(app);
  const originalQuery = prisma.$queryRaw;
  let healthQueries = 0;
  // Health wiring only: this intentionally does not validate database connectivity.
  prisma.$queryRaw = (async () => { healthQueries += 1; return [{ value: 1 }]; }) as typeof prisma.$queryRaw;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    for (const resource of ["contracts", "invoices"]) {
      for (const [method, suffix] of [["GET", ""], ["POST", ""], ["PATCH", "/123"], ["DELETE", "/123"]]) {
        await t.test(`${method} /api/${resource}${suffix} stays retired without auth or database`, async () => {
          const response = await fetch(`${origin}/api/${resource}${suffix}`, {
            method, headers: { "Content-Type": "application/json" },
            ...(method === "POST" || method === "PATCH" ? { body: "{}" } : {}),
          });
          assert.equal(response.status, 410);
          const body = await response.json();
          assert.equal(body.code, "ENDPOINT_RETIRED");
          assert.equal(body.endpoint, resource === "invoices" ? "/api/v1/invoices" : "/api/v1");
          assert.equal(healthQueries, 0);
        });
      }
    }
    await t.test("current Contract/Invoice routes retain V1 authentication", async () => {
      for (const resource of ["contracts", "invoices"]) {
        const response = await fetch(`${origin}/api/v1/${resource}`);
        assert.equal(response.status, 401);
        assert.notEqual((await response.json()).code, "ENDPOINT_RETIRED");
      }
      assert.equal(healthQueries, 0);
    });
    await t.test("current CSRF route works", async () => {
      const response = await fetch(`${origin}/api/v1/auth/csrf`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie") ?? "", /gt_csrf=/);
    });
    await t.test("legacy Accounts URL stays retired for direct access and mutations", async () => {
      for (const [method, suffix] of [["GET", ""], ["POST", ""], ["PATCH", "/123"]]) {
        const response = await fetch(`${origin}/api/admin/accounts${suffix}`, { method });
        assert.equal(response.status, 410);
        assert.equal((await response.json()).endpoint, "/api/v1/accounts");
      }
    });
    await t.test("removed demo domains retire every method and nested path without DB access", async () => {
      for (const resource of ["auth", "tenant-portal", "public/rooms", "public/viewing-requests", "tenants", "amenities", "amenity-bookings", "maintenance-requests", "viewing-requests", "options", "properties", "rooms"]) {
        for (const method of ["GET", "POST", "PATCH", "DELETE", "PUT"]) {
          const response = await fetch(`${origin}/api/${resource}/123`, { method });
          assert.equal(response.status, 410, `${method} ${resource}`);
          assert.equal((await response.json()).code, "ENDPOINT_RETIRED");
        }
      }
      assert.equal(healthQueries, 0);
    });
    await t.test("health endpoints remain available (database adapter stubbed)", async () => {
      const response = await fetch(`${origin}/api/health`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "ok");
      assert.equal(healthQueries, 0);
      const database = await fetch(`${origin}/api/health/db`);
      assert.equal(database.status, 200);
      assert.equal((await database.json()).database, "postgresql");
      assert.equal(healthQueries, 1);
    });
  } finally {
    prisma.$queryRaw = originalQuery;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
