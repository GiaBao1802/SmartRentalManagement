import InvoiceList from "./invoice-list";
import MeterApproval from "./meter-approval";

export const metadata = { title: "Quản lý hóa đơn" };

export default function InvoicesPage() {
  return <><InvoiceList /><MeterApproval /></>;
}
