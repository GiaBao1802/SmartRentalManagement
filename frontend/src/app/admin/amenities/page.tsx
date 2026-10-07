import DataManagement from "../../components/data-management";

export const metadata = { title: "Tiện ích" };

export default function AmenitiesPage() {
  return <DataManagement active="/admin/amenities" title="Tiện ích" description="Xem danh sách tiện ích của tòa nhà, vị trí, thời gian hoạt động, giá sử dụng và số lượt đăng ký." endpoint="/api/amenities" searchKeys={["code", "name", "location", "property"]} summary="Tổng tiện ích" columns={[
    { key: "code", label: "Mã tiện ích" }, { key: "name", label: "Tên tiện ích" },
    { key: "property", label: "Khu vực" }, { key: "location", label: "Vị trí" },
    { key: "opensAt", label: "Mở cửa" }, { key: "closesAt", label: "Đóng cửa" },
    { key: "priceVnd", label: "Giá", format: "money" }, { key: "priceUnit", label: "Đơn vị" },
    { key: "bookings", label: "Lượt đăng ký" }, { key: "isActive", label: "Tình trạng", format: "boolean" },
  ]} fields={[
    { key: "code", label: "Mã tiện ích", required: true }, { key: "name", label: "Tên tiện ích", required: true },
    { key: "propertyId", label: "Khu vực", type: "select", optionsEndpoint: "/api/options/properties" }, { key: "location", label: "Vị trí", required: true },
    { key: "priceVnd", label: "Giá (đ)", type: "number" }, { key: "priceUnit", label: "Đơn vị tính", required: true },
    { key: "opensAt", label: "Giờ mở cửa" }, { key: "closesAt", label: "Giờ đóng cửa" },
    { key: "isActive", label: "Trạng thái", type: "select", options: [{ value: "true", label: "Đang hoạt động" }, { value: "false", label: "Tạm đóng" }] },
    { key: "capacity", label: "Sức chứa", type: "number" }, { key: "instructions", label: "Nội quy / hướng dẫn", type: "textarea" },
  ]} />;
}
