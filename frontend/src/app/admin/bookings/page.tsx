import DataManagement from "../../components/data-management";

export const metadata = { title: "Lịch đăng ký tiện ích" };

export default function AmenityBookingsPage() {
  return <DataManagement active="/admin/bookings" title="Lịch đăng ký tiện ích" description="Duyệt đăng ký, theo dõi ngày giờ sử dụng và lịch sử đặt tiện ích của cư dân." endpoint="/api/amenity-bookings" searchKeys={["amenity", "tenant", "room", "timeSlot"]} summary="Tổng lượt đăng ký" columns={[
    { key: "amenity", label: "Tiện ích" }, { key: "tenant", label: "Khách thuê" }, { key: "room", label: "Phòng" },
    { key: "useDate", label: "Ngày sử dụng", format: "date" }, { key: "timeSlot", label: "Khung giờ" },
    { key: "note", label: "Ghi chú" }, { key: "status", label: "Trạng thái", format: "status" },
  ]} fields={[
    { key: "amenityId", label: "Tiện ích", type: "select", optionsEndpoint: "/api/options/amenities", required: true },
    { key: "tenantId", label: "Khách thuê", type: "select", optionsEndpoint: "/api/options/tenants", required: true },
    { key: "roomId", label: "Phòng", type: "select", optionsEndpoint: "/api/options/rooms" },
    { key: "useDate", label: "Ngày sử dụng", type: "date", required: true }, { key: "timeSlot", label: "Khung giờ", required: true },
    { key: "note", label: "Ghi chú", type: "textarea" },
    { key: "status", label: "Trạng thái", type: "select", options: [{ value: "PENDING", label: "Chờ duyệt" }, { value: "APPROVED", label: "Đã duyệt" }, { value: "USED", label: "Đã sử dụng" }, { value: "CANCELLED", label: "Đã hủy" }, { value: "REJECTED", label: "Từ chối" }] },
  ]} defaultStatus={{ key: "status", value: "APPROVED", label: "Duyệt" }} />;
}
