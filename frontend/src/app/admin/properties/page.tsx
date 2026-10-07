import DataManagement from "../../components/data-management";

export const metadata = { title: "Quản lý khu vực" };

export default function PropertiesPage() {
  return <DataManagement active="/admin/properties" title="Quản lý khu vực" description="Quản lý khu vực và tòa nhà, theo dõi số phòng, giá thuê mặc định và trạng thái hoạt động." endpoint="/api/properties" searchKeys={["code", "name", "province", "address", "managerName", "ownerName"]} summary="Tổng khu vực / tòa nhà" columns={[
    { key: "code", label: "Mã khu vực" }, { key: "name", label: "Tên khu vực / tòa nhà" },
    { key: "province", label: "Tỉnh / Thành phố" }, { key: "address", label: "Địa chỉ" },
    { key: "managerName", label: "Người phụ trách" }, { key: "ownerName", label: "Tài khoản chủ trọ" }, { key: "roomCount", label: "Số phòng" },
    { key: "defaultRentVnd", label: "Giá thuê mặc định", format: "money" }, { key: "status", label: "Trạng thái", format: "status" },
  ]} fields={[
    { key: "code", label: "Mã khu vực", required: true }, { key: "name", label: "Tên khu vực / tòa nhà", required: true },
    { key: "province", label: "Tỉnh / Thành phố", required: true }, { key: "roomPrefix", label: "Tiền tố mã phòng", required: true },
    { key: "address", label: "Địa chỉ", required: true }, { key: "managerName", label: "Người phụ trách" },
    { key: "ownerId", label: "Chủ sở hữu khu trọ", type: "select", optionsEndpoint: "/api/options/landlords" },
    { key: "defaultRentVnd", label: "Giá thuê mặc định (đ/tháng)", type: "number", required: true }, { key: "defaultAreaM2", label: "Diện tích mặc định (m²)", type: "number" },
    { key: "status", label: "Trạng thái", type: "select", options: [{ value: "ACTIVE", label: "Đang hoạt động" }, { value: "PAUSED", label: "Tạm dừng" }, { value: "UNDER_CONSTRUCTION", label: "Đang xây dựng" }] },
    { key: "note", label: "Ghi chú", type: "textarea" },
  ]} />;
}
