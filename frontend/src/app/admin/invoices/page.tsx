import DataManagement from "../../components/data-management";

export const metadata = { title: "Quản lý hóa đơn" };

export default function InvoicesPage() {
  return <DataManagement active="/admin/invoices" title="Quản lý hóa đơn" description="Theo dõi kỳ thu, trạng thái thanh toán và các khoản phí của người thuê." endpoint="/api/invoices" searchKeys={["invoiceNumber", "tenant", "room", "property"]} summary="Tổng hóa đơn" columns={[
    { key: "invoiceNumber", label: "Mã hóa đơn" }, { key: "property", label: "Khu vực / tòa nhà" },
    { key: "room", label: "Phòng" }, { key: "tenant", label: "Khách thuê" },
    { key: "billingMonth", label: "Tháng" }, { key: "billingYear", label: "Năm" },
    { key: "dueDate", label: "Hạn thanh toán", format: "date" }, { key: "totalVnd", label: "Tổng tiền", format: "money" },
    { key: "status", label: "Trạng thái", format: "status" },
  ]} />;
}
