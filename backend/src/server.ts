import { runtimeConfig } from "./config/env.js";
import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { BillingScheduler } from "./invoices/billing-scheduler.js";
import { PrismaBillingScheduleStore } from "./invoices/billing-scheduler.repository.js";
import { PrismaInvoiceRepository } from "./invoices/invoice.repository.js";

const port = runtimeConfig.port;
const billingScheduler = new BillingScheduler(new PrismaBillingScheduleStore(prisma, new PrismaInvoiceRepository(prisma)));
const server = app.listen(port, () => {
  console.log(`Góc trọ API listening on http://localhost:${port}`);
  billingScheduler.start();
});

const shutdown = () => {
  void billingScheduler.stop().finally(() => server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  }));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
