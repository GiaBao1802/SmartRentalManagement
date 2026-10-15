import InvoiceDetail from "./invoice-detail";

export const metadata = { title: "Chi tiết hóa đơn" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoiceDetail invoiceId={invoiceId} />;
}
