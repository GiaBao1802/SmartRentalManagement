import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaInvoiceRepository } from "../src/invoices/invoice.repository.js";
import { PrismaItemizedInvoicePricing } from "../src/invoices/invoice-itemized.pricing.js";
import { DemoPaymentRepository } from "../src/payments/demo-payment.repository.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env.neon") });
const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) throw new Error("Missing DATABASE_URL_UNPOOLED in root .env.neon.");
const url = new URL(databaseUrl);
if (url.hostname !== "ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech" || url.pathname !== "/neondb") {
  throw new Error("Refusing to write: target is not the verified Neon shared-dev neondb endpoint.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const ownerId = 6n;
const adminId = 6n;
const invoiceRepository = new PrismaInvoiceRepository(prisma);
const pricing = new PrismaItemizedInvoicePricing();
const paymentRepository = new DemoPaymentRepository(prisma);

async function main() {
  const contracts = await prisma.contract.findMany({
    where: { ownerId, contractNo: { startsWith: "DEMO-OWNER6-202610-T" } },
    orderBy: { contractNo: "asc" },
    select: { contractId: true, contractNo: true, representativeResidentId: true },
  });
  if (contracts.length !== 3) throw new Error(`Expected the three scoped fixture contracts; found ${contracts.length}.`);
  const invoiceByContract = new Map<bigint, bigint>();
  for (const contract of contracts) {
    const invoice = await prisma.invoice.findFirst({ where: { ownerId, contractId: contract.contractId }, orderBy: { invoiceId: "desc" }, select: { invoiceId: true } });
    if (!invoice) throw new Error(`Missing invoice for ${contract.contractNo}.`);
    invoiceByContract.set(contract.contractId, invoice.invoiceId);
  }

  for (const [index, contract] of contracts.entries()) {
    const invoiceId = invoiceByContract.get(contract.contractId)!;
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { invoiceId, ownerId }, select: { status: true } });
    if (invoice.status !== "draft") continue;
    const patched = await invoiceRepository.patchDraft(ownerId, invoiceId, {
      electricityCurrentKwh: `${155 + index * 50}.000`,
      waterCurrentM3: `${17 + index * 5}.000`,
    });
    if (!patched) throw new Error(`Could not persist meter readings for ${contract.contractNo}.`);
    const finalizedAt = index === 1 ? new Date("2026-10-20T05:00:00.000Z") : new Date("2026-10-25T05:00:00.000Z");
    const finalized = await invoiceRepository.finalize(ownerId, invoiceId, {}, pricing, adminId, finalizedAt);
    if (!finalized || finalized.status !== "unpaid") throw new Error(`Could not finalize ${contract.contractNo} as unpaid.`);
  }

  const paidContract = contracts[1]!;
  const paidInvoiceId = invoiceByContract.get(paidContract.contractId)!;
  const paidInvoice = await prisma.invoice.findFirstOrThrow({ where: { invoiceId: paidInvoiceId, ownerId }, select: { status: true } });
  if (paidInvoice.status === "unpaid") {
    const payment = await paymentRepository.simulate(ownerId, paidContract.representativeResidentId, paidInvoiceId, "success");
    if (!payment || ("notPayable" in payment && payment.notPayable)) throw new Error("Could not mark the second invoice paid through demo payment.");
  } else if (paidInvoice.status !== "paid") {
    throw new Error(`Expected the second invoice to be unpaid or paid, received ${paidInvoice.status}.`);
  }

  const rows = await Promise.all([...invoiceByContract.values()].map((invoiceId) => invoiceRepository.findForOwner(ownerId, invoiceId)));
  const statuses = rows.map((row) => ({ invoice_id: row?.invoiceId.toString(), status: row?.status, overdue: row?.isOverdue, total: row?.totalAmount.toString() }));
  if (rows[0]?.status !== "unpaid" || !rows[0]?.isOverdue || rows[1]?.status !== "paid" || rows[2]?.status !== "unpaid" || rows[2]?.isOverdue) {
    throw new Error(`Fixture invoice states did not validate: ${JSON.stringify(statuses)}`);
  }
  console.log(JSON.stringify({ result: "completed", invoices: statuses, payment_mode: "demo-only" }));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
