import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "backend" });
});

app.get("/api/health/db", async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: "ok", database: "postgresql" });
  } catch {
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

type SessionPayload = { sub: string; role: string; name: string; exp: number };
const sessionSecret = process.env.AUTH_SECRET ?? "local-only-change-this-session-secret";
const sessionCookie = "goctro_session";

function sign(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function readSession(request: express.Request): SessionPayload | null {
  const cookieHeader = request.headers.cookie ?? "";
  const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
  if (!token) return null;
  const [body, providedSignature] = token.split(".");
  if (!body || !providedSignature) return null;
  const expectedSignature = createHmac("sha256", sessionSecret).update(body).digest();
  let signature: Buffer;
  try { signature = Buffer.from(providedSignature, "base64url"); } catch { return null; }
  if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function activeSession(request: express.Request) {
  const session = readSession(request);
  if (!session) return null;
  const account = await prisma.userAccount.findUnique({ where: { id: session.sub }, select: { role: true, isActive: true } });
  return account?.isActive && account.role === session.role ? session : null;
}

function requireAdmin(request: express.Request, response: express.Response, next: express.NextFunction) {
  void activeSession(request).then((session) => {
    if (!session) { response.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục.", code: "UNAUTHENTICATED" }); return; }
    if (session.role !== "ADMIN" && session.role !== "LANDLORD") { response.status(403).json({ error: "Tài khoản không có quyền quản lý.", code: "FORBIDDEN" }); return; }
    next();
  }).catch(next);
}

function currentSession(request: express.Request) { return readSession(request); }

async function canManageProperty(request: express.Request, propertyId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.property.findFirst({ where: { id: propertyId, ownerId: session.sub }, select: { id: true } }));
}

async function canManageTenant(request: express.Request, tenantId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.tenant.findFirst({ where: { id: tenantId, OR: [{ createdById: session.sub }, { contracts: { some: { room: { property: { ownerId: session.sub } } } } }] }, select: { id: true } }));
}

async function canManageRoom(request: express.Request, roomId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.room.findFirst({ where: { id: roomId, property: { ownerId: session.sub } }, select: { id: true } }));
}

async function canManageContract(request: express.Request, contractId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.leaseContract.findFirst({ where: { id: contractId, room: { property: { ownerId: session.sub } } }, select: { id: true } }));
}

async function canManageInvoice(request: express.Request, invoiceId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.invoice.findFirst({ where: { id: invoiceId, contract: { room: { property: { ownerId: session.sub } } } }, select: { id: true } }));
}

async function canManageAmenity(request: express.Request, amenityId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.amenity.findFirst({ where: { id: amenityId, property: { ownerId: session.sub } }, select: { id: true } }));
}

async function canManageAmenityBooking(request: express.Request, bookingId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.amenityBooking.findFirst({ where: { id: bookingId, amenity: { property: { ownerId: session.sub } } }, select: { id: true } }));
}

async function canManageViewing(request: express.Request, viewingId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.roomViewingRequest.findFirst({ where: { id: viewingId, room: { property: { ownerId: session.sub } } }, select: { id: true } }));
}

async function canManageMaintenance(request: express.Request, itemId: string) {
  const session = currentSession(request);
  if (session?.role === "ADMIN") return true;
  if (session?.role !== "LANDLORD") return false;
  return Boolean(await prisma.maintenanceRequest.findFirst({ where: { id: itemId, room: { property: { ownerId: session.sub } } }, select: { id: true } }));
}

function tenantOnly(request: express.Request, response: express.Response, next: express.NextFunction) {
  void activeSession(request).then((session) => {
    if (!session) { response.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." }); return; }
    if (session.role !== "TENANT") { response.status(403).json({ error: "Chức năng này dành cho tài khoản khách thuê." }); return; }
    next();
  }).catch(next);
}

function platformAdminOnly(request: express.Request, response: express.Response, next: express.NextFunction) {
  void activeSession(request).then((session) => {
    if (!session) { response.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." }); return; }
    if (session.role !== "ADMIN") { response.status(403).json({ error: "Chỉ admin hệ thống mới được quản lý tài khoản." }); return; }
    next();
  }).catch(next);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const identifier = String(request.body?.identifier ?? "").trim();
    const password = String(request.body?.password ?? "");
    if (!identifier || !password) {
      response.status(400).json({ error: "Nhập tài khoản và mật khẩu." });
      return;
    }
    const account = await prisma.userAccount.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }, { phone: identifier }] },
    });
    if (!account || !account.isActive || !verifyPassword(password, account.passwordHash)) {
      response.status(401).json({ error: "Tài khoản hoặc mật khẩu chưa chính xác." });
      return;
    }
    const maxAge = 8 * 60 * 60;
    const token = sign({ sub: account.id, role: account.role, name: account.displayName ?? account.username, exp: Date.now() + maxAge * 1000 });
    response.setHeader("Set-Cookie", `${sessionCookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    response.json({ user: { id: account.id, username: account.username, displayName: account.displayName, role: account.role } });
  } catch (error) { next(error); }
});

app.get("/api/auth/me", async (request, response, next) => {
  try {
    const session = await activeSession(request);
    if (!session) { response.status(401).json({ error: "Chưa đăng nhập." }); return; }
    response.json({ user: { id: session.sub, displayName: session.name, role: session.role } });
  } catch (error) { next(error); }
});

app.get("/api/tenant-portal/summary", tenantOnly, async (request, response, next) => {
  try {
    const session = currentSession(request)!;
    const account = await prisma.userAccount.findUnique({ where: { id: session.sub }, include: { tenant: true } });
    if (!account?.tenantId || !account.tenant) { response.status(403).json({ error: "Tài khoản chưa được liên kết với hồ sơ khách thuê." }); return; }
    const tenant = account.tenant;
    const [contracts, invoices, requests, bookings] = await Promise.all([
      prisma.leaseContract.findMany({ where: { tenantId: tenant.id }, orderBy: { startDate: "desc" }, include: { room: { include: { property: { select: { name: true, address: true } } } } } }),
      prisma.invoice.findMany({ where: { contract: { tenantId: tenant.id } }, orderBy: [{ billingYear: "desc" }, { billingMonth: "desc" }], take: 12, select: { id: true, invoiceNumber: true, billingMonth: true, billingYear: true, dueDate: true, totalVnd: true, status: true } }),
      prisma.maintenanceRequest.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, category: true, content: true, status: true, createdAt: true } }),
      prisma.amenityBooking.findMany({ where: { tenantId: tenant.id }, orderBy: { useDate: "desc" }, take: 10, include: { amenity: { select: { name: true } } } }),
    ]);
    response.json({ data: { tenant: { fullName: tenant.fullName, phone: tenant.phone, email: tenant.email, registrationStatus: tenant.registrationStatus }, contracts, invoices, requests, bookings } });
  } catch (error) { next(error); }
});

app.post("/api/tenant-portal/requests", tenantOnly, async (request, response, next) => {
  try {
    const session = currentSession(request)!;
    const account = await prisma.userAccount.findUnique({ where: { id: session.sub }, select: { tenantId: true } });
    if (!account?.tenantId) { response.status(403).json({ error: "Tài khoản chưa được liên kết với hồ sơ khách thuê." }); return; }
    const body = request.body ?? {};
    if (!String(body.category ?? "").trim() || !String(body.content ?? "").trim()) { response.status(400).json({ error: "Nhập loại yêu cầu và nội dung." }); return; }
    const contract = await prisma.leaseContract.findFirst({ where: { tenantId: account.tenantId, status: "ACTIVE" }, select: { roomId: true } });
    const data = await prisma.maintenanceRequest.create({ data: { tenantId: account.tenantId, roomId: contract?.roomId ?? null, source: "TENANT_PORTAL", category: String(body.category).trim(), content: String(body.content).trim(), priority: "MEDIUM" } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.post("/api/auth/logout", (_request, response) => {
  response.setHeader("Set-Cookie", `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  response.status(204).end();
});

