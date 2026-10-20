/** Disposable-only browser harness. Never uses backend/.env or the normal database. */
import express from "express";
import { createServer } from "node:http";
import { PrismaContractRepository } from "../src/contracts/contract.repository.js";
import { ContractIdempotencyService, EnvironmentContractResponseKeyProvider } from "../src/contracts/contract-idempotency.js";
import { ContractDocumentService } from "../src/contract-documents/contract-document.service.js";
import { UnconfiguredObjectStorage } from "../src/contract-documents/object-storage.js";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline";
import { createV1Router } from "../src/auth/v1.router.js";
import { PrismaAuthRepository } from "../src/auth/account-repository.js";
import { InMemorySessionStore } from "../src/auth/session-store.js";
import { hashPassword } from "../src/auth/password.js";
import { PrismaAccountManagementRepository } from "../src/accounts/account.repository.js";
import { PrismaResidentOccupancyRepository } from "../src/residents/resident.repository.js";
import { PrismaEnrollmentRepository } from "../src/accounts/enrollment.repository.js";
import { EnrollmentService } from "../src/accounts/enrollment.service.js";
import { HarnessEnrollmentDelivery } from "../src/accounts/credential-infrastructure.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import type { RuntimeConfig } from "../src/config/env.js";
const url = process.env.GOCTRO_ENROLLMENT_TEST_DATABASE_URL;
if (process.env.NODE_ENV !== "test" || !url) throw Error("Requires explicit NODE_ENV=test and disposable test URL");
const target = new URL(url);
if (target.hostname !== "127.0.0.1" || target.port !== "55450" || target.username !== "v18_smoke" || target.pathname !== "/goctro_enrollment_20261018") throw Error("Disposable target guard rejected");
const prisma = new PrismaClient({ datasources: { db: { url } } });
const rows = await prisma.$queryRaw<Array<{ db: string; port: number; role: string; tables: number }>>`SELECT current_database() AS db,inet_server_port() AS port,current_user AS role,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables`;
if (rows[0]?.db !== "goctro_enrollment_20261018" || rows[0]?.port !== 55450 || rows[0]?.role !== "v18_smoke" || rows[0]?.tables !== 40) throw Error("Runtime identity mismatch");
// Optional resume is restricted to the already guarded disposable DB and exact synthetic fixture identity.
const resume = process.env.GOCTRO_ENROLLMENT_BROWSER_OWNER_ID;
if (resume && !/^[1-9][0-9]*$/.test(resume)) throw Error("Invalid disposable resume ID");
const owner = resume ? await prisma.owner.findUniqueOrThrow({ where: { ownerId: BigInt(resume) } }) : await prisma.owner.create({ data: { displayName: "Enrollment browser synthetic Owner" } });
if (owner.displayName !== "Enrollment browser synthetic Owner") throw Error("Not a synthetic browser fixture");
const admin = resume ? await prisma.account.findFirstOrThrow({ where: { ownerId: owner.ownerId, role: "admin", email: `browser-admin-${owner.ownerId}@example.test` } }) : await prisma.account.create({ data: { ownerId: owner.ownerId, role: "admin", email: `browser-admin-${owner.ownerId}@example.test`, passwordHash: await hashPassword("Enrollment-Browser-2026!") } });
const resident = resume ? await prisma.resident.findFirstOrThrow({ where: { ownerId: owner.ownerId, fullName: "Enrollment Browser Resident", phone: "+848" + owner.ownerId.toString().padStart(8, "0") } }) : await prisma.resident.create({ data: { ownerId: owner.ownerId, fullName: "Enrollment Browser Resident", phone: "+848" + owner.ownerId.toString().padStart(8, "0") } });
const delivery = new HarnessEnrollmentDelivery("test");
delivery.bindings.set(`${owner.ownerId}:${resident.residentId}:${resident.phone}`, { ownerId: owner.ownerId, residentId: resident.residentId, phone: resident.phone!, subject: "browser-resident" });
const sessions = new InMemorySessionStore();
const storage = new UnconfiguredObjectStorage();
let clockOffset = 0;
const enrollment = new EnrollmentService(new PrismaEnrollmentRepository(prisma), sessions, delivery, "test", () => new Date(Date.now() + clockOffset));
const config: RuntimeConfig = { nodeEnv: "test", port: 4002, databaseUrl: url, frontendOrigin: "http://localhost:3002", sessionSecret: "synthetic-browser-enrollment-session-secret-2026", sessionIdleMinutes: 30, sessionAbsoluteHours: 12, loginMaxAttempts: 1000, loginWindowMinutes: 15 };
let inspectionFault = false; const counters = { acceptRequests: 0, acceptSuccess: 0, resetRequests: 0, resetSuccess: 0 };
const app = express(); app.use(cors({ origin: config.frontendOrigin, credentials: true })); app.use(express.json());
app.use("/api/v1/auth", (request, response, next) => {
  if (request.path === "/credential-link/inspect" && inspectionFault) { response.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Kênh kiểm tra tạm thời không khả dụng. Vui lòng thử lại." } }); return; }
  const kind = request.path === "/accept-invitation" ? "accept" : request.path === "/reset-password" ? "reset" : null;
  if (kind && request.method === "POST") { counters[kind === "accept" ? "acceptRequests" : "resetRequests"]++; response.on("finish", () => { if (response.statusCode === 200) counters[kind === "accept" ? "acceptSuccess" : "resetSuccess"]++; }); setTimeout(next, 1500); } else next();
});
app.use("/api/v1", createV1Router({ config, repository: new PrismaAuthRepository(prisma), sessions, enrollment, accountManagementRepository: new PrismaAccountManagementRepository(prisma), residentOccupancyRepository: new PrismaResidentOccupancyRepository(prisma), contractRepository: new PrismaContractRepository(prisma), contractIdempotency: new ContractIdempotencyService(prisma, new EnvironmentContractResponseKeyProvider({})), objectStorage: storage, contractDocumentService: new ContractDocumentService(prisma, storage) })); app.use(errorHandler);
const server = createServer(app);
server.once("error", () => { console.error("Disposable harness cannot bind port 4002; refusing false READY."); void prisma.$disconnect().finally(() => process.exit(1)); });
server.listen(4002, "127.0.0.1", () => console.log(`DISPOSABLE HARNESS READY backend4002 frontend3002 Admin=${admin.email} Resident=${resident.residentId} phone=${resident.phone}. Retrieval is CLI-only: type invitation or reset. Never redirect harness stdout to logs.`));
const terminal = createInterface({ input: process.stdin, output: process.stdout });
terminal.on("line", line => { void command(line.trim()).catch(() => console.error("Harness command failed; sensitive values omitted.")); });
function printLink(purpose: "invitation" | "reset", subject = "browser-resident", expired = false) {
  const token = expired ? delivery.retrieveExpiredForTest(subject, purpose) : delivery.retrieve(subject, purpose);
  if (token) process.stdout.write(`http://localhost:3002/${purpose === "invitation" ? "accept-invitation" : "reset-password"}#token=${token}\n`);
  else process.stdout.write("No live link for this purpose. Issue it via the application first.\n");
}
async function command(line: string) {
  if (line === "invitation" || line === "reset") { printLink(line); return; }
  if (line === "fault-inspect-on" || line === "fault-inspect-off") { inspectionFault = line.endsWith("-on"); console.log("Inspection fault", inspectionFault ? "ON" : "OFF"); return; }
  if (line === "status") {
    const invitation = await prisma.accountInvitation.findMany({ where: { residentId: resident.residentId }, select: { status: true, acceptedAt: true } });
    const account = await prisma.account.findUnique({ where: { residentId: resident.residentId }, select: { role: true, status: true } });
    console.log(JSON.stringify({ invitation, account, counters })); return;
  }
  if (line === "expired-invitation") {
    const fixture = await prisma.resident.create({ data: { ownerId: owner.ownerId, fullName: "Expired invitation synthetic fixture", phone: "+847" + (Number(owner.ownerId) * 100 + Date.now() % 100).toString().padStart(8, "0") } });
    const subject = "expired-" + fixture.residentId;
    delivery.bindings.set(`${owner.ownerId}:${fixture.residentId}:${fixture.phone}`, { ownerId: owner.ownerId, residentId: fixture.residentId, phone: fixture.phone!, subject });
    clockOffset = -25 * 60 * 60_000;
    try { await enrollment.issue(owner.ownerId, fixture.residentId, admin.accountId, "expired-fixture-" + fixture.residentId, false); } finally { clockOffset = 0; }
    printLink("invitation", subject, true); return;
  }
  if (line === "expired-reset") {
    clockOffset = -31 * 60_000;
    try { await enrollment.forgot(resident.phone!); } finally { clockOffset = 0; }
    printLink("reset", "browser-resident", true); return;
  }
}
async function stop() { terminal.close(); delivery.clear(); server.close(); await prisma.$disconnect(); process.exit(0); }
process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
