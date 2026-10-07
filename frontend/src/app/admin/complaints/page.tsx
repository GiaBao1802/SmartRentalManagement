import DataManagement from "../../components/data-management";

export const metadata = { title: "Xử lý khiếu nại" };

export default function ComplaintsPage() {
  return <DataManagement active="/admin/complaints" title="Xử lý khiếu nại" description="Tiếp nhận phản ánh của cư dân, theo dõi nội dung, mức độ ưu tiên và trạng thái xử lý." endpoint="/api/maintenance-requests" searchKeys={["code", "tenant", "property", "room", "category", "content"]} summary="Tổng yêu cầu" columns={[
    { key: "code", label: "Mã yêu cầu" }, { key: "tenant", label: "Người gửi" },
    { key: "property", label: "Khu vực" }, { key: "room", label: "Phòng" },
    { key: "category", label: "Loại phản ánh" }, { key: "content", label: "Nội dung" },
    { key: "priority", label: "Ưu tiên", format: "status" }, { key: "createdAt", label: "Ngày gửi", format: "date" },
    { key: "status", label: "Trạng thái", format: "status" },
  ]} fields={[
    { key: "category", label: "Loại phản ánh", required: true }, { key: "content", label: "Nội dung", type: "textarea", required: true },
    { key: "priority", label: "Mức độ ưu tiên", type: "select", options: [{ value: "LOW", label: "Thấp" }, { value: "MEDIUM", label: "Trung bình" }, { value: "HIGH", label: "Cao" }, { value: "URGENT", label: "Khẩn cấp" }] },
    { key: "tenantId", label: "Khách thuê", type: "select", optionsEndpoint: "/api/options/tenants" },
    { key: "roomId", label: "Phòng", type: "select", optionsEndpoint: "/api/options/rooms" },
    { key: "status", label: "Trạng thái", type: "select", options: [{ value: "PENDING", label: "Chờ xử lý" }, { value: "IN_PROGRESS", label: "Đang xử lý" }, { value: "RESOLVED", label: "Đã xử lý" }, { value: "REJECTED", label: "Đã từ chối" }] },
  ]} defaultStatus={{ key: "status", value: "RESOLVED", label: "Đánh dấu đã xử lý" }} />;
}