app.get("/api/public/rooms", async (request, response, next) => {
  try {
    const search = String(request.query.search ?? "").trim();
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(48, Math.max(1, Number(request.query.pageSize) || 24));
    const where: Prisma.RoomWhereInput = {
        isListed: true,
        condition: "READY",
        contracts: { none: { status: { in: ["PENDING_SIGNATURE", "ACTIVE"] } } },
        property: { status: "ACTIVE", ...(search ? { OR: [{ province: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }, { address: { contains: search, mode: "insensitive" as const } }] } : {}) },
      };
    const [data, total] = await prisma.$transaction([
      prisma.room.findMany({
      where,
      orderBy: [{ property: { name: "asc" } }, { floor: "asc" }, { roomNumber: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { property: { select: { name: true, province: true, address: true, defaultRentVnd: true, managerName: true, owner: { select: { displayName: true } } } } },
      }),
      prisma.room.count({ where }),
    ]);
    response.json({ data: data.map((room) => ({ id: room.id, roomNumber: room.roomNumber, floor: room.floor, areaM2: room.areaM2, rentVnd: room.rentOverrideVnd ?? room.property.defaultRentVnd, property: { name: room.property.name, province: room.property.province, address: room.property.address, landlordName: room.property.owner?.displayName ?? room.property.managerName } })), pagination: { page, pageSize, total, hasMore: page * pageSize < total } });
  } catch (error) { next(error); }
});

app.post("/api/public/viewing-requests", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    const visitorName = String(body.visitorName ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const preferredDate = body.preferredDate ? new Date(body.preferredDate) : null;
    if (visitorName.length < 2 || !/^\+?[0-9 .()-]{8,20}$/.test(phone) || (preferredDate && !Number.isFinite(preferredDate.valueOf()))) {
      response.status(400).json({ error: "Vui lòng nhập họ tên, số điện thoại hợp lệ và ngày xem phòng đúng." }); return;
    }
    if (body.roomId) {
      const room = await prisma.room.findUnique({ where: { id: String(body.roomId) }, select: { condition: true, isListed: true, property: { select: { status: true } } } });
      if (!room || !room.isListed || room.condition !== "READY" || room.property.status !== "ACTIVE") { response.status(400).json({ error: "Phòng này hiện không nhận lịch xem." }); return; }
    }
    const data = await prisma.roomViewingRequest.create({ data: {
      roomId: body.roomId ? String(body.roomId) : null, visitorName, phone,
      email: body.email ? String(body.email).trim() : null,
      preferredDate, preferredTime: body.preferredTime ? String(body.preferredTime).trim() : null,
      note: body.note ? String(body.note).trim() : null,
    } });
    response.status(201).json({ data: { id: data.id, message: "Đã nhận yêu cầu. Góc trọ sẽ sớm liên hệ xác nhận lịch xem." } });
  } catch (error) { next(error); }
});

app.get("/api/admin/accounts", platformAdminOnly, async (_request, response, next) => {
  try {
    const data = await prisma.userAccount.findMany({ orderBy: [{ role: "asc" }, { username: "asc" }], include: { tenant: { select: { fullName: true, nationalId: true } }, _count: { select: { ownedProperties: true } } } });
    response.json({ data: data.map((account) => ({ id: account.id, username: account.username, displayName: account.displayName, email: account.email, phone: account.phone, role: account.role, isActive: account.isActive, tenantName: account.tenant?.fullName ?? null, tenantNationalId: account.tenant?.nationalId ?? null, propertyCount: account._count.ownedProperties })) });
  } catch (error) { next(error); }
});

app.post("/api/admin/accounts", platformAdminOnly, async (request, response, next) => {
  try {
    const body = request.body ?? {};
    const role = body.role;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || password.length < 8 || !["LANDLORD", "TENANT"].includes(role)) { response.status(400).json({ error: "Nhập tên đăng nhập, mật khẩu ít nhất 8 ký tự và chọn vai trò chủ trọ hoặc khách thuê." }); return; }
    const tenantId = role === "TENANT" ? String(body.tenantId ?? "") : "";
    if (role === "TENANT") {
      if (!tenantId) { response.status(400).json({ error: "Chọn hồ sơ khách thuê cần liên kết." }); return; }
      if (await prisma.userAccount.findUnique({ where: { tenantId }, select: { id: true } })) { response.status(409).json({ error: "Khách thuê này đã có tài khoản." }); return; }
    }
    const account = await prisma.userAccount.create({ data: {
      username, passwordHash: hashPassword(password), role,
      displayName: String(body.displayName ?? "").trim() || null,
      email: String(body.email ?? "").trim() || null, phone: String(body.phone ?? "").trim() || null,
      ...(role === "TENANT" ? { tenantId } : {}),
    }, select: { id: true, username: true, displayName: true, role: true, isActive: true, tenantId: true } });
    response.status(201).json({ data: account });
  } catch (error) { next(error); }
});

