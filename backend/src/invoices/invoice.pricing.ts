import type { InvoicePricing } from "./invoice.repository.js";

/** Kept wired until itemized transaction behavior passes PostgreSQL V1.7 integration validation. */
export class UnconfiguredInvoicePricing implements InvoicePricing {
  async calculate(_invoice: any, _contract: any, _tx?: unknown): Promise<null> { return null; }
}
