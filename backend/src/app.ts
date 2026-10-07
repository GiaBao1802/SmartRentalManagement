import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
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

function requireAdmin(request: express.Request, response: express.Response, next: express.NextFunction) {
  const session = readSession(request);
  if (!session) {
    response.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục.", code: "UNAUTHENTICATED" });
    return;
  }
  if (session.role !== "ADMIN") {
    response.status(403).json({ error: "Tài khoản không có quyền quản trị.", code: "FORBIDDEN" });
    return;
  }
  next();
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

app.get("/api/auth/me", (request, response) => {
  const session = readSession(request);
  if (!session) {
    response.status(401).json({ error: "Chưa đăng nhập." });
    return;
  }
  response.json({ user: { id: session.sub, displayName: session.name, role: session.role } });
});

app.post("/api/auth/logout", (_request, response) => {
  response.setHeader("Set-Cookie", `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  response.status(204).end();
});

app.get("/api/public/rooms", async (request, response, next) => {
  try {
    const search = String(request.query.search ?? "").trim();
    const data = await prisma.room.findMany({
      where: {
        condition: "READY",
        contracts: { none: { status: { in: ["PENDING_SIGNATURE", "ACTIVE"] } } },
        property: { status: "ACTIVE", ...(search ? { OR: [{ province: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }, { address: { contains: search, mode: "insensitive" as const } }] } : {}) },
      },
      orderBy: [{ property: { name: "asc" } }, { floor: "asc" }, { roomNumber: "asc" }],
      take: 12,
      include: { property: { select: { name: true, province: true, address: true, defaultRentVnd: true } } },
    });
    response.json({ data: data.map((room) => ({ id: room.id, roomNumber: room.roomNumber, floor: room.floor, areaM2: room.areaM2, rentVnd: room.rentOverrideVnd ?? room.property.defaultRentVnd, property: room.property })) });
  } catch (error) { next(error); }
});

app.use(["/api/tenants", "/api/properties", "/api/contracts", "/api/invoices", "/api/amenities", "/api/maintenance-requests"], requireAdmin);

app.get("/api/tenants", async (request, response, next) => {
  try {
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));
    const search = String(request.query.search ?? "").trim();
    const where = search ? {
      OR: [
        { fullName: { contains: search, mode: "insensitive" as const } },
        { nationalId: { contains: search } },
        { phone: { contains: search } },
      ],
    } : {};
    const [data, total] = await prisma.$transaction([
      prisma.tenant.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contracts: {
            where: { status: { in: ["PENDING_SIGNATURE", "ACTIVE"] } },
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
    response.json({ data, pagination: { page, pageSize, total } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/properties", async (_request, response, next) => {
  try {
    const data = await prisma.property.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { rooms: true } } },
    });
    response.json({ data: data.map(({ _count, ...property }) => ({ ...property, roomCount: _count.rooms })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts", async (_request, response, next) => {
  try {
    const data = await prisma.leaseContract.findMany({
      orderBy: { startDate: "desc" },
      include: {
        tenant: { select: { fullName: true, nationalId: true } },
        room: { include: { property: { select: { name: true } } } },
      },
    });
    response.json({ data: data.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      room: contract.room.roomNumber,
      property: contract.room.property.name,
      tenant: contract.tenant.fullName,
      nationalId: contract.tenant.nationalId,
      startDate: contract.startDate,
      endDate: contract.endDate,
      monthlyRentVnd: contract.monthlyRentVnd,
      depositVnd: contract.depositVnd,
      status: contract.status,
    })) });
  } catch (error) { next(error); }
});

app.get("/api/invoices", async (_request, response, next) => {
  try {
    const data = await prisma.invoice.findMany({
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
    const data = await prisma.amenity.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { bookings: true } }, property: { select: { name: true } } },
    });
    response.json({ data: data.map((amenity) => ({
      id: amenity.id,
      code: amenity.code,
      name: amenity.name,
      location: amenity.location,
      property: amenity.property?.name ?? "Tất cả khu vực",
      priceVnd: amenity.priceVnd,
      priceUnit: amenity.priceUnit,
      opensAt: amenity.opensAt,
      closesAt: amenity.closesAt,
      isActive: amenity.isActive,
      bookings: amenity._count.bookings,
    })) });
  } catch (error) { next(error); }
});

app.get("/api/maintenance-requests", async (_request, response, next) => {
  try {
    const data = await prisma.maintenanceRequest.findMany({
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
      createdAt: item.createdAt,
    })) });
  } catch (error) { next(error); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Không thể tải dữ liệu lúc này." });
});

export default app;