app.patch("/api/admin/accounts/:id", platformAdminOnly, async (request, response, next) => {
  try {
    const body = request.body ?? {};
    const data: Prisma.UserAccountUpdateInput = {};
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.password === "string" && body.password.length >= 8) data.passwordHash = hashPassword(body.password);
    else if (body.password) { response.status(400).json({ error: "Mật khẩu mới cần ít nhất 8 ký tự." }); return; }
    if ("displayName" in body) data.displayName = String(body.displayName ?? "").trim() || null;
    response.json({ data: await prisma.userAccount.update({ where: { id: String(request.params.id) }, data, select: { id: true, username: true, displayName: true, role: true, isActive: true } }) });
  } catch (error) { next(error); }
});

app.use(["/api/tenants", "/api/properties", "/api/rooms", "/api/contracts", "/api/invoices", "/api/amenities", "/api/amenity-bookings", "/api/maintenance-requests", "/api/viewing-requests", "/api/options"], requireAdmin);

app.get("/api/options/landlords", async (request, response, next) => {
  try {
    const session = currentSession(request)!;
    const data = await prisma.userAccount.findMany({ where: { role: "LANDLORD", isActive: true, ...(session.role === "LANDLORD" ? { id: session.sub } : {}) }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, username: true } });
    response.json({ data: data.map((account) => ({ value: account.id, label: account.displayName ?? account.username })) });
  } catch (error) { next(error); }
});

app.get("/api/options/tenants", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.tenant.findMany({ where: session.role === "LANDLORD" ? { OR: [{ createdById: session.sub }, { contracts: { some: { room: { property: { ownerId: session.sub } } } } }] } : {}, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, nationalId: true } });
    response.json({ data: data.map((tenant) => ({ value: tenant.id, label: `${tenant.fullName} · ${tenant.nationalId}` })) });
  } catch (error) { next(error); }
});

app.get("/api/options/rooms", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.room.findMany({ where: { condition: { not: "UNAVAILABLE" }, ...(session.role === "LANDLORD" ? { property: { ownerId: session.sub } } : {}) }, orderBy: [{ property: { name: "asc" } }, { roomNumber: "asc" }], include: { property: { select: { name: true } } } });
    response.json({ data: data.map((room) => ({ value: room.id, label: `${room.property.name} · ${room.roomNumber}` })) });
  } catch (error) { next(error); }
});

app.get("/api/options/available-rooms", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.room.findMany({
      where: { condition: "READY", contracts: { none: { status: { in: ["PENDING_SIGNATURE", "ACTIVE"] } } }, ...(session.role === "LANDLORD" ? { property: { ownerId: session.sub } } : {}) },
      orderBy: [{ property: { name: "asc" } }, { roomNumber: "asc" }],
      include: { property: { select: { name: true } } },
    });
    response.json({ data: data.map((room) => ({ value: room.id, label: `${room.property.name} · ${room.roomNumber}` })) });
  } catch (error) { next(error); }
});

app.get("/api/options/properties", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.property.findMany({ where: { status: "ACTIVE", ...(session.role === "LANDLORD" ? { ownerId: session.sub } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
    response.json({ data: data.map((property) => ({ value: property.id, label: `${property.name} · ${property.code}` })) });
  } catch (error) { next(error); }
});

app.get("/api/options/contracts", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.leaseContract.findMany({
      where: { status: "ACTIVE", ...(session.role === "LANDLORD" ? { room: { property: { ownerId: session.sub } } } : {}) }, orderBy: { contractNumber: "asc" },
      include: { tenant: { select: { fullName: true } }, room: { include: { property: { select: { name: true } } } } },
    });
    response.json({ data: data.map((contract) => ({ value: contract.id, label: `${contract.contractNumber} · ${contract.tenant.fullName} · ${contract.room.property.name}/${contract.room.roomNumber}` })) });
  } catch (error) { next(error); }
});

app.get("/api/options/amenities", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.amenity.findMany({ where: { isActive: true, ...(session.role === "LANDLORD" ? { property: { ownerId: session.sub } } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, location: true } });
    response.json({ data: data.map((amenity) => ({ value: amenity.id, label: `${amenity.name} · ${amenity.location}` })) });
  } catch (error) { next(error); }
});

