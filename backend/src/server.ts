import { runtimeConfig } from "./config/env.js";
import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { BillingScheduler } from "./invoices/billing-scheduler.js";
import { PrismaBillingScheduleStore } from "./invoices/billing-scheduler.repository.js";
import { PrismaInvoiceRepository } from "./invoices/invoice.repository.js";
import { CloudyFeedbackRetentionScheduler } from "./resident-assistant/cloudy-feedback-retention-scheduler.js";
import { PrismaCloudyFeedbackRepository } from "./resident-assistant/cloudy-feedback.repository.js";
import { startBackgroundJobs } from "./config/background-jobs.js";

const port = runtimeConfig.port;
// A production process must not announce readiness before the V1.9 session table exists.
if (runtimeConfig.nodeEnv === "production") {
  await prisma.$queryRaw`SELECT token_hash, account_id, created_at, last_seen_at, expires_at, absolute_expires_at FROM auth_sessions LIMIT 0`;
}
const billingScheduler = new BillingScheduler(new PrismaBillingScheduleStore(prisma, new PrismaInvoiceRepository(prisma)));
const cloudyFeedbackRetentionScheduler = new CloudyFeedbackRetentionScheduler(new PrismaCloudyFeedbackRepository(prisma, runtimeConfig.sessionSecret));
const server = app.listen(port, () => {
  console.log(`Góc trọ API listening on http://localhost:${port}`);
  const jobsStarted = startBackgroundJobs(runtimeConfig.nodeEnv, process.env.GOCTRO_DEV_DISABLE_BACKGROUND_JOBS, [billingScheduler, cloudyFeedbackRetentionScheduler]);
  if (!jobsStarted) console.info(JSON.stringify({ event: "development_background_jobs_disabled", jobs: ["billing", "cloudy_feedback_retention"] }));
});

const shutdown = () => {
  void Promise.all([billingScheduler.stop(), cloudyFeedbackRetentionScheduler.stop()]).finally(() => server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  }));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
