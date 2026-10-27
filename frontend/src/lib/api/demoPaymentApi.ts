import { apiRequest } from "./apiClient";

export type DemoPayment = {
  transaction_id: string;
  transaction_code: string;
  amount: string;
  outcome: "success" | "failed" | "pending";
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
  invoice_status?: "unpaid" | "paid";
  demo?: true;
};

export const demoPaymentApi = {
  list(invoiceId: string) {
    return apiRequest<DemoPayment[]>(`/invoices/${encodeURIComponent(invoiceId)}/demo-payments`);
  },
  simulate(invoiceId: string, outcome: "success" | "failed") {
    return apiRequest<DemoPayment>(`/invoices/${encodeURIComponent(invoiceId)}/demo-payments`, {
      method: "POST", body: JSON.stringify({ outcome }),
    });
  },
  sendFeedback(category: string, content: string) {
    return apiRequest<{ feedback_id: string; status: string; created_at: string }>("/me/feedback", {
      method: "POST", body: JSON.stringify({ category, content }),
    });
  },
};
