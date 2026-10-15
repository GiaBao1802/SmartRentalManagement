import test from "node:test";
import assert from "node:assert/strict";
import { InvoiceZaloService } from "./invoice-zalo.service.js";
import { FakeZaloProvider } from "./zalo-provider.js";

test("Zalo provider is called only after the send log transaction commits", async () => {
  const events: string[] = [];
  const repository: any = {
    createQueuedZaloLog: async () => { events.push("log-committed"); return { sendLogId: 12n, invoiceId: 8n, invoiceRevision: 3, status: "queued", createdAt: new Date(), recipientResidentId: 4n, recipientPhone: "0900000000" }; },
    markZaloLog: async () => { events.push("log-updated"); },
  };
  const provider = { enqueue: async (job: any) => { assert.equal(job.sendLogId, 12n); events.push("provider-enqueue"); } };
  const service = new InvoiceZaloService(repository, provider);
  const result = await service.send(11n, 8n);
  assert.deepEqual(events, ["log-committed", "provider-enqueue"]);
  assert.equal(result?.status, "queued");
});

test("each send intent appends a separate log and preserves the invoice revision", async () => {
  let sequence = 0;
  const repository: any = { createQueuedZaloLog: async () => ({ sendLogId: BigInt(++sequence), invoiceId: 8n, invoiceRevision: 5, status: "queued", createdAt: new Date(), recipientResidentId: 4n, recipientPhone: null }), markZaloLog: async () => undefined };
  const provider = new FakeZaloProvider();
  const service = new InvoiceZaloService(repository, provider);
  const first = await service.send(11n, 8n);
  const second = await service.send(11n, 8n);
  assert.notEqual(first?.sendLogId, second?.sendLogId);
  assert.deepEqual(provider.jobs.map((job) => job.invoiceRevision), [5, 5]);
  assert.deepEqual(provider.jobs.map((job) => job.sendLogId), [1n, 2n]);
});

test("provider outage marks only the newly queued log failed and exposes no provider error text", async () => {
  let marked: any;
  const repository: any = {
    createQueuedZaloLog: async () => ({ sendLogId: 12n, invoiceId: 8n, invoiceRevision: 1, status: "queued", createdAt: new Date(), recipientResidentId: 4n, recipientPhone: null }),
    markZaloLog: async (_owner: bigint, _id: bigint, data: any) => { marked = data; },
  };
  const service = new InvoiceZaloService(repository, { enqueue: async () => { throw new Error("secret provider response"); } });
  await assert.rejects(service.send(11n, 8n), /ZALO_PROVIDER_UNAVAILABLE/);
  assert.deepEqual(marked, { status: "failed", errorMessage: "Không thể đưa yêu cầu vào hàng đợi Zalo OA.", sentAt: null });
});
