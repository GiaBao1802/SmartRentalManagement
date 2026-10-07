import DataManagement from "../../components/data-management";

export const metadata = { title: "Quản lý hợp đồng" };

export default function ContractsPage() {
  return <DataManagement active="/admin/contracts" title="Quản lý hợp đồng" description="Theo dõi vòng đời hợp đồng, thời hạn thuê, tiền cọc và liên kết hợp đồng với khách thuê, phòng, hóa đơn." endpoint="/api/contracts" searchKeys={["contractNumber", "tenant", "nationalId", "room", "property"]} summary="Tổng hợp đồng" columns={[
    { key: "property", label: "Khu vực / tòa nhà" }, { key: "room", label: "Phòng" },
    { key: "tenant", label: "Khách thuê" }, { key: "contractNumber", label: "Số hợp đồng" },
    { key: "startDate", label: "Bắt đầu", format: "date" }, { key: "endDate", label: "Hết hạn", format: "date" },
    { key: "monthlyRentVnd", label: "Tiền thuê / tháng", format: "money" }, { key: "depositVnd", label: "Tiền cọc", format: "money" },
    { key: "status", label: "Trạng thái", format: "status" },
  ]} fields={[
    { key: "contractNumber", label: "Số hợp đồng", required: true },
    { key: "tenantId", label: "Khách thuê", type: "select", optionsEndpoint: "/api/options/tenants", required: true },
    { key: "roomId", label: "Phòng", type: "select", optionsEndpoint: "/api/options/rooms", required: true },
    { key: "startDate", label: "Ngày bắt đầu", type: "date", required: true }, { key: "endDate", label: "Ngày hết hạn", type: "date", required: true },
    { key: "monthlyRentVnd", label: "Tiền thuê tháng (đ)", type: "number", required: true }, { key: "depositVnd", label: "Tiền cọc (đ)", type: "number", required: true },
    { key: "occupantCount", label: "Số người ở", type: "number" },
    { key: "status", label: "Trạng thái", type: "select", options: [{ value: "PENDING_SIGNATURE", label: "Chờ ký" }, { value: "ACTIVE", label: "Hiệu lực" }, { value: "CANCELLED", label: "Đã hủy" }, { value: "TERMINATED", label: "Đã thanh lý" }] },
  ]} defaultStatus={{ key: "status", value: "ACTIVE", label: "Kích hoạt" }} />;
}
