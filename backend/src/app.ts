import { EnrollmentService } from "./accounts/enrollment.service.js";
import { PrismaEnrollmentRepository } from "./accounts/enrollment.repository.js";
import { UnconfiguredEnrollmentDelivery } from "./accounts/credential-infrastructure.js";
import cors from "cors";
import { createExplorerRouter } from "./public-marketplace/explorer.routes.js";
import express from "express";
import helmet from "helmet";
import { prisma } from "./lib/prisma.js";
import { runtimeConfig } from "./config/env.js";
import { PrismaAuthRepository } from "./auth/account-repository.js";
import { PrismaPropertyRoomRepository } from "./properties/property-room.repository.js";
import { PrismaResidentOccupancyRepository } from "./residents/resident.repository.js";
import { PrismaContractRepository } from "./contracts/contract.repository.js";
import { ContractIdempotencyService, EnvironmentContractResponseKeyProvider } from "./contracts/contract-idempotency.js";
import { UnconfiguredObjectStorage } from "./contract-documents/object-storage.js";
import { ContractDocumentService } from "./contract-documents/contract-document.service.js";
import { createV1Router } from "./auth/v1.router.js";
import { createSessionStore } from "./auth/session-store.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { PrismaInvoiceRepository } from "./invoices/invoice.repository.js";
import { PrismaItemizedInvoicePricing } from "./invoices/invoice-itemized.pricing.js";
import { PrismaBillingWorkspaceRepository } from "./invoices/billing-workspace.repository.js";
import { InvoiceZaloService } from "./zalo/invoice-zalo.service.js";
import { UnconfiguredZaloProvider } from "./zalo/zalo-provider.js";
import { PrismaRoomImageRepository } from "./room-images/room-image.repository.js";
import { LocalRoomImageStorage } from "./room-images/storage.js";
import { PrismaPublicMarketplaceRepository } from "./public-marketplace/public-marketplace.repository.js";
import { PrismaUtilityTariffManagementRepository } from "./services/utility-tariff-management.repository.js";
import { PrismaPropertyServiceRepository } from "./services/property-service.repository.js";
import { PrismaParkingManagementRepository } from "./services/parking-management.repository.js";
import { PrismaAccountManagementRepository } from "./accounts/account.repository.js";

const app = express();

app.use(requestIdMiddleware);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || origin === runtimeConfig.frontendOrigin),
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/api/v1/public/explorer", createExplorerRouter(prisma));

const sessions = createSessionStore(runtimeConfig.nodeEnv);
const objectStorage = new UnconfiguredObjectStorage();
const invoiceRepository = new PrismaInvoiceRepository(prisma);
const invoicePricing = new PrismaItemizedInvoicePricing();
const billingWorkspaceRepository = new PrismaBillingWorkspaceRepository(prisma, invoicePricing);
app.use("/api/v1", createV1Router({
  config: runtimeConfig,
  repository: new PrismaAuthRepository(prisma),
  sessions,
  accountManagementRepository: new PrismaAccountManagementRepository(prisma),
  enrollment: runtimeConfig.nodeEnv === "production" ? undefined : new EnrollmentService(new PrismaEnrollmentRepository(prisma), sessions, new UnconfiguredEnrollmentDelivery(), runtimeConfig.nodeEnv),
  propertyRoomRepository: new PrismaPropertyRoomRepository(prisma),
  roomImageRepository: new PrismaRoomImageRepository(prisma),
  roomImageStorage: runtimeConfig.nodeEnv === "production" ? undefined : new LocalRoomImageStorage(),
  publicMarketplaceRepository: new PrismaPublicMarketplaceRepository(prisma),
  residentOccupancyRepository: new PrismaResidentOccupancyRepository(prisma),
  contractRepository: new PrismaContractRepository(prisma),
  contractIdempotency: new ContractIdempotencyService(prisma, new EnvironmentContractResponseKeyProvider()),
  objectStorage,
  contractDocumentService: new ContractDocumentService(prisma, objectStorage),
  invoiceRepository,
  billingWorkspaceRepository,
  invoicePricing,
  invoiceZalo: new InvoiceZaloService(invoiceRepository, new UnconfiguredZaloProvider()),
  utilityTariffRepository: new PrismaUtilityTariffManagementRepository(prisma),
  propertyServiceRepository: new PrismaPropertyServiceRepository(prisma),
  parkingManagementRepository: new PrismaParkingManagementRepository(prisma),
}));

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

// Property, Room, and Contract management moved to scoped V1 routes. Keep old demo
// paths explicitly retired after removing their legacy implementations.
app.use(["/api/properties", "/api/rooms", "/api/contracts"], (_request, response) => {
  response.status(410).json({ error: "Endpoint đã được thay thế bằng API V1.2.", code: "ENDPOINT_RETIRED", endpoint: "/api/v1" });
});

// Legacy/demo invoice routes accepted client-supplied totals and payment state. Retire them;
// the scoped V1 Invoice API is mounted above and Payment remains unmigrated.
app.use("/api/invoices", (_request, response) => {
  response.status(410).json({ error: "Endpoint đã được thay thế bằng API V1.2.", code: "ENDPOINT_RETIRED", endpoint: "/api/v1/invoices" });
});

// Preserve the existing Accounts retirement response.
app.use("/api/admin/accounts", (_request, response) => {
  response.status(410).json({ error: "Endpoint thay thế: /api/v1/accounts.", code: "ENDPOINT_RETIRED", endpoint: "/api/v1/accounts" });
});
// These demo-only entry points are outside the approved current product flow.
// Retire every method and nested path without parsing legacy cookies or touching the DB.
app.use(["/api/auth", "/api/tenant-portal", "/api/public/rooms", "/api/public/viewing-requests", "/api/tenants", "/api/amenities", "/api/amenity-bookings", "/api/maintenance-requests", "/api/viewing-requests", "/api/options"], (_request, response) => {
  response.status(410).json({ error: "Endpoint ngoài luồng sản phẩm hiện hành đã ngừng sử dụng.", code: "ENDPOINT_RETIRED", endpoint: "/api/v1" });
});

app.use(errorHandler);

export default app;
