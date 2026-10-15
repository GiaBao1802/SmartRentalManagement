export type InvoiceZaloJob = { sendLogId: bigint; invoiceId: bigint; invoiceRevision: number; recipientResidentId: bigint; recipientPhone: string | null };
export interface ZaloProvider { enqueue(job: InvoiceZaloJob): Promise<void> }

/** Production OA credentials/queue are intentionally not configured in this repository. */
export class UnconfiguredZaloProvider implements ZaloProvider {
  async enqueue(_job: InvoiceZaloJob): Promise<void> { throw new Error("Zalo OA provider is not configured."); }
}

/** Test adapter: records queued jobs without claiming external delivery. */
export class FakeZaloProvider implements ZaloProvider {
  readonly jobs: InvoiceZaloJob[] = [];
  async enqueue(job: InvoiceZaloJob): Promise<void> { this.jobs.push(job); }
}
