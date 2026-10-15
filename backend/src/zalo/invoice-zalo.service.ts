import type { PrismaInvoiceRepository } from "../invoices/invoice.repository.js";
import type { InvoiceZaloJob, ZaloProvider } from "./zalo-provider.js";

export type InvoiceZaloRecipientResolver = (tx: any, invoice: any) => Promise<{ residentId: bigint; phone: string | null } | null>;
const noRecipientPolicy: InvoiceZaloRecipientResolver = async () => null;

export class InvoiceZaloService {
  constructor(
    private readonly repository: PrismaInvoiceRepository,
    private readonly provider: ZaloProvider,
    private readonly resolveRecipient: InvoiceZaloRecipientResolver = noRecipientPolicy,
  ) {}

  async send(ownerId: bigint, invoiceId: bigint) {
    // The queued log commits before calling the external/provider boundary.
    const queued = await this.repository.createQueuedZaloLog(ownerId, invoiceId, this.resolveRecipient);
    if (!queued) return null;
    const job: InvoiceZaloJob = {
      sendLogId: queued.sendLogId, invoiceId: queued.invoiceId, invoiceRevision: queued.invoiceRevision,
      recipientResidentId: queued.recipientResidentId, recipientPhone: queued.recipientPhone,
    };
    try {
      await this.provider.enqueue(job);
      return { sendLogId: queued.sendLogId, invoiceId: queued.invoiceId, invoiceRevision: queued.invoiceRevision, status: "queued", createdAt: queued.createdAt };
    } catch {
      await this.repository.markZaloLog(ownerId, queued.sendLogId, { status: "failed", errorMessage: "Không thể đưa yêu cầu vào hàng đợi Zalo OA.", sentAt: null });
      throw new Error("ZALO_PROVIDER_UNAVAILABLE");
    }
  }
}