app.get("/api/properties/:id/rooms", async (request, response, next) => {
  try {
    if (!(await canManageProperty(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy khu trọ." }); return; }
    const data = await prisma.room.findMany({
      where: { propertyId: request.params.id },
      orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
      include: { contracts: { where: { status: { in: ["PENDING_SIGNATURE", "ACTIVE"] } }, take: 1, include: { tenant: { select: { fullName: true } } } } },
    });
    response.json({ data: data.map((room) => ({ id: room.id, roomNumber: room.roomNumber, floor: room.floor, areaM2: room.areaM2, rentOverrideVnd: room.rentOverrideVnd, condition: room.condition, isListed: room.isListed, tenant: room.contracts[0]?.tenant.fullName ?? null })) });
  } catch (error) { next(error); }
});

app.post("/api/properties", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!body.code || !body.name || !body.province || !body.roomPrefix || !body.address || !Number.isFinite(Number(body.defaultRentVnd)) || Number(body.defaultRentVnd) < 0) {
      response.status(400).json({ error: "Nhập mã, tên, tỉnh/thành, tiền tố phòng, địa chỉ và giá thuê hợp lệ." }); return;
    }
    const status = ["ACTIVE", "PAUSED", "UNDER_CONSTRUCTION"].includes(body.status) ? body.status : "ACTIVE";
    const session = currentSession(request)!;
    if (session.role === "ADMIN" && body.ownerId) {
      const owner = await prisma.userAccount.findFirst({ where: { id: String(body.ownerId), role: "LANDLORD", isActive: true }, select: { id: true } });
      if (!owner) { response.status(400).json({ error: "Chọn tài khoản chủ trọ đang hoạt động." }); return; }
    }
    const data = await prisma.property.create({ data: {
      code: String(body.code).trim(), name: String(body.name).trim(), province: String(body.province).trim(), roomPrefix: String(body.roomPrefix).trim(), address: String(body.address).trim(),
      managerName: body.managerName ? String(body.managerName).trim() : null, defaultRentVnd: Number(body.defaultRentVnd),
      defaultAreaM2: body.defaultAreaM2 === null || body.defaultAreaM2 === "" ? null : Number(body.defaultAreaM2), status,
      note: body.note ? String(body.note) : null,
      ownerId: session.role === "LANDLORD" ? session.sub : (body.ownerId ? String(body.ownerId) : null),
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/properties/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageProperty(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy khu trọ." }); return; }
    const data: Prisma.PropertyUpdateInput = {};
    for (const key of ["code", "name", "province", "roomPrefix", "address"] as const) if (key in body) data[key] = String(body[key]).trim();
    for (const key of ["managerName", "note"] as const) if (key in body) data[key] = body[key] ? String(body[key]).trim() : null;
    if ("defaultRentVnd" in body) data.defaultRentVnd = Number(body.defaultRentVnd);
    if ("defaultAreaM2" in body) data.defaultAreaM2 = body.defaultAreaM2 === null ? null : Number(body.defaultAreaM2);
    if (["ACTIVE", "PAUSED", "UNDER_CONSTRUCTION"].includes(body.status)) data.status = body.status;
    if ("ownerId" in body && currentSession(request)?.role === "ADMIN") {
      if (body.ownerId) {
        const owner = await prisma.userAccount.findFirst({ where: { id: String(body.ownerId), role: "LANDLORD", isActive: true }, select: { id: true } });
        if (!owner) { response.status(400).json({ error: "Chọn tài khoản chủ trọ đang hoạt động." }); return; }
        data.owner = { connect: { id: owner.id } };
      } else data.owner = { disconnect: true };
    }
    response.json({ data: await prisma.property.update({ where: { id: request.params.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/properties/:id", async (request, response, next) => {
  try { if (!(await canManageProperty(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy khu trọ." }); return; } await prisma.property.delete({ where: { id: request.params.id } }); response.status(204).end(); }
  catch (error) { next(error); }
});

app.post("/api/properties/:id/rooms", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageProperty(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy khu trọ." }); return; }
    if (!body.roomNumber || !Number.isInteger(Number(body.floor)) || Number(body.floor) < 1) { response.status(400).json({ error: "Nhập số phòng và tầng hợp lệ." }); return; }
    const data = await prisma.room.create({ data: {
      propertyId: request.params.id, roomNumber: String(body.roomNumber).trim(), floor: Number(body.floor),
      areaM2: body.areaM2 ? Number(body.areaM2) : null, rentOverrideVnd: body.rentOverrideVnd ? Number(body.rentOverrideVnd) : null,
      condition: ["READY", "MAINTENANCE", "UNAVAILABLE"].includes(body.condition) ? body.condition : "READY",
      isListed: body.isListed === true || body.isListed === "true",
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/rooms/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageRoom(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy phòng." }); return; }
    const data: Prisma.RoomUpdateInput = {};
    if ("roomNumber" in body) data.roomNumber = String(body.roomNumber).trim();
    if ("floor" in body) data.floor = Number(body.floor);
    if ("areaM2" in body) data.areaM2 = body.areaM2 === null ? null : Number(body.areaM2);
    if ("rentOverrideVnd" in body) data.rentOverrideVnd = body.rentOverrideVnd === null ? null : Number(body.rentOverrideVnd);
    if (["READY", "MAINTENANCE", "UNAVAILABLE"].includes(body.condition)) data.condition = body.condition;
    if ("isListed" in body) data.isListed = body.isListed === true || body.isListed === "true";
    response.json({ data: await prisma.room.update({ where: { id: request.params.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/rooms/:id", async (request, response, next) => {
  try { if (!(await canManageRoom(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy phòng." }); return; } await prisma.room.delete({ where: { id: request.params.id } }); response.status(204).end(); }
  catch (error) { next(error); }
});

app.post("/api/tenants", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!/^\d{12}$/.test(String(body.nationalId ?? "")) || !String(body.fullName ?? "").trim()) { response.status(400).json({ error: "CCCD phải có 12 chữ số và cần nhập họ tên." }); return; }
    const session = currentSession(request)!;
    const data = await prisma.tenant.create({ data: {
      nationalId: String(body.nationalId), fullName: String(body.fullName).trim(), phone: body.phone ? String(body.phone).trim() : null,
      email: body.email ? String(body.email).trim() : null,
      status: body.status === "FORMER" ? "FORMER" : "RESIDENT", registrationStatus: body.registrationStatus === "REGISTERED" ? "REGISTERED" : "UNREGISTERED",
      createdById: session.role === "LANDLORD" ? session.sub : null,
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/tenants/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageTenant(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy khách thuê." }); return; }
    if (body.nationalId !== undefined && !/^\d{12}$/.test(String(body.nationalId))) { response.status(400).json({ error: "CCCD phải có 12 chữ số." }); return; }
    const data: Prisma.TenantUpdateInput = {};
    if ("nationalId" in body) data.nationalId = String(body.nationalId);
    if ("fullName" in body) data.fullName = String(body.fullName).trim();
    if ("phone" in body) data.phone = body.phone ? String(body.phone).trim() : null;
    if ("email" in body) data.email = body.email ? String(body.email).trim() : null;
    if (["RESIDENT", "FORMER"].includes(body.status)) data.status = body.status;
    if (["REGISTERED", "UNREGISTERED"].includes(body.registrationStatus)) data.registrationStatus = body.registrationStatus;
    response.json({ data: await prisma.tenant.update({ where: { id: request.params.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/tenants/:id", async (request, response, next) => {
  try { if (!(await canManageTenant(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy khách thuê." }); return; } await prisma.tenant.delete({ where: { id: request.params.id } }); response.status(204).end(); }
  catch (error) { next(error); }
});

app.post("/api/contracts", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (!body.contractNumber || !body.tenantId || !body.roomId || !Number.isFinite(startDate.valueOf()) || !Number.isFinite(endDate.valueOf()) || endDate <= startDate || !Number.isFinite(Number(body.monthlyRentVnd)) || Number(body.monthlyRentVnd) <= 0 || !Number.isFinite(Number(body.depositVnd)) || Number(body.depositVnd) < 0) {
      response.status(400).json({ error: "Thông tin hợp đồng chưa hợp lệ. Kiểm tra mã, khách, phòng, thời hạn và giá thuê." }); return;
    }
    const room = await prisma.room.findUnique({ where: { id: String(body.roomId) }, include: { property: { select: { status: true } } } });
    if (!room || room.condition !== "READY" || room.property.status !== "ACTIVE") { response.status(409).json({ error: "Chỉ có thể lập hợp đồng cho phòng sẵn sàng trong khu vực đang hoạt động." }); return; }
    if (!(await canManageProperty(request, room.propertyId))) { response.status(404).json({ error: "Không tìm thấy phòng trong khu trọ của tài khoản." }); return; }
    if (!(await canManageTenant(request, String(body.tenantId)))) { response.status(404).json({ error: "Không tìm thấy khách thuê trong phạm vi quản lý." }); return; }
    const occupied = await prisma.leaseContract.findFirst({ where: { roomId: room.id, status: { in: ["ACTIVE", "PENDING_SIGNATURE"] } }, select: { id: true } });
    if (occupied) { response.status(409).json({ error: "Phòng này đã có hợp đồng đang hiệu lực hoặc chờ ký." }); return; }
    const data = await prisma.leaseContract.create({ data: {
      contractNumber: String(body.contractNumber).trim(), tenantId: String(body.tenantId), roomId: String(body.roomId),
      startDate, endDate, monthlyRentVnd: Number(body.monthlyRentVnd), depositVnd: Number(body.depositVnd),
      occupantCount: Math.max(1, Number(body.occupantCount) || 1),
      status: body.status === "ACTIVE" ? "ACTIVE" : "PENDING_SIGNATURE",
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/contracts/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageContract(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy hợp đồng." }); return; }
    const data: Prisma.LeaseContractUpdateInput = {};
    if ("status" in body && ["ACTIVE", "PENDING_SIGNATURE", "CANCELLED", "TERMINATED"].includes(body.status)) data.status = body.status;
    if ("tenantId" in body && body.tenantId) {
      if (!(await canManageTenant(request, String(body.tenantId)))) { response.status(404).json({ error: "Không tìm thấy khách thuê trong phạm vi quản lý." }); return; }
      data.tenant = { connect: { id: String(body.tenantId) } };
    }
    if ("roomId" in body && body.roomId) {
      const current = await prisma.leaseContract.findUnique({ where: { id: request.params.id }, select: { roomId: true } });
      if (!current) { response.status(404).json({ error: "Không tìm thấy hợp đồng." }); return; }
      if (current.roomId === String(body.roomId)) {
        data.room = { connect: { id: String(body.roomId) } };
      } else {
      const room = await prisma.room.findUnique({ where: { id: String(body.roomId) }, include: { property: { select: { status: true } } } });
      if (!room || !(await canManageProperty(request, room.propertyId))) { response.status(404).json({ error: "Không tìm thấy phòng trong phạm vi quản lý." }); return; }
      if (!room || room.condition !== "READY" || room.property.status !== "ACTIVE") { response.status(409).json({ error: "Chỉ có thể chuyển hợp đồng sang phòng sẵn sàng trong khu vực đang hoạt động." }); return; }
      const occupied = await prisma.leaseContract.findFirst({ where: { roomId: room.id, id: { not: request.params.id }, status: { in: ["ACTIVE", "PENDING_SIGNATURE"] } }, select: { id: true } });
      if (occupied) { response.status(409).json({ error: "Phòng này đã có hợp đồng đang hiệu lực hoặc chờ ký." }); return; }
      data.room = { connect: { id: String(body.roomId) } };
      }
    }
    if ("startDate" in body || "endDate" in body) {
      const current = await prisma.leaseContract.findUnique({ where: { id: request.params.id }, select: { startDate: true, endDate: true } });
      if (!current) { response.status(404).json({ error: "Không tìm thấy hợp đồng." }); return; }
      const startDate = "startDate" in body ? new Date(body.startDate) : current.startDate;
      const endDate = "endDate" in body ? new Date(body.endDate) : current.endDate;
      if (!Number.isFinite(startDate.valueOf()) || !Number.isFinite(endDate.valueOf()) || endDate <= startDate) { response.status(400).json({ error: "Ngày kết thúc phải sau ngày bắt đầu." }); return; }
      if ("startDate" in body) data.startDate = startDate;
      if ("endDate" in body) data.endDate = endDate;
    }
    if ("monthlyRentVnd" in body) { if (!Number.isFinite(Number(body.monthlyRentVnd)) || Number(body.monthlyRentVnd) <= 0) { response.status(400).json({ error: "Tiền thuê phải lớn hơn 0." }); return; } data.monthlyRentVnd = Number(body.monthlyRentVnd); }
    if ("depositVnd" in body) { if (!Number.isFinite(Number(body.depositVnd)) || Number(body.depositVnd) < 0) { response.status(400).json({ error: "Tiền cọc không hợp lệ." }); return; } data.depositVnd = Number(body.depositVnd); }
    if (body.occupantCount !== null && body.occupantCount !== "" && body.occupantCount !== undefined) { if (!Number.isInteger(Number(body.occupantCount)) || Number(body.occupantCount) < 1) { response.status(400).json({ error: "Số người ở phải từ 1 trở lên." }); return; } data.occupantCount = Number(body.occupantCount); }
    if ("contractNumber" in body) data.contractNumber = String(body.contractNumber).trim();
    response.json({ data: await prisma.leaseContract.update({ where: { id: request.params.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/contracts/:id", async (request, response, next) => {
  try {
    if (!(await canManageContract(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy hợp đồng." }); return; }
    const contract = await prisma.leaseContract.findUnique({ where: { id: request.params.id }, include: { invoices: true } });
    if (!contract) { response.status(404).json({ error: "Không tìm thấy hợp đồng." }); return; }
    if (contract.status === "ACTIVE" || contract.invoices.length) { response.status(409).json({ error: "Không thể xóa hợp đồng đang hiệu lực hoặc đã có hóa đơn." }); return; }
    await prisma.leaseContract.delete({ where: { id: request.params.id } }); response.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/invoices", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    const month = Number(body.billingMonth), year = Number(body.billingYear), total = Number(body.totalVnd), dueDate = new Date(body.dueDate);
    if (!body.invoiceNumber || !body.contractId || month < 1 || month > 12 || !Number.isInteger(year) || total < 0 || !Number.isFinite(dueDate.valueOf())) { response.status(400).json({ error: "Thông tin hóa đơn chưa hợp lệ." }); return; }
    if (!(await canManageContract(request, String(body.contractId)))) { response.status(404).json({ error: "Không tìm thấy hợp đồng trong phạm vi quản lý." }); return; }
    const status = body.status === "VOID" ? "VOID" : body.status === "PAID" ? "PAID" : "UNPAID";
    const data = await prisma.invoice.create({ data: {
      invoiceNumber: String(body.invoiceNumber).trim(), contractId: String(body.contractId), billingYear: year, billingMonth: month, dueDate, totalVnd: total, status,
      ...(status === "PAID" ? { paidAt: new Date(), payments: { create: { amountVnd: total, method: "OTHER", reference: "ADMIN-RECORDED", note: "Ghi nhận thanh toán khi lập hóa đơn." } } } : {}),
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/invoices/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageInvoice(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy hóa đơn." }); return; }
    const invoice = await prisma.invoice.findUnique({ where: { id: request.params.id }, include: { payments: true } });
    if (!invoice) { response.status(404).json({ error: "Không tìm thấy hóa đơn." }); return; }
    if (body.status === "PAID" && invoice.status !== "PAID") {
      const data = await prisma.$transaction(async (tx) => {
        const updated = await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: new Date() } });
        await tx.payment.create({ data: { invoiceId: invoice.id, amountVnd: invoice.totalVnd, method: "OTHER", reference: "ADMIN-RECORDED", note: "Ghi nhận thanh toán từ trang quản trị." } });
        return updated;
      });
      response.json({ data }); return;
    }
    const data: Prisma.InvoiceUpdateInput = {};
    if (["UNPAID", "VOID"].includes(body.status)) data.status = body.status;
    if ("dueDate" in body) data.dueDate = new Date(body.dueDate);
    if ("totalVnd" in body) data.totalVnd = Number(body.totalVnd);
    response.json({ data: await prisma.invoice.update({ where: { id: invoice.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/invoices/:id", async (request, response, next) => {
  try {
    if (!(await canManageInvoice(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy hóa đơn." }); return; }
    const invoice = await prisma.invoice.findUnique({ where: { id: request.params.id }, include: { payments: true } });
    if (!invoice) { response.status(404).json({ error: "Không tìm thấy hóa đơn." }); return; }
    if (invoice.status === "PAID" || invoice.payments.length) { response.status(409).json({ error: "Không thể xóa hóa đơn đã ghi nhận thanh toán." }); return; }
    await prisma.invoice.delete({ where: { id: invoice.id } }); response.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/amenities", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    const session = currentSession(request)!;
    if (session.role === "LANDLORD" && (!body.propertyId || !(await canManageProperty(request, String(body.propertyId))))) { response.status(404).json({ error: "Chủ trọ cần chọn khu trọ thuộc tài khoản của mình." }); return; }
    if (!body.code || !body.name || !body.location || !body.priceUnit) { response.status(400).json({ error: "Nhập mã, tên, vị trí và đơn vị tính tiện ích." }); return; }
    const data = await prisma.amenity.create({ data: {
      code: String(body.code).trim(), name: String(body.name).trim(), location: String(body.location).trim(), priceUnit: String(body.priceUnit).trim(),
      propertyId: body.propertyId || null, priceVnd: Math.max(0, Number(body.priceVnd) || 0), opensAt: body.opensAt || null, closesAt: body.closesAt || null,
      isActive: body.isActive !== "false" && body.isActive !== false, capacity: body.capacity ? Number(body.capacity) : null, instructions: body.instructions || null,
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/amenities/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageAmenity(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy tiện ích." }); return; }
    if (body.propertyId && !(await canManageProperty(request, String(body.propertyId)))) { response.status(404).json({ error: "Không tìm thấy khu trọ thuộc phạm vi quản lý." }); return; }
    const data: Prisma.AmenityUpdateInput = {};
    for (const key of ["code", "name", "location", "priceUnit", "opensAt", "closesAt", "instructions"] as const) if (key in body) data[key] = body[key] || null;
    if ("propertyId" in body) data.property = body.propertyId ? { connect: { id: String(body.propertyId) } } : { disconnect: true };
    if ("priceVnd" in body) data.priceVnd = Math.max(0, Number(body.priceVnd) || 0);
    if ("capacity" in body) data.capacity = body.capacity ? Number(body.capacity) : null;
    if ("isActive" in body) data.isActive = body.isActive === true || body.isActive === "true";
    response.json({ data: await prisma.amenity.update({ where: { id: request.params.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/amenities/:id", async (request, response, next) => {
  try { if (!(await canManageAmenity(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy tiện ích." }); return; } await prisma.amenity.delete({ where: { id: request.params.id } }); response.status(204).end(); }
  catch (error) { next(error); }
});

app.get("/api/amenity-bookings", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.amenityBooking.findMany({
      where: session.role === "LANDLORD" ? { amenity: { property: { ownerId: session.sub } } } : {},
      orderBy: [{ useDate: "desc" }, { createdAt: "desc" }],
      include: { amenity: { select: { name: true } }, tenant: { select: { fullName: true } }, room: { include: { property: { select: { name: true } } } } },
    });
    response.json({ data: data.map((booking) => ({
      id: booking.id, amenityId: booking.amenityId, amenity: booking.amenity.name, tenantId: booking.tenantId,
      tenant: booking.tenant.fullName, roomId: booking.roomId, room: booking.room ? `${booking.room.property.name} · ${booking.room.roomNumber}` : "—",
      useDate: booking.useDate, timeSlot: booking.timeSlot, note: booking.note, status: booking.status,
    })) });
  } catch (error) { next(error); }
});

app.post("/api/amenity-bookings", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageAmenity(request, String(body.amenityId ?? ""))) || !(await canManageTenant(request, String(body.tenantId ?? "")))) { response.status(404).json({ error: "Tiện ích hoặc khách thuê không thuộc phạm vi quản lý." }); return; }
    if (body.roomId && !(await canManageRoom(request, String(body.roomId)))) { response.status(404).json({ error: "Không tìm thấy phòng trong phạm vi quản lý." }); return; }
    const useDate = new Date(body.useDate);
    if (!body.amenityId || !body.tenantId || !body.timeSlot || !Number.isFinite(useDate.valueOf())) { response.status(400).json({ error: "Chọn tiện ích, khách thuê, ngày và khung giờ." }); return; }
    const data = await prisma.amenityBooking.create({ data: {
      amenityId: String(body.amenityId), tenantId: String(body.tenantId), roomId: body.roomId || null,
      useDate, timeSlot: String(body.timeSlot).trim(), note: body.note || null,
      status: "PENDING",
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/amenity-bookings/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageAmenityBooking(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy lượt đăng ký." }); return; }
    if (body.amenityId && !(await canManageAmenity(request, String(body.amenityId)))) { response.status(404).json({ error: "Không tìm thấy tiện ích trong phạm vi quản lý." }); return; }
    if (body.tenantId && !(await canManageTenant(request, String(body.tenantId)))) { response.status(404).json({ error: "Không tìm thấy khách thuê trong phạm vi quản lý." }); return; }
    if (body.roomId && !(await canManageRoom(request, String(body.roomId)))) { response.status(404).json({ error: "Không tìm thấy phòng trong phạm vi quản lý." }); return; }
    const data: Prisma.AmenityBookingUpdateInput = {};
    if (["PENDING", "APPROVED", "USED", "CANCELLED", "REJECTED"].includes(body.status)) data.status = body.status;
    if ("useDate" in body) data.useDate = new Date(body.useDate);
    if ("timeSlot" in body) data.timeSlot = String(body.timeSlot).trim();
    if ("note" in body) data.note = body.note ? String(body.note) : null;
    if ("amenityId" in body && body.amenityId) data.amenity = { connect: { id: String(body.amenityId) } };
    if ("tenantId" in body && body.tenantId) data.tenant = { connect: { id: String(body.tenantId) } };
    if ("roomId" in body) data.room = body.roomId ? { connect: { id: String(body.roomId) } } : { disconnect: true };
    response.json({ data: await prisma.amenityBooking.update({ where: { id: request.params.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/amenity-bookings/:id", async (request, response, next) => {
  try { if (!(await canManageAmenityBooking(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy lượt đăng ký." }); return; } await prisma.amenityBooking.delete({ where: { id: request.params.id } }); response.status(204).end(); }
  catch (error) { next(error); }
});

app.get("/api/viewing-requests", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.roomViewingRequest.findMany({
      where: session.role === "LANDLORD" ? { room: { property: { ownerId: session.sub } } } : {},
      orderBy: [{ createdAt: "desc" }],
      include: { room: { include: { property: { select: { name: true } } } } },
    });
    response.json({ data: data.map((item) => ({
      id: item.id, visitorName: item.visitorName, phone: item.phone, email: item.email,
      roomId: item.roomId, room: item.room ? `${item.room.property.name} · ${item.room.roomNumber}` : "Chưa chọn phòng",
      preferredDate: item.preferredDate, preferredTime: item.preferredTime, note: item.note,
      status: item.status, createdAt: item.createdAt,
    })) });
  } catch (error) { next(error); }
});

app.patch("/api/viewing-requests/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageViewing(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy lịch xem phòng." }); return; }
    if (!["PENDING", "CONTACTED", "CONFIRMED", "COMPLETED", "CANCELLED"].includes(body.status)) { response.status(400).json({ error: "Trạng thái lịch xem không hợp lệ." }); return; }
    response.json({ data: await prisma.roomViewingRequest.update({ where: { id: request.params.id }, data: { status: body.status } }) });
  } catch (error) { next(error); }
});

app.delete("/api/viewing-requests/:id", async (request, response, next) => {
  try { if (!(await canManageViewing(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy lịch xem phòng." }); return; } await prisma.roomViewingRequest.delete({ where: { id: request.params.id } }); response.status(204).end(); }
  catch (error) { next(error); }
});

app.post("/api/maintenance-requests", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (body.roomId && !(await canManageRoom(request, String(body.roomId)))) { response.status(404).json({ error: "Không tìm thấy phòng trong phạm vi quản lý." }); return; }
    if (body.tenantId && !(await canManageTenant(request, String(body.tenantId)))) { response.status(404).json({ error: "Không tìm thấy khách thuê trong phạm vi quản lý." }); return; }
    if (!body.category || !body.content) { response.status(400).json({ error: "Nhập loại phản ánh và nội dung." }); return; }
    const data = await prisma.maintenanceRequest.create({ data: {
      category: String(body.category).trim(), content: String(body.content).trim(),
      tenantId: body.tenantId || null, roomId: body.roomId || null, source: "ADMIN",
      priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority) ? body.priority : "MEDIUM",
      status: ["PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"].includes(body.status) ? body.status : "PENDING",
    } });
    response.status(201).json({ data });
  } catch (error) { next(error); }
});

app.patch("/api/maintenance-requests/:id", async (request, response, next) => {
  try {
    const body = request.body ?? {};
    if (!(await canManageMaintenance(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy yêu cầu hỗ trợ." }); return; }
    if (body.tenantId && !(await canManageTenant(request, String(body.tenantId)))) { response.status(404).json({ error: "Không tìm thấy khách thuê trong phạm vi quản lý." }); return; }
    if (body.roomId && !(await canManageRoom(request, String(body.roomId)))) { response.status(404).json({ error: "Không tìm thấy phòng trong phạm vi quản lý." }); return; }
    const data: Prisma.MaintenanceRequestUpdateInput = {};
    if ("category" in body) data.category = String(body.category).trim();
    if ("content" in body) data.content = String(body.content).trim();
    if (["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority)) data.priority = body.priority;
    if (["PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"].includes(body.status)) data.status = body.status;
    if ("tenantId" in body) data.tenant = body.tenantId ? { connect: { id: String(body.tenantId) } } : { disconnect: true };
    if ("roomId" in body) data.room = body.roomId ? { connect: { id: String(body.roomId) } } : { disconnect: true };
    response.json({ data: await prisma.maintenanceRequest.update({ where: { id: request.params.id }, data }) });
  } catch (error) { next(error); }
});

app.delete("/api/maintenance-requests/:id", async (request, response, next) => {
  try { if (!(await canManageMaintenance(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy yêu cầu hỗ trợ." }); return; } await prisma.maintenanceRequest.delete({ where: { id: request.params.id } }); response.status(204).end(); }
  catch (error) { next(error); }
});

app.get("/api/tenants", async (request, response, next) => {
  try {
    const session = currentSession(request)!;
    const conditions: Prisma.TenantWhereInput[] = [];
    if (session.role === "LANDLORD") conditions.push({ OR: [{ createdById: session.sub }, { contracts: { some: { room: { property: { ownerId: session.sub } } } } }] });
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));
    const search = String(request.query.search ?? "").trim();
    if (search) conditions.push({ OR: [
        { fullName: { contains: search, mode: "insensitive" as const } },
        { nationalId: { contains: search } },
        { phone: { contains: search } },
      ] });
    const where: Prisma.TenantWhereInput = conditions.length ? { AND: conditions } : {};
    const [data, total] = await prisma.$transaction([
      prisma.tenant.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contracts: {
            where: { status: { in: ["PENDING_SIGNATURE", "ACTIVE"] }, ...(session.role === "LANDLORD" ? { room: { property: { ownerId: session.sub } } } : {}) },
            take: 1,
            include: {
              room: { include: { property: { select: { id: true, name: true, province: true } } } },
            },
          },
          vehicles: true,
        },
      }),
      prisma.tenant.count({ where }),
    ]);
    const formatted = data.map((tenant) => {
      const currentContract = tenant.contracts[0];
      return {
        ...tenant,
        propertyName: currentContract?.room.property.name ?? null,
        roomNumber: currentContract?.room.roomNumber ?? null,
        contractStatus: currentContract?.status ?? null,
        vehicleSummary: tenant.vehicles.map((vehicle) => vehicle.plateNumber || vehicle.vehicleType).join(", ") || null,
      };
    });
    response.json({ data: formatted, pagination: { page, pageSize, total } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tenants/:id", async (request, response, next) => {
  try {
    if (!(await canManageTenant(request, request.params.id))) { response.status(404).json({ error: "Không tìm thấy khách thuê." }); return; }
    const session = currentSession(request)!;
    const data = await prisma.tenant.findUnique({
      where: { id: request.params.id },
      include: {
        vehicles: true,
        contracts: {
          where: session.role === "LANDLORD" ? { room: { property: { ownerId: session.sub } } } : {},
          orderBy: { startDate: "desc" },
          include: { room: { include: { property: { select: { name: true, address: true, province: true } } } }, invoices: { orderBy: [{ billingYear: "desc" }, { billingMonth: "desc" }], take: 6 } },
        },
        amenityBookings: { where: session.role === "LANDLORD" ? { amenity: { property: { ownerId: session.sub } } } : {}, orderBy: { useDate: "desc" }, take: 10, include: { amenity: { select: { name: true } } } },
        maintenanceRequests: { where: session.role === "LANDLORD" ? { room: { property: { ownerId: session.sub } } } : {}, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, category: true, content: true, status: true, createdAt: true } },
        account: { select: { id: true, username: true, isActive: true, displayName: true } },
      },
    });
    if (!data) { response.status(404).json({ error: "Không tìm thấy khách thuê." }); return; }
    response.json({ data });
  } catch (error) { next(error); }
});

app.get("/api/properties", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.property.findMany({
      where: session.role === "LANDLORD" ? { ownerId: session.sub } : {},
      orderBy: { name: "asc" },
      include: { _count: { select: { rooms: true } }, owner: { select: { id: true, displayName: true, username: true } } },
    });
    response.json({ data: data.map(({ _count, owner, ...property }) => ({ ...property, ownerId: owner?.id ?? null, ownerName: owner?.displayName ?? owner?.username ?? null, roomCount: _count.rooms })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.leaseContract.findMany({
      where: session.role === "LANDLORD" ? { room: { property: { ownerId: session.sub } } } : {},
      orderBy: { startDate: "desc" },
      include: {
        tenant: { select: { fullName: true, nationalId: true } },
        room: { include: { property: { select: { name: true } } } },
      },
    });
    response.json({ data: data.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      tenantId: contract.tenantId,
      roomId: contract.roomId,
      room: contract.room.roomNumber,
      property: contract.room.property.name,
      tenant: contract.tenant.fullName,
      nationalId: contract.tenant.nationalId,
      startDate: contract.startDate,
      endDate: contract.endDate,
      monthlyRentVnd: contract.monthlyRentVnd,
      depositVnd: contract.depositVnd,
      occupantCount: contract.occupantCount,
      status: contract.status,
    })) });
  } catch (error) { next(error); }
});

app.get("/api/invoices", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.invoice.findMany({
      where: session.role === "LANDLORD" ? { contract: { room: { property: { ownerId: session.sub } } } } : {},
      orderBy: [{ billingYear: "desc" }, { billingMonth: "desc" }],
      include: {
        contract: {
          include: {
            tenant: { select: { fullName: true } },
            room: { include: { property: { select: { name: true } } } },
          },
        },
      },
    });
    response.json({ data: data.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      contractId: invoice.contractId,
      room: invoice.contract.room.roomNumber,
      property: invoice.contract.room.property.name,
      tenant: invoice.contract.tenant.fullName,
      billingMonth: invoice.billingMonth,
      billingYear: invoice.billingYear,
      dueDate: invoice.dueDate,
      totalVnd: invoice.totalVnd,
      status: invoice.status,
    })) });
  } catch (error) { next(error); }
});

app.get("/api/amenities", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.amenity.findMany({
      where: session.role === "LANDLORD" ? { property: { ownerId: session.sub } } : {},
      orderBy: { name: "asc" },
      include: { _count: { select: { bookings: true } }, property: { select: { name: true } } },
    });
    response.json({ data: data.map((amenity) => ({
      id: amenity.id,
      code: amenity.code,
      propertyId: amenity.propertyId,
      name: amenity.name,
      location: amenity.location,
      property: amenity.property?.name ?? "Tất cả khu vực",
      priceVnd: amenity.priceVnd,
      priceUnit: amenity.priceUnit,
      opensAt: amenity.opensAt,
      closesAt: amenity.closesAt,
      isActive: amenity.isActive,
      capacity: amenity.capacity,
      instructions: amenity.instructions,
      bookings: amenity._count.bookings,
    })) });
  } catch (error) { next(error); }
});

app.get("/api/maintenance-requests", async (_request, response, next) => {
  try {
    const session = currentSession(_request)!;
    const data = await prisma.maintenanceRequest.findMany({
      where: session.role === "LANDLORD" ? { room: { property: { ownerId: session.sub } } } : {},
      orderBy: { createdAt: "desc" },
      include: {
        tenant: { select: { fullName: true } },
        room: { include: { property: { select: { name: true } } } },
      },
    });
    response.json({ data: data.map((item) => ({
      id: item.id,
      code: `KN-${item.id.slice(-6).toUpperCase()}`,
      tenant: item.tenant?.fullName ?? "Khách chưa xác định",
      property: item.room?.property.name ?? "—",
      room: item.room?.roomNumber ?? "—",
      category: item.category,
      content: item.content,
      priority: item.priority,
      status: item.status,
      tenantId: item.tenantId,
      roomId: item.roomId,
      createdAt: item.createdAt,
    })) });
  } catch (error) { next(error); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") { response.status(409).json({ error: "Giá trị này đã tồn tại. Hãy kiểm tra mã hoặc CCCD." }); return; }
    if (error.code === "P2003" || error.code === "P2014") { response.status(409).json({ error: "Không thể xóa hoặc thay đổi vì dữ liệu đang được tham chiếu." }); return; }
    if (error.code === "P2025") { response.status(404).json({ error: "Không tìm thấy dữ liệu cần cập nhật." }); return; }
  }
  console.error(error);
  response.status(500).json({ error: "Không thể tải dữ liệu lúc này." });
});

export default app;
